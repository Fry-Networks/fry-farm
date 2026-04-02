#!/usr/bin/env node
/**
 * Deploy V2 staking pools for all active V1 pools.
 *
 * Reads V1 pool parameters from MongoDB, deploys matching V2 contracts
 * on Algorand mainnet, and creates backend records.
 *
 * Usage:
 *   cd /opt/fry-farm
 *   read -sp "Admin mnemonic: " ADMIN_MNEMONIC && echo
 *   ADMIN_MNEMONIC="$ADMIN_MNEMONIC" NODE_PATH=./backend/node_modules node scripts/create_v2_pools.js [--dry-run]
 *   unset ADMIN_MNEMONIC
 */

const path = require('path');
// require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const algosdk = require('algosdk');
const mongoose = require('mongoose');
const readline = require('readline');
const Staking = require(path.join(__dirname, '..', 'backend', 'models', 'stakingSchema'));

// ── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ADDRESS = 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE';
const ALGOD_SERVER = 'https://mainnet-api.4160.nodely.dev';
const ALGOD_TOKEN = '';
const ALGOD_PORT = '';

// Pre-compiled bytecode from FryStakingV2Compiled.ts
const b64ToBytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

const COMPILED_APPROVAL = b64ToBytes(
  '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',
);

const COMPILED_CLEAR = b64ToBytes('C4EBQw==');

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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');

  // 1. Validate mnemonic
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) {
    console.error('ERROR: ADMIN_MNEMONIC env var is required.');
    console.error('Usage: ADMIN_MNEMONIC="word1 word2 ..." node scripts/create_v2_pools.js [--dry-run]');
    process.exit(1);
  }

  let account;
  try {
    account = algosdk.mnemonicToSecretKey(mnemonic);
  } catch (e) {
    console.error('ERROR: Invalid mnemonic:', e.message);
    process.exit(1);
  }

  if (account.addr.toString() !== ADMIN_ADDRESS) {
    console.error(`ERROR: Mnemonic derives ${account.addr}, expected ${ADMIN_ADDRESS}`);
    process.exit(1);
  }
  console.log(`Admin wallet verified: ${ADMIN_ADDRESS}`);

  // 2. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not found. Ensure backend/.env is correct.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // 3. Find V1 pools that need V2 replacements
  const allPools = await Staking.find({});
  const now = Math.floor(Date.now() / 1000);

  const v1Active = [];
  const v1Expired = [];
  for (const p of allPools) {
    const ver = p.contractVersion || 1;
    if (ver !== 1) continue;
    if (p.stakingEndTime && p.stakingEndTime < now) {
      v1Expired.push(p);
    } else {
      v1Active.push(p);
    }
  }
  const v1Pools = v1Active;

  const v2Pools = allPools.filter(p => p.contractVersion === 2);

  // Check which V1 pools already have a matching V2 pool (same token pair + lock period)
  const poolsToCreate = [];
  const poolsSkipped = [];

  for (const pool of v1Pools) {
    const hasMatch = v2Pools.some(v2 =>
      v2.stakeToken.id === pool.stakeToken.id &&
      v2.rewardToken.id === pool.rewardToken.id &&
      v2.lockPeriod === pool.lockPeriod
    );
    if (hasMatch) {
      poolsSkipped.push(pool);
    } else {
      poolsToCreate.push(pool);
    }
  }

  // 4. Display summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  V2 Pool Deployment Summary');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Total pools in DB:     ${allPools.length}`);
  console.log(`  V1 pools (active):     ${v1Pools.length}`);
  console.log(`  V1 pools (expired):    ${v1Expired.length}`);
  console.log(`  Already have V2 match: ${poolsSkipped.length}`);
  console.log(`  To deploy:             ${poolsToCreate.length}`);
  console.log('──────────────────────────────────────────────────────────────');

  const printPool = (pool) => {
    const lockDays = Math.round(pool.lockPeriod / 86400);
    const durationDays = Math.round(pool.duration / 86400);
    console.log(`  [${pool.stakingContractId}] ${pool.stakeToken.name} → ${pool.rewardToken.name}`);
    console.log(`    Lock: ${lockDays}d | Duration: ${durationDays}d | Stakers: ${pool.totalStakers} | Rewards: ${pool.rewardTokenAmount}`);
  };

  if (poolsToCreate.length > 0) {
    console.log('\nTo deploy:');
    for (const pool of poolsToCreate) printPool(pool);
  }

  if (poolsSkipped.length > 0) {
    console.log('\nSkipped (already have V2 match):');
    for (const pool of poolsSkipped) printPool(pool);
  }

  if (v1Expired.length > 0) {
    console.log('\nExpired (not eligible):');
    for (const pool of v1Expired) printPool(pool);
  }

  if (poolsToCreate.length === 0) {
    console.log('\nNothing to deploy. All active V1 pools already have V2 matches.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to deploy.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 5. Confirm
  console.log('');
  const confirmed = await askConfirmation(`Deploy ${poolsToCreate.length} V2 pool(s)? (yes/no): `);
  if (!confirmed) {
    console.log('Aborted.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 6. Initialize Algod client
  const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  const signer = algosdk.makeBasicAccountTransactionSigner(account);

  // Load ABI contract from ARC-32
  const arc32 = require(path.join(__dirname, '..', 'contracts', 'fry_staking_v2', 'FryStaking.arc32.json'));
  const abiContract = new algosdk.ABIContract(arc32.contract);
  const initMethod = abiContract.getMethodByName('init_staking');
  const optInMethod = abiContract.getMethodByName('optInAsset');
  const assetReceiveMethod = abiContract.getMethodByName('assetReceive');

  // 7. Deploy each pool
  const results = [];
  let deployed = 0;
  let failed = 0;

  for (let i = 0; i < poolsToCreate.length; i++) {
    const pool = poolsToCreate[i];
    const label = `[${i + 1}/${poolsToCreate.length}] ${pool.stakeToken.name}→${pool.rewardToken.name} (lock: ${Math.round(pool.lockPeriod / 86400)}d)`;

    console.log(`\n── Deploying ${label} ──`);

    try {
      const stakeTokenId = Number(pool.stakeToken.id);
      const rewardTokenId = Number(pool.rewardToken.id);
      const rewardTokenAmount = pool.rewardTokenAmount;
      const lockPeriod = pool.lockPeriod;
      const poolTime = pool.duration;
      const startDate = Math.floor(Date.now() / 1000);
      const isSameToken = stakeTokenId === rewardTokenId;

      // ── Step A: Create application ──
      console.log('  Creating application...');
      const suggestedParams = await algodClient.getTransactionParams().do();

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: 0,
        method: initMethod,
        methodArgs: [
          account.addr,
          stakeTokenId,
          rewardTokenId,
          rewardTokenAmount,
          BigInt(startDate),
          BigInt(startDate + poolTime),
          lockPeriod,
          poolTime,
        ],
        approvalProgram: COMPILED_APPROVAL,
        clearProgram: COMPILED_CLEAR,
        numGlobalInts: 12,
        numGlobalByteSlices: 1,
        numLocalInts: 0,
        numLocalByteSlices: 0,
        sender: account.addr,
        signer,
        suggestedParams,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
      });

      const createResult = await atc.execute(algodClient, 4);
      const createdAppId = createResult.methodResults[0].txInfo?.applicationIndex;
      if (!createdAppId) {
        throw new Error('No application-index in create result');
      }
      const appAddress = algosdk.getApplicationAddress(BigInt(createdAppId)).toString();
      console.log(`  App created: ${createdAppId} (${appAddress})`);

      // ── Step B: Fund MBR ──
      console.log('  Funding MBR...');
      const uniqueAssets = isSameToken ? 1 : 2;
      const mbrMicroAlgos = Math.ceil((0.1 + uniqueAssets * 0.1 + 0.1) * 1_000_000);

      const sp1 = await algodClient.getTransactionParams().do();
      const mbrTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: account.addr,
        receiver: appAddress,
        amount: mbrMicroAlgos,
        suggestedParams: { ...sp1, fee: 2000, flatFee: true },
      });
      const signedMbr = mbrTxn.signTxn(account.sk);
      const { txid: mbrTxId } = await algodClient.sendRawTransaction(signedMbr).do();
      await algosdk.waitForConfirmation(algodClient, mbrTxId, 4);
      console.log(`  MBR funded: ${mbrMicroAlgos / 1_000_000} ALGO`);

      await sleep(500);

      // ── Step C: Opt-in to assets ──
      console.log('  Opting in to assets...');
      const sp2 = await algodClient.getTransactionParams().do();

      const optInMbrTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: account.addr,
        receiver: appAddress,
        amount: 100_000,
        suggestedParams: { ...sp2, fee: 3000, flatFee: true },
      });

      const atcOptIn = new algosdk.AtomicTransactionComposer();
      atcOptIn.addMethodCall({
        appID: createdAppId,
        method: optInMethod,
        methodArgs: [
          rewardTokenId,
          stakeTokenId,
          { txn: optInMbrTxn, signer },
        ],
        sender: account.addr,
        signer,
        suggestedParams: { ...sp2, fee: isSameToken ? 3000 : 2000, flatFee: true },
        ...(isSameToken ? { appForeignAssets: [stakeTokenId] } : {}),
      });

      await atcOptIn.execute(algodClient, 4);
      console.log('  Assets opted in');

      await sleep(500);

      // ── Step D: Transfer reward tokens ──
      console.log('  Transferring reward tokens...');
      const sp3 = await algodClient.getTransactionParams().do();

      const rewardTransferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: account.addr,
        receiver: appAddress,
        amount: rewardTokenAmount,
        assetIndex: rewardTokenId,
        suggestedParams: { ...sp3, fee: 1000, flatFee: true },
      });

      const atcReceive = new algosdk.AtomicTransactionComposer();
      atcReceive.addMethodCall({
        appID: createdAppId,
        method: assetReceiveMethod,
        methodArgs: [
          { txn: rewardTransferTxn, signer },
        ],
        sender: account.addr,
        signer,
        suggestedParams: { ...sp3, fee: 1000, flatFee: true },
      });

      await atcReceive.execute(algodClient, 4);
      console.log(`  Reward tokens transferred: ${rewardTokenAmount}`);

      await sleep(500);

      // ── Step E: Send extra 1 token (matching frontend logic) ──
      console.log('  Sending extra 1 token...');
      const sp4 = await algodClient.getTransactionParams().do();
      const extraTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: account.addr,
        receiver: appAddress,
        amount: 1_000_000,
        assetIndex: rewardTokenId,
        suggestedParams: { ...sp4, fee: 1000, flatFee: true },
      });
      const signedExtra = extraTxn.signTxn(account.sk);
      const { txid: extraTxId } = await algodClient.sendRawTransaction(signedExtra).do();
      await algosdk.waitForConfirmation(algodClient, extraTxId, 4);

      // ── Step F: Create MongoDB record ──
      console.log('  Creating backend record...');
      const newPool = await Staking.create({
        creatorId: account.addr.toString(),
        stakeToken: { id: pool.stakeToken.id, name: pool.stakeToken.name },
        rewardToken: { id: pool.rewardToken.id, name: pool.rewardToken.name },
        stakingStartTime: startDate,
        stakingEndTime: startDate + poolTime,
        stakingTime: 0,
        duration: poolTime,
        aprRate: pool.aprRate || 0,
        rewardTokenAmount: rewardTokenAmount,
        stakingContractId: String(createdAppId),
        lockPeriod: lockPeriod,
        contractVersion: 2,
        isGated: pool.isGated || false,
        gateConfig: pool.gateConfig || {},
      });

      console.log(`  DB record created: ${newPool._id}`);

      results.push({
        v1AppId: pool.stakingContractId,
        v2AppId: createdAppId,
        mongoId: String(newPool._id),
        stakeToken: pool.stakeToken.name,
        rewardToken: pool.rewardToken.name,
        lockPeriod: lockPeriod,
      });
      deployed++;
      console.log(`  SUCCESS: V1 ${pool.stakingContractId} → V2 ${createdAppId}`);

    } catch (err) {
      failed++;
      console.error(`  FAILED: ${err.message}`);
      results.push({
        v1AppId: pool.stakingContractId,
        error: err.message,
        stakeToken: pool.stakeToken.name,
        rewardToken: pool.rewardToken.name,
      });
    }
  }

  // 8. Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Deployment Complete');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Deployed: ${deployed}`);
  console.log(`  Skipped:  ${poolsSkipped.length}`);
  console.log(`  Failed:   ${failed}`);

  if (results.length > 0) {
    console.log('\nResults:');
    console.log(JSON.stringify(results, null, 2));
  }

  // Cleanup
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
