#!/usr/bin/env node
/**
 * Deploy a FryArc200Staking pool on-chain and record it in MongoDB.
 *
 * Usage:
 *   node scripts/deployArc200Pool.js \
 *     --chain voi-mainnet \
 *     --lpTokenApp 411234 \
 *     --rewardToken 48968653 \
 *     --rewardTokenType 1 \
 *     --rewardAmount 100000000 \
 *     --duration 2592000 \
 *     --aprRate 10 \
 *     --lockPeriod 0
 *
 * rewardTokenType: 0=native, 1=ASA, 2=ARC-200
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const algosdk = require('algosdk');
const mongoose = require('mongoose');
const { withFallbackForChain } = require('../services/algodService');
const { getChainConfig } = require('../config/chains');

/** Load chain-specific treasury wallet */
function getTreasury(chainId) {
  if (chainId === 'voi-mainnet') {
    if (!process.env.VOI_REWARD_MNEMONIC) throw new Error('VOI_REWARD_MNEMONIC not set');
    const account = algosdk.mnemonicToSecretKey(process.env.VOI_REWARD_MNEMONIC);
    return { addr: account.addr, sk: account.sk };
  }
  if (!process.env.REWARD_MNEMONIC || !process.env.REWARD_REKEY) throw new Error('REWARD_MNEMONIC/REWARD_REKEY not set');
  const ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  const rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  return { addr: ogAccount.addr, sk: rekeyAccount.sk };
}

// ── Parse CLI args ──────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    args[key] = process.argv[i + 1];
  }
  return {
    chain: args.chain || 'voi-mainnet',
    lpTokenApp: parseInt(args.lpTokenApp, 10),
    rewardToken: parseInt(args.rewardToken, 10),
    rewardTokenType: parseInt(args.rewardTokenType ?? '0', 10),  // 0=native, 1=ASA, 2=ARC-200
    rewardAmount: parseInt(args.rewardAmount, 10),
    duration: parseInt(args.duration, 10),
    aprRate: parseFloat(args.aprRate),
    lockPeriod: parseInt(args.lockPeriod ?? '0', 10),
  };
}

function makeSigner(addr, sk) {
  return algosdk.makeBasicAccountTransactionSigner({ addr, sk });
}

// ── Compile TEAL to bytecode ────────────────────────────────────────────

