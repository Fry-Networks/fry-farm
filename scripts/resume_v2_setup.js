#!/usr/bin/env node
/**
 * Resume V2 staking pool setup for 10 already-created apps.
 *
 * The apps were created on-chain but the deployment script failed at
 * the MBR funding step. This script completes: MBR funding, asset
 * opt-in, reward token deposit, extra token transfer, and MongoDB
 * record creation.
 *
 * Each step is idempotent — safe to re-run after partial failures.
 *
 * Usage:
 *   cd /opt/fry-farm
 *   read -sp "Admin mnemonic: " ADMIN_MNEMONIC && echo
 *   MONGODB_URI=$(docker exec fry-farm-backend printenv MONGODB_URI) \
 *   ADMIN_MNEMONIC="$ADMIN_MNEMONIC" \
 *   NODE_PATH=./backend/node_modules \
 *   node scripts/resume_v2_setup.js [--dry-run]
 *   unset ADMIN_MNEMONIC
 */

const path = require('path');
const algosdk = require('algosdk');
const mongoose = require('mongoose');
const readline = require('readline');
const Staking = require(path.join(__dirname, '..', 'backend', 'models', 'stakingSchema'));

// ── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ADDRESS = 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE';
const ALGOD_SERVER = 'https://mainnet-api.4160.nodely.dev';
const ALGOD_TOKEN = '';
const ALGOD_PORT = '';

