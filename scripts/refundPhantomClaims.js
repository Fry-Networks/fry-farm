#!/usr/bin/env node
/**
 * Refund FRY fees charged on phantom claims (V1 staking pools).
 *
 * Phantom claim = user called claimTokens on a V1 pool, received 0 reward,
 * but still paid the platform fee (a separate, non-atomic ASA transfer).
 *
 * Two-phase workflow:
 *   scan   — query on-chain + DB, write manifest JSON
 *   refund — read manifest, send FRY refunds (dry-run by default)
 *
 * Usage (runs inside fry-farm-backend container):
 *
 *   # Copy script into container
 *   docker cp scripts/refundPhantomClaims.js fry-farm-backend:/app/scripts/
 *
 *   # Phase 1: scan
 *   docker exec fry-farm-backend node scripts/refundPhantomClaims.js scan
 *
 *   # Phase 2: dry-run (copy manifest out, review, then run refund)
 *   docker cp fry-farm-backend:/app/scripts/phantom_claims_manifest.json scripts/
 *   ADMIN_MNEMONIC="..." docker exec -e ADMIN_MNEMONIC fry-farm-backend \
 *     node scripts/refundPhantomClaims.js refund
 *
 *   # Phase 2: execute
 *   read -sp "Admin mnemonic: " ADMIN_MNEMONIC && echo
 *   export ADMIN_MNEMONIC
 *   docker exec -e ADMIN_MNEMONIC fry-farm-backend \
 *     node scripts/refundPhantomClaims.js refund --execute
 *   unset ADMIN_MNEMONIC
 *
 *   # Copy results out
 *   docker cp fry-farm-backend:/app/scripts/phantom_claims_manifest.json scripts/
 *   docker cp fry-farm-backend:/app/scripts/phantom_claims_refund_log.json scripts/
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const algosdk = require('algosdk');
const mongoose = require('mongoose');
const readline = require('readline');
const fs = require('fs');

// Resolve models — works both inside container (/app/scripts/../models/)
// and on host with NODE_PATH=./backend/node_modules
const modelsDir = fs.existsSync(path.join(__dirname, '..', 'models'))
  ? path.join(__dirname, '..', 'models')                    // inside container
  : path.join(__dirname, '..', 'backend', 'models');         // host

const Staking = require(path.join(modelsDir, 'stakingSchema'));
const GasFee = require(path.join(modelsDir, 'gasFeeSchema'));
const ClaimReward = require(path.join(modelsDir, 'claimRewardSchema'));

// ── Constants ────────────────────────────────────────────────────────────────

const FRY_ASA_ID = 2485314946;
const FEE_RECIPIENT = 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE';
const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const ALGOD_SERVER = 'https://mainnet-api.4160.nodely.dev';
const CLAIM_SELECTOR_B64 = '/ZtclA=='; // sha512_256("claimTokens(uint64)void")[0:4] = 0xfd9b5c94

const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'phantom_claims_manifest.json');
const DEFAULT_REFUND_LOG_PATH = path.join(__dirname, 'phantom_claims_refund_log.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

/**
 * Paginate through all indexer results for a given URL.
 * Yields arrays of transactions per page.
 */
async function* paginateIndexer(baseUrl, limit = 500) {
  let url = `${baseUrl}&limit=${limit}`;
  while (url) {
    const data = await fetchJson(url);
    if (!data || !data.transactions || data.transactions.length === 0) break;
    yield data.transactions;
    if (data['next-token']) {
      url = `${baseUrl}&limit=${limit}&next=${encodeURIComponent(data['next-token'])}`;
    } else {
      break;
    }
    await sleep(200);
  }
}

// ── Phase 1: Scan ────────────────────────────────────────────────────────────

