/**
 * Vesting Seeding Cron — seeds on-chain EventVesting contracts post-event.
 *
 * Runs every 6 hours. For each ended event with on-chain vesting:
 *   1. Waits for SEED_DELAY (24h) after event end
 *   2. Decrypts the per-event caller key (AES-256-GCM)
 *   3. Checks caller ALGO balance
 *   4. Calls seed_bulk in batches of SEED_BULK_BATCH_SIZE
 *   5. Calls finalize
 *
 * Relies on eventPointsCron to mark events as 'ended' — does NOT duplicate
 * event-ending detection.
 */

const cron = require('node-cron');
const algosdk = require('algosdk');
const logger = require('../config/logger');
const Event = require('../models/eventSchema');
const EventPoints = require('../models/eventPointsSchema');
const { decryptSecretKey } = require('../services/eventCallerCrypto');
const { withFallback } = require('../services/algodService');

// ─── Tunables ───
const SEED_BULK_BATCH_SIZE = 16;
const SEED_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours (matches contract SEED_DELAY)
const BOX_MBR_PER_ENTRY = 28_100;           // microAlgo per participant box

// ─── ABI method selectors ───
const SEED_BULK_METHOD = algosdk.ABIMethod.fromSignature('seed_bulk((address,uint64)[],pay)void');
const FINALIZE_METHOD = algosdk.ABIMethod.fromSignature('finalize()void');
const ENTRIES_TYPE = algosdk.ABIType.from('(address,uint64)[]');

// ─── Main loop ───

async function processEndedVestingEvents() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SEED_DELAY_MS);

  const events = await Event.find({
    status: 'ended',
    endDate: { $lte: cutoff },
    'vesting.vestingType': 'on-chain',
    'vesting.appId': { $exists: true, $ne: null },
    'vesting.eventCallerAddress': { $exists: true, $ne: null },
    'vesting.eventCallerKey.ciphertext': { $exists: true, $ne: null },
    'vesting.seedingStatus': { $nin: ['seeded', 'finalized'] },
  });

  if (!events.length) return;

  logger.info(`Vesting seeding cron: found ${events.length} event(s) to process`);

  for (const event of events) {
    try {
      await seedEvent(event);
    } catch (err) {
      logger.error(`Vesting seeding cron: failed for event "${event.name}" (${event._id}):`, err);
      event.vesting.seedingStatus = 'failed';
      event.vesting.seedingError = err.message;
      await event.save();
    }
  }
}

async function seedEvent(event) {
  const { appId, eventCallerAddress, eventCallerKey } = event.vesting;
  const masterKey = process.env.EVENT_CALLER_MASTER_KEY;

  if (!masterKey) {
    throw new Error('EVENT_CALLER_MASTER_KEY not set');
  }

  // ── Decrypt event caller key ──
  const secretKeyBuffer = decryptSecretKey(eventCallerKey, masterKey);
  const mnemonic = algosdk.secretKeyToMnemonic(new Uint8Array(secretKeyBuffer));
  const callerAccount = algosdk.mnemonicToSecretKey(mnemonic);

  if (callerAccount.addr.toString() !== eventCallerAddress) {
    throw new Error(
      `Decrypted key address mismatch: expected ${eventCallerAddress}, ` +
      `got ${callerAccount.addr.toString()}`
    );
  }

  // ── Get participant allocations ──
  const participants = await getParticipantAllocations(event);
  if (!participants.length) {
    logger.info(`Vesting seeding: no qualified participants for "${event.name}" — marking finalized`);
    event.vesting.seedingStatus = 'finalized';
    await event.save();
    return;
  }

  // ── Check ALGO balance ──
  await withFallback(async (client) => {
    const accountInfo = await client.accountInformation(eventCallerAddress).do();
    const balance = Number(accountInfo.amount);
    const totalMbr = BOX_MBR_PER_ENTRY * participants.length;
    const batchCount = Math.ceil(participants.length / SEED_BULK_BATCH_SIZE);
    const estimatedFees = 2000 * batchCount * 2; // ~2 txns per batch
    const needed = totalMbr + estimatedFees + 100_000; // +0.1 ALGO min balance buffer

    if (balance < needed) {
      throw new Error(
        `Insufficient ALGO for event caller ${eventCallerAddress}: ` +
        `has ${balance} microAlgo, needs ~${needed} microAlgo ` +
        `(${participants.length} participants x ${BOX_MBR_PER_ENTRY} MBR + fees). ` +
        `Fund the caller account before the next cron run.`
      );
    }

    logger.info(
      `Vesting seeding: caller ${eventCallerAddress} balance OK ` +
      `(${balance} microAlgo, need ~${needed})`
    );
  });

  // ── Seed in batches ──
  event.vesting.seedingStatus = 'seeding';
  await event.save();

  const batches = [];
  for (let i = 0; i < participants.length; i += SEED_BULK_BATCH_SIZE) {
    batches.push(participants.slice(i, i + SEED_BULK_BATCH_SIZE));
  }

  logger.info(
    `Vesting seeding: ${participants.length} participants in ${batches.length} batch(es) ` +
    `for "${event.name}" (appId ${appId})`
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await withFallback(async (client) => {
      await seedBatch(client, appId, batch, callerAccount);
    });
    logger.info(`Vesting seeding: batch ${i + 1}/${batches.length} done for "${event.name}"`);
  }

  event.vesting.seedingStatus = 'seeded';
  await event.save();

  // ── Finalize ──
  await withFallback(async (client) => {
    await finalizeContract(client, appId, callerAccount);
  });

  event.vesting.seedingStatus = 'finalized';
  await event.save();
  logger.info(`Vesting seeding: finalized event "${event.name}" (appId ${appId})`);
}