// V1 → V2 pool mapping (apps already created on-chain)
const POOL_MAP = [
  { v1AppId: 3468848937, v2AppId: 3476263283 },
  { v1AppId: 3469720617, v2AppId: 3476263325 },
  { v1AppId: 3470020844, v2AppId: 3476263363 },
  { v1AppId: 3473560676, v2AppId: 3476263400 },
  { v1AppId: 3473562061, v2AppId: 3476263447 },
  { v1AppId: 3473563847, v2AppId: 3476263499 },
  { v1AppId: 3473565258, v2AppId: 3476263540 },
  { v1AppId: 3473566323, v2AppId: 3476263573 },
  { v1AppId: 3473573376, v2AppId: 3476263617 },
  { v1AppId: 3473574550, v2AppId: 3476263663 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccountInfo(algodClient, address) {
  try {
    const info = await algodClient.accountInformation(address).do();
    return info;
  } catch (e) {
    // Account not found = no balance, no assets
    if (e.message?.includes('404') || e.message?.includes('not found') || e.status === 404) {
      return null;
    }
    throw e;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');

  // 1. Validate mnemonic
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) {
    console.error('ERROR: ADMIN_MNEMONIC env var is required.');
    process.exit(1);
  }

  let account;
  try {
    account = algosdk.mnemonicToSecretKey(mnemonic);
  } catch (e) {
    console.error('ERROR: Invalid mnemonic:', e.message);
    process.exit(1);
  }

  const adminAddr = account.addr.toString();
  if (adminAddr !== ADMIN_ADDRESS) {
    console.error(`ERROR: Mnemonic derives ${adminAddr}, expected ${ADMIN_ADDRESS}`);
    process.exit(1);
  }
  console.log(`Admin wallet verified: ${ADMIN_ADDRESS}`);

  // 2. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not found.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // 3. Load V1 pool data
  const v1Pools = {};
  for (const { v1AppId } of POOL_MAP) {
    const pool = await Staking.findOne({ stakingContractId: String(v1AppId) });
    if (!pool) {
      console.error(`ERROR: V1 pool ${v1AppId} not found in MongoDB`);
      await mongoose.disconnect();
      process.exit(1);
    }
    v1Pools[v1AppId] = pool;
  }
  console.log(`Loaded ${Object.keys(v1Pools).length} V1 pool records`);

  // 4. Initialize Algod client + ABI
  const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  const signer = algosdk.makeBasicAccountTransactionSigner(account);

  const arc32 = require(path.join(__dirname, '..', 'contracts', 'fry_staking_v2', 'FryStaking.arc32.json'));
  const abiContract = new algosdk.ABIContract(arc32.contract);
  const optInMethod = abiContract.getMethodByName('optInAsset');
  const assetReceiveMethod = abiContract.getMethodByName('assetReceive');

  // 5. Check current state of all pools
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  V2 Pool Resume — State Check');
  console.log('══════════════════════════════════════════════════════════════');

  const poolStates = [];
  for (const { v1AppId, v2AppId } of POOL_MAP) {
    const v1 = v1Pools[v1AppId];
    const stakeTokenId = Number(v1.stakeToken.id);
    const rewardTokenId = Number(v1.rewardToken.id);
    const isSameToken = stakeTokenId === rewardTokenId;
    const appAddress = algosdk.getApplicationAddress(BigInt(v2AppId)).toString();

    // Check on-chain state
    const info = await getAccountInfo(algodClient, appAddress);
    const algoBalance = info ? Number(info.amount) : 0;
    const assets = info ? (info.assets || []) : [];
    const hasStakeToken = assets.some(a => Number(a.assetId) === stakeTokenId);
    const hasRewardToken = assets.some(a => Number(a.assetId) === rewardTokenId);
    const optedIn = isSameToken ? hasStakeToken : (hasStakeToken && hasRewardToken);
    const rewardAsset = assets.find(a => Number(a.assetId) === rewardTokenId);
    const rewardBalance = rewardAsset ? Number(rewardAsset.amount) : 0;

    // Check MongoDB state
    const existingV2 = await Staking.findOne({ stakingContractId: String(v2AppId) });

    const lockDays = Math.round(v1.lockPeriod / 86400);
    const state = {
      v1AppId,
      v2AppId,
      appAddress,
      label: `${v1.stakeToken.name} → ${v1.rewardToken.name} (${lockDays}d)`,
      stakeTokenId,
      rewardTokenId,
      rewardTokenAmount: v1.rewardTokenAmount,
      isSameToken,
      v1Pool: v1,
      needsFunding: algoBalance === 0,
      needsOptIn: !optedIn,
      needsDeposit: rewardBalance === 0,
      needsExtra: rewardBalance < v1.rewardTokenAmount + 1_000_000,
      needsDb: !existingV2,
      algoBalance,
      rewardBalance,
    };

    poolStates.push(state);

    const status = [];
    if (!state.needsFunding) status.push('funded');
    if (!state.needsOptIn) status.push('opted-in');
    if (!state.needsDeposit) status.push('deposited');
    if (!state.needsExtra) status.push('extra-sent');
    if (!state.needsDb) status.push('db-exists');

    const done = status.length === 5;
    console.log(`  [${v2AppId}] ${state.label}`);
    console.log(`    ${done ? 'COMPLETE' : 'TODO: ' + ['fund', 'opt-in', 'deposit', 'extra', 'db'].filter((s, i) => [state.needsFunding, state.needsOptIn, state.needsDeposit, state.needsExtra, state.needsDb][i]).join(', ')}`);
  }

  const poolsNeedingWork = poolStates.filter(s =>
    s.needsFunding || s.needsOptIn || s.needsDeposit || s.needsExtra || s.needsDb
  );

  if (poolsNeedingWork.length === 0) {
    console.log('\nAll pools are fully set up. Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`\n  Pools needing work: ${poolsNeedingWork.length} / ${POOL_MAP.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to execute.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 6. Confirm
  console.log('');
  const confirmed = await askConfirmation(`Resume setup for ${poolsNeedingWork.length} pool(s)? (yes/no): `);
  if (!confirmed) {
    console.log('Aborted.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 7. Execute remaining steps for each pool
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < poolStates.length; i++) {
    const s = poolStates[i];
    const { v2AppId, appAddress, label, stakeTokenId, rewardTokenId, rewardTokenAmount, isSameToken, v1Pool } = s;

    if (!s.needsFunding && !s.needsOptIn && !s.needsDeposit && !s.needsExtra && !s.needsDb) {
      console.log(`\n── [${i + 1}/${poolStates.length}] ${label} — already complete ──`);
      results.push({ v2AppId, status: 'skipped' });
      continue;
    }

    console.log(`\n── [${i + 1}/${poolStates.length}] ${label} ──`);

    try {
      // Step B: Fund MBR
      if (s.needsFunding) {
        console.log('  Funding MBR...');
        const uniqueAssets = isSameToken ? 1 : 2;
        const mbrMicroAlgos = Math.ceil((0.1 + uniqueAssets * 0.1 + 0.1) * 1_000_000);

        const sp = await algodClient.getTransactionParams().do();
        const mbrTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: account.addr,
          receiver: appAddress,
          amount: mbrMicroAlgos,
          suggestedParams: { ...sp, fee: 2000, flatFee: true },
        });
        const signedMbr = mbrTxn.signTxn(account.sk);
        const { txid: mbrTxId } = await algodClient.sendRawTransaction(signedMbr).do();
        await algosdk.waitForConfirmation(algodClient, mbrTxId, 4);
        console.log(`  MBR funded: ${mbrMicroAlgos / 1_000_000} ALGO (${mbrTxId})`);
        await sleep(500);
      } else {
        console.log('  MBR already funded — skipping');
      }

      // Step C: Opt into assets
      if (s.needsOptIn) {
        console.log('  Opting in to assets...');
        const sp = await algodClient.getTransactionParams().do();

        const optInMbrTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: account.addr,
          receiver: appAddress,
          amount: 100_000,
          suggestedParams: { ...sp, fee: 3000, flatFee: true },
        });

        const atcOptIn = new algosdk.AtomicTransactionComposer();
        atcOptIn.addMethodCall({
          appID: v2AppId,
          method: optInMethod,
          methodArgs: [
            rewardTokenId,
            stakeTokenId,
            { txn: optInMbrTxn, signer },
          ],
          sender: account.addr,
          signer,
          suggestedParams: { ...sp, fee: isSameToken ? 3000 : 2000, flatFee: true },
          appForeignAssets: isSameToken ? [stakeTokenId] : [stakeTokenId, rewardTokenId],
        });

        await atcOptIn.execute(algodClient, 4);
        console.log('  Assets opted in');
        await sleep(500);
      } else {
        console.log('  Assets already opted in — skipping');
      }

      // Step D: Transfer reward tokens
      if (s.needsDeposit) {
        console.log(`  Transferring ${rewardTokenAmount} reward tokens...`);
        const sp = await algodClient.getTransactionParams().do();

        const rewardTransferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: account.addr,
          receiver: appAddress,
          amount: rewardTokenAmount,
          assetIndex: rewardTokenId,
          suggestedParams: { ...sp, fee: 1000, flatFee: true },
        });

        const atcReceive = new algosdk.AtomicTransactionComposer();
        atcReceive.addMethodCall({
          appID: v2AppId,
          method: assetReceiveMethod,
          methodArgs: [
            { txn: rewardTransferTxn, signer },
          ],
          sender: account.addr,
          signer,
          suggestedParams: { ...sp, fee: 1000, flatFee: true },
          appForeignAssets: [rewardTokenId],
        });

        await atcReceive.execute(algodClient, 4);
        console.log(`  Reward tokens transferred: ${rewardTokenAmount}`);
        await sleep(500);
      } else {
        console.log('  Reward tokens already deposited — skipping');
      }

      // Step E: Send extra 1 token
      if (s.needsExtra) {
        console.log('  Sending extra 1 token...');
        const sp = await algodClient.getTransactionParams().do();
        const extraTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: account.addr,
          receiver: appAddress,
          amount: 1_000_000,
          assetIndex: rewardTokenId,
          suggestedParams: { ...sp, fee: 1000, flatFee: true },
        });
        const signedExtra = extraTxn.signTxn(account.sk);
        const { txid: extraTxId } = await algodClient.sendRawTransaction(signedExtra).do();
        await algosdk.waitForConfirmation(algodClient, extraTxId, 4);
        console.log(`  Extra token sent (${extraTxId})`);
        await sleep(500);
      } else {
        console.log('  Extra token already sent — skipping');
      }

      // Step F: Create MongoDB record
      if (s.needsDb) {
        console.log('  Creating MongoDB record...');
        const startDate = Math.floor(Date.now() / 1000);
        const poolTime = v1Pool.duration;

        const newPool = await Staking.create({
          creatorId: adminAddr,
          stakeToken: { id: v1Pool.stakeToken.id, name: v1Pool.stakeToken.name },
          rewardToken: { id: v1Pool.rewardToken.id, name: v1Pool.rewardToken.name },
          stakingStartTime: startDate,
          stakingEndTime: startDate + poolTime,
          stakingTime: 0,
          duration: poolTime,
          aprRate: v1Pool.aprRate || 0,
          rewardTokenAmount: rewardTokenAmount,
          stakingContractId: String(v2AppId),
          lockPeriod: v1Pool.lockPeriod,
          contractVersion: 2,
          isGated: v1Pool.isGated || false,
          gateConfig: v1Pool.gateConfig || {},
        });

        console.log(`  DB record created: ${newPool._id}`);
      } else {
        console.log('  MongoDB record already exists — skipping');
      }

      succeeded++;
      results.push({ v2AppId, status: 'success', label });
      console.log(`  SUCCESS`);

    } catch (err) {
      failed++;
      console.error(`  FAILED: ${err.message}`);
      if (err.response?.body) {
        try {
          const body = JSON.parse(err.response.body.toString());
          console.error(`  Detail: ${JSON.stringify(body)}`);
        } catch (_) {
          console.error(`  Body: ${err.response.body.toString().substring(0, 500)}`);
        }
      }
      results.push({ v2AppId, status: 'failed', error: err.message, label });
    }
  }

  // 8. Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Resume Complete');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${results.filter(r => r.status === 'skipped').length}`);
  console.log('──────────────────────────────────────────────────────────────');

  for (const r of results) {
    const icon = r.status === 'success' ? 'OK' : r.status === 'skipped' ? '--' : 'XX';
    console.log(`  [${icon}] ${r.v2AppId} ${r.label || ''} ${r.error ? '| ' + r.error : ''}`);
  }

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