async function compileTeal(client, tealSource) {
  const result = await client.compile(tealSource).do();
  return new Uint8Array(Buffer.from(result.result, 'base64'));
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  if (!opts.lpTokenApp) throw new Error('--lpTokenApp is required');
  if (isNaN(opts.rewardAmount)) throw new Error('--rewardAmount is required');

  const rewardTypeNames = { 0: 'NATIVE', 1: 'ASA', 2: 'ARC-200' };
  console.log('=== FryArc200Staking Pool Deployment ===');
  console.log(`Chain:            ${opts.chain}`);
  console.log(`LP Token App:     ${opts.lpTokenApp} (ARC-200)`);
  console.log(`Reward Token:     ${opts.rewardToken} (${rewardTypeNames[opts.rewardTokenType]})`);
  console.log(`Reward Amount:    ${opts.rewardAmount}`);
  console.log(`Duration:         ${opts.duration}s (${(opts.duration / 86400).toFixed(1)} days)`);
  console.log(`APR Rate:         ${opts.aprRate}%`);
  console.log(`Lock Period:      ${opts.lockPeriod}s`);
  console.log();

  const { addr: treasuryAddr, sk: treasurySk } = getTreasury(opts.chain);
  const treasuryStr = treasuryAddr.toString();
  console.log(`Treasury: ${treasuryStr}`);

  const signer = makeSigner(treasuryAddr, treasurySk);
  const chainConfig = getChainConfig(opts.chain);

  // Read TEAL and ARC spec files
  const tealDir = path.join(__dirname, '..', '..', 'contracts', 'fry_arc200_staking');
  const approvalTeal = fs.readFileSync(path.join(tealDir, 'FryArc200Staking.approval.teal'), 'utf8');
  const clearTeal = fs.readFileSync(path.join(tealDir, 'FryArc200Staking.clear.teal'), 'utf8');
  const arc32Spec = JSON.parse(fs.readFileSync(path.join(tealDir, 'FryArc200Staking.arc32.json'), 'utf8'));

  // ── Step 1: Compile TEAL bytecode ──────────────────────────────────
  console.log('\n--- Step 1: Compiling TEAL bytecode ---');
  let approvalBytes, clearBytes;
  await withFallbackForChain(opts.chain, async (client) => {
    approvalBytes = await compileTeal(client, approvalTeal);
    clearBytes = await compileTeal(client, clearTeal);
    console.log(`Approval: ${approvalBytes.length} bytes, Clear: ${clearBytes.length} bytes`);
  });

  // ── Step 2: Deploy contract ────────────────────────────────────────
  console.log('\n--- Step 2: Deploying ARC-200 staking contract ---');
  const abiContract = new algosdk.ABIContract(arc32Spec.contract);
  const initMethod = abiContract.getMethodByName('init_staking');

  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const endTime = now + opts.duration;

  const appId = await withFallbackForChain(opts.chain, async (client) => {
    const params = await client.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: 0,
      method: initMethod,
      methodArgs: [
        treasuryAddr,                  // _authority
        BigInt(opts.lpTokenApp),       // _lp_token_app
        BigInt(opts.rewardToken),      // _reward_token_id
        BigInt(opts.rewardTokenType),  // _reward_token_type
        BigInt(opts.rewardAmount),     // _reward_token_amount
        BigInt(startTime),             // _stake_start_time
        BigInt(endTime),               // _stake_end_time
        BigInt(opts.lockPeriod),       // _lock_period
        BigInt(opts.duration),         // _pool_time
      ],
      approvalProgram: approvalBytes,
      clearProgram: clearBytes,
      numGlobalInts: 13,
      numGlobalByteSlices: 1,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      sender: treasuryAddr,
      signer,
      suggestedParams: params,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    });

    const result = await atc.execute(client, 4);
    const txInfo = result.methodResults[0].txInfo;
    const createdAppId = Number(txInfo?.applicationIndex || txInfo?.['application-index'] || 0);
    if (!createdAppId) throw new Error('App creation failed — no applicationIndex in txInfo');
    console.log(`App created: ${createdAppId}`);
    console.log(`Deploy TX:   ${result.txIDs[0]}`);
    return createdAppId;
  });

  const appAddr = algosdk.getApplicationAddress(appId);
  console.log(`App address: ${appAddr}`);

  // ── Step 3: Fund MBR ──────────────────────────────────────────────
  console.log('\n--- Step 3: Funding MBR ---');
  // ARC-200 staking needs less MBR (no ASA opt-in for staked token)
  const needsAsaOptIn = opts.rewardTokenType === 1 && opts.rewardToken > 0;
  const mbrMicroAlgos = 100000 + (needsAsaOptIn ? 100000 : 0) + 100000; // base + ASA opt-in + buffer

  await withFallbackForChain(opts.chain, async (client) => {
    const params = await client.getTransactionParams().do();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: treasuryAddr,
      receiver: appAddr,
      amount: mbrMicroAlgos,
      suggestedParams: params,
    });
    const signedTxn = txn.signTxn(treasurySk);
    const { txid } = await client.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(client, txid, 4);
    console.log(`MBR funded: ${mbrMicroAlgos / 1e6} ALGO/VOI — TX: ${txid}`);
  });

  // ── Step 4: Opt-in to ASA (reward token only, if ASA) ──────────────
  if (needsAsaOptIn) {
    console.log('\n--- Step 4: Opting in to reward ASA ---');
    const optInMethod = abiContract.getMethodByName('optInAsset');

    await withFallbackForChain(opts.chain, async (client) => {
      const params = await client.getTransactionParams().do();

      const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: 100000,
        suggestedParams: params,
      });

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: Number(appId),
        method: optInMethod,
        methodArgs: [
          BigInt(opts.rewardToken),
          { txn: mbrPayTxn, signer },
        ],
        appForeignAssets: [Number(opts.rewardToken)],
        sender: treasuryAddr,
        signer,
        suggestedParams: { ...params, fee: 2000, flatFee: true },
      });

      const result = await atc.execute(client, 4);
      console.log(`OptIn TX: ${result.txIDs[0]}`);
    });
  } else {
    console.log('\n--- Step 4: Skipping ASA opt-in ---');
  }

  // ── Step 5: Fund reward tokens ────────────────────────────────────
  console.log('\n--- Step 5: Funding reward tokens ---');

  if (opts.rewardTokenType === 1) {
    // ASA rewards
    const assetReceiveMethod = abiContract.getMethodByName('assetReceive');

    await withFallbackForChain(opts.chain, async (client) => {
      const params = await client.getTransactionParams().do();

      const rewardTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: opts.rewardAmount,
        assetIndex: opts.rewardToken,
        suggestedParams: params,
      });

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: Number(appId),
        method: assetReceiveMethod,
        methodArgs: [
          { txn: rewardTxn, signer },
        ],
        appForeignAssets: [Number(opts.rewardToken)],
        sender: treasuryAddr,
        signer,
        suggestedParams: params,
      });

      const result = await atc.execute(client, 4);
      console.log(`AssetReceive TX: ${result.txIDs[0]}`);
    });
  } else if (opts.rewardTokenType === 0) {
    // Native rewards
    const nativeReceiveMethod = abiContract.getMethodByName('nativeReceive');

    await withFallbackForChain(opts.chain, async (client) => {
      const params = await client.getTransactionParams().do();

      const rewardPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: opts.rewardAmount,
        suggestedParams: params,
      });

      const atc = new algosdk.AtomicTransactionComposer();
      atc.addMethodCall({
        appID: Number(appId),
        method: nativeReceiveMethod,
        methodArgs: [
          { txn: rewardPayTxn, signer },
        ],
        sender: treasuryAddr,
        signer,
        suggestedParams: params,
      });

      const result = await atc.execute(client, 4);
      console.log(`NativeReceive TX: ${result.txIDs[0]}`);
    });
  } else {
    // ARC-200 rewards — requires arc200_transfer call in group txn
    console.log('ARC-200 reward funding requires manual arc200_transfer call.');
    console.log('Use arc200RewardReceive after transferring ARC-200 tokens to the contract.');
  }

  // ── Step 6: Record in MongoDB ─────────────────────────────────────
  console.log('\n--- Step 6: Recording pool in MongoDB ---');

  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/farmingSchema');
  const Farming = mongoose.model('Farming');

  const tokenNames = {
    0: opts.chain === 'voi-mainnet' ? 'VOI' : 'ALGO',
    [chainConfig.fryTokenId]: opts.chain === 'voi-mainnet' ? 'vFRY' : 'FRY',
  };

  const pool = await Farming.create({
    chainId: opts.chain,
    creatorId: treasuryStr,
    lpToken: {
      tokenA: '0',
      tokenB: String(opts.lpTokenApp),
    },
    rewardToken: {
      id: String(opts.rewardToken),
      name: tokenNames[opts.rewardToken] || `ASA-${opts.rewardToken}`,
    },
    rewardTokenAmount: opts.rewardAmount,
    farmStartTime: startTime,
    farmEndTime: endTime,
    duration: opts.duration,
    lockPeriod: opts.lockPeriod,
    farmEntryFee: 0,
    rewardDistributionRate: 0,
    rewardDistributionSchedule: 86400,
    fryRewardFee: 0,
    aprRate: opts.aprRate,
    appId: Number(appId),
    poolType: 'lp',
    dexProvider: opts.chain === 'voi-mainnet' ? 'nomadex' : '',
    stakeTokenName: `LP-${opts.lpTokenApp}`,
    stakeTokenSymbol: 'LP',
    rewardTokenName: tokenNames[opts.rewardToken] || `ASA-${opts.rewardToken}`,
    rewardTokenSymbol: tokenNames[opts.rewardToken] || 'TOKEN',
    lpPairName: `LP Pool ${opts.lpTokenApp}`,
  });

  console.log(`MongoDB ID: ${pool._id}`);
  console.log(`Pool saved to farmingPools collection`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log(`Chain:     ${opts.chain}`);
  console.log(`App ID:    ${appId}`);
  console.log(`App Addr:  ${appAddr}`);
  console.log(`LP App:    ${opts.lpTokenApp} (ARC-200)`);
  console.log(`Rewards:   ${opts.rewardAmount / 1e6} tokens (${rewardTypeNames[opts.rewardTokenType]})`);
  console.log(`Duration:  ${(opts.duration / 86400).toFixed(1)} days`);
  console.log(`APR:       ${opts.aprRate}%`);
  console.log(`MongoDB:   ${pool._id}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n=== DEPLOYMENT FAILED ===');
  console.error(err.message || err);
  if (err.response?.body) console.error('Response:', JSON.stringify(err.response.body));
  process.exit(1);
});