// ─── On-chain calls ───

async function seedBatch(client, appId, entries, callerAccount) {
  const params = await client.getTransactionParams().do();
  const appAddr = algosdk.getApplicationAddress(appId);
  const signer = algosdk.makeBasicAccountTransactionSigner(callerAccount);

  // ABI-encoded entries: [(address, uint64), ...]
  const abiEntries = entries.map(e => [e.wallet, BigInt(e.allocation)]);

  // MBR payment transaction
  const mbrAmount = BOX_MBR_PER_ENTRY * entries.length;
  const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: callerAccount.addr,
    receiver: appAddr,
    amount: mbrAmount,
    suggestedParams: params,
  });

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: SEED_BULK_METHOD,
    methodArgs: [abiEntries, { txn: mbrPayTxn, signer }],
    sender: callerAccount.addr,
    signer,
    suggestedParams: params,
  });

  await atc.execute(client, 4);
}

async function finalizeContract(client, appId, callerAccount) {
  const params = await client.getTransactionParams().do();
  const signer = algosdk.makeBasicAccountTransactionSigner(callerAccount);

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: FINALIZE_METHOD,
    methodArgs: [],
    sender: callerAccount.addr,
    signer,
    suggestedParams: params,
  });

  await atc.execute(client, 4);
}

// ─── Allocation calculation ───

async function getParticipantAllocations(event) {
  const points = await EventPoints.find({
    eventId: event._id,
    totalPoints: { $gte: event.minPointsToQualify || 0 },
  }).sort({ totalPoints: -1 }).lean();

  if (!points.length) return [];

  const poolAmount = event.airdropPoolFry || 0;
  if (poolAmount <= 0) return [];

  const totalPointsSum = points.reduce((sum, u) => sum + u.totalPoints, 0);
  if (totalPointsSum <= 0) return [];

  // Match airdropService.js allocation logic
  const allocations = [];

  if (event.airdropDistribution === 'tiered' && event.airdropTiers?.length) {
    for (const user of points) {
      const tier = event.airdropTiers.find(
        t => user.rank >= t.rank && user.rank <= (t.rankEnd || t.rank)
      );
      const amount = tier ? (tier.rewardFry || 0) : 0;
      if (amount > 0) {
        allocations.push({
          wallet: user.wallet,
          allocation: Math.floor(amount * 1e6), // whole FRY -> microFRY
        });
      }
    }
  } else {
    // Proportional distribution
    for (const user of points) {
      const share = (user.totalPoints / totalPointsSum) * poolAmount;
      if (share > 0) {
        allocations.push({
          wallet: user.wallet,
          allocation: Math.floor(share * 1e6), // whole FRY -> microFRY
        });
      }
    }
  }

  return allocations;
}

// ─── Register ───

cron.schedule('0 */6 * * *', async () => {
  const start = Date.now();
  logger.info('Vesting seeding cron: starting');
  try {
    await processEndedVestingEvents();
  } catch (error) {
    logger.error('Vesting seeding cron: error:', error);
  }
  logger.info(`Vesting seeding cron: completed in ${Date.now() - start}ms`);
});

logger.info('Vesting seeding cron: registered (every 6 hours)');