async function scanPhantomClaims(outputPath) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('FATAL: MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Step 1: Get V1 pools
  console.log('--- Step 1: Finding V1 staking pools ---');
  const v1Pools = await Staking.find({
    $or: [
      { contractVersion: 1 },
      { contractVersion: { $exists: false } },
      { contractVersion: null },
    ],
  }).lean();

  console.log(`  Found ${v1Pools.length} V1 pool(s)\n`);

  if (v1Pools.length === 0) {
    console.log('No V1 pools found. Nothing to scan.');
    await mongoose.disconnect();
    return;
  }

  for (const p of v1Pools) {
    const appId = p.stakingContractId || p.appId;
    const name = `${p.stakeToken?.name || '?'} -> ${p.rewardToken?.name || '?'}`;
    console.log(`  [${appId}] ${name}`);
  }

  // Step 2: Query gasFee records for claim fees
  console.log('\n--- Step 2: Querying gasFee records (stakingClaim) ---');
  const gasFeeByPool = {};

  for (const pool of v1Pools) {
    const appId = Number(pool.stakingContractId || pool.appId);
    if (!appId) continue;
    const fees = await GasFee.find({ appId, gasType: 'stakingClaim' }).lean();
    if (fees.length > 0) {
      gasFeeByPool[appId] = fees;
      console.log(`  [${appId}] ${fees.length} fee record(s)`);
    }
  }

  const totalFeeRecords = Object.values(gasFeeByPool).reduce((s, a) => s + a.length, 0);
  console.log(`  Total fee records: ${totalFeeRecords}`);

  // Step 3: Query claimrewards for zero-reward claims
  console.log('\n--- Step 3: Querying claimrewards (rewardClaimed = 0) ---');
  const zeroClaims = {};

  for (const pool of v1Pools) {
    const poolId = String(pool._id);
    const claims = await ClaimReward.find({ poolId, rewardClaimed: 0 }).lean();
    if (claims.length > 0) {
      zeroClaims[poolId] = claims;
      const appId = pool.stakingContractId || pool.appId;
      console.log(`  [${appId}] ${claims.length} zero-reward claim(s)`);
    }
  }

  const totalZeroClaims = Object.values(zeroClaims).reduce((s, a) => s + a.length, 0);
  console.log(`  Total zero-reward claims in DB: ${totalZeroClaims}`);

  // Step 4: Verify on-chain
  console.log('\n--- Step 4: On-chain verification via indexer ---');
  const phantomClaims = [];
  const seenKeys = new Set();

  for (const pool of v1Pools) {
    const appId = Number(pool.stakingContractId || pool.appId);
    if (!appId) continue;
    const poolName = `${pool.stakeToken?.name || '?'} -> ${pool.rewardToken?.name || '?'}`;

    console.log(`\n  Scanning pool ${appId} (${poolName})...`);

    let claimCount = 0;
    let phantomCount = 0;

    const baseUrl = `${INDEXER_BASE}/v2/transactions?application-id=${appId}&tx-type=appl`;

    for await (const txns of paginateIndexer(baseUrl)) {
      for (const txn of txns) {
        const args = txn['application-transaction']?.['application-args'] || [];
        if (args.length === 0) continue;

        // Check if this is a claimTokens call
        if (args[0] !== CLAIM_SELECTOR_B64) continue;

        claimCount++;
        const sender = txn.sender;
        const claimRound = txn['confirmed-round'];
        const claimTime = txn['round-time'];
        const claimTxId = txn.id;

        // Check inner txns for reward
        const innerTxns = txn['inner-txns'] || [];
        let rewardSent = 0;
        for (const inner of innerTxns) {
          if (inner['tx-type'] === 'axfer') {
            rewardSent += inner['asset-transfer-transaction']?.amount || 0;
          }
        }

        // Only interested in 0-reward claims
        if (rewardSent > 0) continue;

        // Look for fee payment in the transaction group
        let feePaid = 0;
        let feeTxId = '';

        // Check if there's a group — fee may be in the same atomic group
        if (txn.group) {
          const groupData = await fetchJson(
            `${INDEXER_BASE}/v2/transactions?group-id=${encodeURIComponent(txn.group)}`
          );
          if (groupData?.transactions) {
            for (const gt of groupData.transactions) {
              if (gt.id === claimTxId) continue;
              if (gt['tx-type'] === 'axfer') {
                const att = gt['asset-transfer-transaction'];
                if (att && att.receiver === FEE_RECIPIENT && att.amount > 0) {
                  feePaid = att.amount;
                  feeTxId = gt.id;
                  break;
                }
              }
            }
          }
          await sleep(200);
        }

        // If no group fee, search sender's txns near the claim round
        if (feePaid === 0) {
          const userTxnsUrl = `${INDEXER_BASE}/v2/accounts/${sender}/transactions?asset-id=${FRY_ASA_ID}&min-round=${claimRound}&max-round=${claimRound + 5}&limit=20`;
          const userTxns = await fetchJson(userTxnsUrl);
          if (userTxns?.transactions) {
            for (const ut of userTxns.transactions) {
              if (ut.id === claimTxId) continue;
              if (ut['tx-type'] === 'axfer' && ut.sender === sender) {
                const att = ut['asset-transfer-transaction'];
                if (att && att.receiver === FEE_RECIPIENT && att.amount > 0) {
                  feePaid = att.amount;
                  feeTxId = ut.id;
                  break;
                }
              }
            }
          }
          await sleep(200);
        }

        // Only record if a fee was actually paid
        if (feePaid === 0) continue;

        // Dedup by claim txn ID
        const key = `${sender}|${claimTxId}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // Cross-reference with DB
        const dbGasFee = (gasFeeByPool[appId] || []).find(
          (f) => f.userId === sender && (f.txId === feeTxId || !f.txId)
        );
        const dbClaim = (zeroClaims[String(pool._id)] || []).find(
          (c) => c.walletId === sender
        );

        let source = 'onchain';
        if (dbGasFee) source += '+gasFee';
        if (dbClaim) source += '+claimReward';

        phantomClaims.push({
          wallet: sender,
          poolAppId: appId,
          poolName,
          claimTxId,
          claimRound,
          claimTime: new Date(claimTime * 1000).toISOString(),
          feeTxId,
          feeAmountMicro: feePaid,
          feeAmountHuman: feePaid / 1_000_000,
          source,
        });

        phantomCount++;
        console.log(
          `    [phantom] ${sender.slice(0, 8)}... fee: ${(feePaid / 1_000_000).toFixed(6)} FRY (${source})`
        );
      }
    }

    console.log(`  Pool ${appId}: ${claimCount} total claims, ${phantomCount} phantom claims`);
  }

  // Step 5: Aggregate by wallet (for summary) and write manifest
  console.log('\n--- Step 5: Writing manifest ---');

  const totalFryMicro = phantomClaims.reduce((sum, c) => sum + c.feeAmountMicro, 0);

  // Aggregate per wallet for summary
  const byWallet = {};
  for (const c of phantomClaims) {
    if (!byWallet[c.wallet]) byWallet[c.wallet] = { count: 0, totalMicro: 0 };
    byWallet[c.wallet].count++;
    byWallet[c.wallet].totalMicro += c.feeAmountMicro;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalRefunds: phantomClaims.length,
    totalFryMicro,
    totalFryHuman: totalFryMicro / 1_000_000,
    uniqueWallets: Object.keys(byWallet).length,
    phantomClaims,
  };

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest written to: ${outputPath}`);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  SCAN SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Phantom claims found:  ${phantomClaims.length}`);
  console.log(`  Unique wallets:        ${Object.keys(byWallet).length}`);
  console.log(`  Total FRY to refund:   ${(totalFryMicro / 1_000_000).toFixed(6)} FRY`);
  console.log(`${'='.repeat(60)}`);

  if (Object.keys(byWallet).length > 0) {
    console.log('\n  Per-wallet breakdown:');
    for (const [wallet, info] of Object.entries(byWallet)) {
      console.log(`    ${wallet.slice(0, 12)}...${wallet.slice(-6)}  ${info.count} claim(s)  ${(info.totalMicro / 1_000_000).toFixed(6)} FRY`);
    }
  }

  await mongoose.disconnect();
}

// ── Phase 2: Refund ──────────────────────────────────────────────────────────

async function executeRefunds(manifestPath, refundLogPath, execute) {
  // 1. Read manifest
  if (!fs.existsSync(manifestPath)) {
    console.error(`FATAL: Manifest not found at ${manifestPath}`);
    console.error('Run the scan phase first: node scripts/refundPhantomClaims.js scan');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const claims = manifest.phantomClaims || [];

  if (claims.length === 0) {
    console.log('No phantom claims in manifest. Nothing to refund.');
    return;
  }

  // 2. Read/create refund log
  let refundLog = { refunded: {} };
  if (fs.existsSync(refundLogPath)) {
    refundLog = JSON.parse(fs.readFileSync(refundLogPath, 'utf-8'));
  }

  // 3. Derive wallet
  const adminMnemonic = process.env.ADMIN_MNEMONIC;
  if (!adminMnemonic) {
    console.error('FATAL: ADMIN_MNEMONIC env var is required.');
    console.error('Usage: ADMIN_MNEMONIC="..." node scripts/refundPhantomClaims.js refund [--execute]');
    process.exit(1);
  }

  let account;
  try {
    account = algosdk.mnemonicToSecretKey(adminMnemonic);
  } catch (e) {
    console.error('FATAL: Invalid mnemonic:', e.message);
    process.exit(1);
  }
  const treasuryAddr = account.addr.toString();
  console.log(`Treasury wallet: ${treasuryAddr}`);

  // 4. Classify claims
  const pending = [];
  const alreadyDone = [];

  for (const claim of claims) {
    const key = `${claim.wallet}|${claim.claimTxId}`;
    if (refundLog.refunded[key]) {
      alreadyDone.push(claim);
    } else {
      pending.push(claim);
    }
  }

  // 5. Display summary
  const totalPendingMicro = pending.reduce((sum, c) => sum + c.feeAmountMicro, 0);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  REFUND ${execute ? 'EXECUTION' : 'DRY RUN'}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Manifest:          ${manifestPath}`);
  console.log(`  Generated at:      ${manifest.generatedAt}`);
  console.log(`  Total claims:      ${claims.length}`);
  console.log(`  Already refunded:  ${alreadyDone.length}`);
  console.log(`  Pending:           ${pending.length}`);
  console.log(`  FRY to send:       ${(totalPendingMicro / 1_000_000).toFixed(6)} FRY`);
  console.log(`${'─'.repeat(60)}`);

  if (pending.length > 0) {
    console.log('\n  Pending refunds:');
    for (const c of pending) {
      console.log(
        `    ${c.wallet.slice(0, 12)}...${c.wallet.slice(-6)}  ${(c.feeAmountMicro / 1_000_000).toFixed(6)} FRY  pool:${c.poolAppId}  (${c.source})`
      );
    }
  }

  if (pending.length === 0) {
    console.log('\nAll claims already refunded. Nothing to do.');
    return;
  }

  if (!execute) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('  DRY RUN — no transactions sent.');
    console.log('  Add --execute to send refunds.');
    console.log(`${'='.repeat(60)}`);
    return;
  }

  // 6. Balance check
  const algodClient = new algosdk.Algodv2('', ALGOD_SERVER, '');

  let availableBalance;
  try {
    const acctInfo = await algodClient.accountAssetInformation(treasuryAddr, FRY_ASA_ID).do();
    availableBalance = acctInfo.assetHolding ? Number(acctInfo.assetHolding.amount) : 0;
  } catch (e) {
    console.error(`FATAL: Could not query treasury balance: ${e.message}`);
    process.exit(1);
  }

  console.log(`\n  Treasury FRY balance: ${(availableBalance / 1_000_000).toFixed(6)} FRY`);
  console.log(`  Required:            ${(totalPendingMicro / 1_000_000).toFixed(6)} FRY`);

  if (availableBalance < totalPendingMicro) {
    console.error(`\nFATAL: Insufficient FRY balance. Need ${totalPendingMicro}, have ${availableBalance}.`);
    process.exit(1);
  }

  // 7. Double confirmation
  console.log('');
  const answer1 = await askQuestion(
    `Send ${(totalPendingMicro / 1_000_000).toFixed(6)} FRY to ${pending.length} wallet(s)? Type "yes" to continue: `
  );
  if (answer1.toLowerCase() !== 'yes') {
    console.log('Aborted.');
    return;
  }

  const answer2 = await askQuestion('Type "CONFIRM REFUNDS" to execute: ');
  if (answer2 !== 'CONFIRM REFUNDS') {
    console.log('Aborted.');
    return;
  }

  // 8. Execute refunds
  console.log('\n--- Sending refunds ---');
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < pending.length; i++) {
    const claim = pending[i];
    const key = `${claim.wallet}|${claim.claimTxId}`;
    const label = `[${i + 1}/${pending.length}] ${claim.wallet.slice(0, 8)}...`;

    // Double-check idempotency (in case log was updated externally)
    if (refundLog.refunded[key]) {
      console.log(`  ${label} [skip] already refunded`);
      skipped++;
      continue;
    }

    try {
      const params = await algodClient.getTransactionParams().do();
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: claim.wallet,
        amount: claim.feeAmountMicro,
        assetIndex: FRY_ASA_ID,
        suggestedParams: params,
      });
      const signedTxn = txn.signTxn(account.sk);
      const { txid } = await algodClient.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(algodClient, txid, 4);

      // Log the refund
      refundLog.refunded[key] = {
        txId: txid,
        wallet: claim.wallet,
        amount: claim.feeAmountMicro,
        poolAppId: claim.poolAppId,
        at: new Date().toISOString(),
      };
      fs.writeFileSync(refundLogPath, JSON.stringify(refundLog, null, 2));

      successful++;
      console.log(
        `  ${label} [sent] ${(claim.feeAmountMicro / 1_000_000).toFixed(6)} FRY — txId: ${txid}`
      );

      // Rate limit
      if (i < pending.length - 1) await sleep(500);
    } catch (err) {
      failed++;
      console.error(`  ${label} [FAIL] ${err.message}`);
    }
  }

  // 9. Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  REFUND SUMMARY (EXECUTED)');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed:     ${failed}`);
  console.log(`  Skipped:    ${skipped + alreadyDone.length}`);
  console.log(`  Refund log: ${refundLogPath}`);
  console.log(`${'='.repeat(60)}`);

  if (failed > 0) {
    console.log('\n  Re-run with --execute to retry failed refunds.');
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];

  if (!command || !['scan', 'refund'].includes(command)) {
    console.log('Usage:');
    console.log('  node scripts/refundPhantomClaims.js scan    [--output <path>]');
    console.log('  node scripts/refundPhantomClaims.js refund  [--manifest <path>] [--execute]');
    console.log('');
    console.log('Phase 1 (scan):');
    console.log('  Queries on-chain + DB for phantom claims, writes manifest JSON.');
    console.log('  --output <path>    Manifest output path (default: scripts/phantom_claims_manifest.json)');
    console.log('');
    console.log('Phase 2 (refund):');
    console.log('  Reads manifest, sends FRY refunds. Dry-run by default.');
    console.log('  --manifest <path>  Manifest input path (default: scripts/phantom_claims_manifest.json)');
    console.log('  --execute          Actually send transactions (default: dry-run)');
    console.log('');
    console.log('Env vars required for refund: ADMIN_MNEMONIC');
    process.exit(1);
  }

  if (command === 'scan') {
    const outputIdx = process.argv.indexOf('--output');
    const outputPath = outputIdx !== -1 ? process.argv[outputIdx + 1] : DEFAULT_MANIFEST_PATH;
    await scanPhantomClaims(outputPath);
  } else if (command === 'refund') {
    const manifestIdx = process.argv.indexOf('--manifest');
    const manifestPath = manifestIdx !== -1 ? process.argv[manifestIdx + 1] : DEFAULT_MANIFEST_PATH;
    const refundLogPath = manifestPath.replace(/manifest\.json$/, 'refund_log.json') || DEFAULT_REFUND_LOG_PATH;
    const execute = process.argv.includes('--execute');
    await executeRefunds(manifestPath, refundLogPath, execute);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
