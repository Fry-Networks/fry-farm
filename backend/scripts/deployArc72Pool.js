#!/usr/bin/env node
/**
 * Deploy a FryArc72Staking pool on-chain and record it in MongoDB.
 *
 * Usage:
 *   node scripts/deployArc72Pool.js \
 *     --chain voi-mainnet \
 *     --collectionApp 500123 \
 *     --rewardToken 48968653 \
 *     --rewardTokenType 1 \
 *     --rewardModel 0 \
 *     --rewardAmount 100000000 \
 *     --ratePerDay 1000000 \
 *     --duration 2592000 \
 *     --lockPeriod 0 \
 *     --collectionMode 0
 *
 * rewardTokenType: 0=native, 1=ASA, 2=ARC-200
 * rewardModel: 0=fixed-rate, 1=proportional, 2=APR
 * collectionMode: 0=app-id, 1=whitelist, 2=both
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
    collectionApp: parseInt(args.collectionApp, 10),
    rewardToken: parseInt(args.rewardToken ?? '0', 10),
    rewardTokenType: parseInt(args.rewardTokenType ?? '0', 10),
    rewardModel: parseInt(args.rewardModel ?? '0', 10),
    rewardAmount: parseInt(args.rewardAmount, 10),
    ratePerDay: parseInt(args.ratePerDay ?? '0', 10),
    aprRate: parseInt(args.aprRate ?? '0', 10),
    valuePerNft: parseInt(args.valuePerNft ?? '0', 10),
    nftValue: parseInt(args.nftValue ?? '0', 10),
    duration: parseInt(args.duration, 10),
    lockPeriod: parseInt(args.lockPeriod ?? '0', 10),
    collectionMode: parseInt(args.collectionMode ?? '0', 10),
    depositFeeBps: parseInt(args.depositFeeBps ?? '0', 10),
    withdrawFeeBps: parseInt(args.withdrawFeeBps ?? '0', 10),
    claimFeeBps: parseInt(args.claimFeeBps ?? '0', 10),
  };
}

function makeSigner(addr, sk) {
  return algosdk.makeBasicAccountTransactionSigner({ addr, sk });
}

async function compileTeal(client, tealSource) {
  const result = await client.compile(tealSource).do();
  return new Uint8Array(Buffer.from(result.result, 'base64'));
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  if (!opts.collectionApp) throw new Error('--collectionApp is required');
  if (isNaN(opts.rewardAmount)) throw new Error('--rewardAmount is required');

  const rewardTypeNames = { 0: 'NATIVE', 1: 'ASA', 2: 'ARC-200' };
  const rewardModelNames = { 0: 'Fixed Rate', 1: 'Proportional', 2: 'APR' };
  const collModeNames = { 0: 'App ID', 1: 'Whitelist', 2: 'Both' };

  console.log('=== FryArc72Staking Pool Deployment ===');
  console.log(`Chain:            ${opts.chain}`);
  console.log(`Collection App:   ${opts.collectionApp} (ARC-72)`);
  console.log(`Collection Mode:  ${collModeNames[opts.collectionMode]}`);
  console.log(`Reward Token:     ${opts.rewardToken} (${rewardTypeNames[opts.rewardTokenType]})`);
  console.log(`Reward Model:     ${rewardModelNames[opts.rewardModel]}`);
  console.log(`Reward Amount:    ${opts.rewardAmount}`);
  console.log(`Rate/Day:         ${opts.ratePerDay}`);
  console.log(`Duration:         ${opts.duration}s (${(opts.duration / 86400).toFixed(1)} days)`);
  console.log(`Lock Period:      ${opts.lockPeriod}s`);
  console.log();

  const { addr: treasuryAddr, sk: treasurySk } = getTreasury(opts.chain);
  const treasuryStr = treasuryAddr.toString();
  console.log(`Treasury: ${treasuryStr}`);

  const signer = makeSigner(treasuryAddr, treasurySk);
  const chainConfig = getChainConfig(opts.chain);

  // Read TEAL and ARC spec files
  const tealDir = path.join(__dirname, '..', '..', 'contracts', 'fry_arc72_staking');
  const approvalTeal = fs.readFileSync(path.join(tealDir, 'FryArc72Staking.approval.teal'), 'utf8');
  const clearTeal = fs.readFileSync(path.join(tealDir, 'FryArc72Staking.clear.teal'), 'utf8');
  const arc32Spec = JSON.parse(fs.readFileSync(path.join(tealDir, 'FryArc72Staking.arc32.json'), 'utf8'));

  // ── Step 1: Compile TEAL bytecode ──────────────────────────────────
  console.log('\n--- Step 1: Compiling TEAL bytecode ---');
  let approvalBytes, clearBytes;
  await withFallbackForChain(opts.chain, async (client) => {
    approvalBytes = await compileTeal(client, approvalTeal);
    clearBytes = await compileTeal(client, clearTeal);
    console.log(`Approval: ${approvalBytes.length} bytes, Clear: ${clearBytes.length} bytes`);
  });

  // ── Step 2: Deploy contract ────────────────────────────────────────
  console.log('\n--- Step 2: Deploying ARC-72 NFT staking contract ---');
  const abiContract = new algosdk.ABIContract(arc32Spec.contract);
  const initMethod = abiContract.getMethodByName('init_pool');

  const now = Math.floor(Date.now() / 1000);
  const poolEndTime = now + opts.duration;

  const appId = await withFallbackForChain(opts.chain, async (client) => {
    const params = await client.getTransactionParams().do();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: 0,
      method: initMethod,
      methodArgs: [
        BigInt(opts.rewardToken),        // reward_token_id
        BigInt(opts.rewardTokenType),    // reward_token_type
        BigInt(opts.rewardModel),        // reward_model
        BigInt(opts.collectionMode),     // collection_mode
        BigInt(opts.collectionApp),      // collection_app
        BigInt(opts.nftValue),           // nft_value
        BigInt(opts.ratePerDay),         // rate_per_day
        BigInt(opts.rewardAmount),       // total_reward_pool
        BigInt(opts.aprRate),            // apr_rate
        BigInt(opts.valuePerNft),        // value_per_nft
        BigInt(poolEndTime),             // pool_end_time
        BigInt(opts.lockPeriod),         // lock_period
        treasuryAddr,                    // fee_recipient
        BigInt(opts.depositFeeBps),      // deposit_fee_bps
        BigInt(opts.withdrawFeeBps),     // withdraw_fee_bps
        BigInt(opts.claimFeeBps),        // claim_fee_bps
      ],
      approvalProgram: approvalBytes,
      clearProgram: clearBytes,
      numGlobalInts: 19,
      numGlobalByteSlices: 2,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      extraPages: 1,
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
  const needsAsaOptIn = opts.rewardTokenType === 1 && opts.rewardToken > 0;
  const mbrMicroAlgos = 100000 + (needsAsaOptIn ? 100000 : 0) + 100000;

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
    const optInMethod = abiContract.getMethodByName('opt_in_asset');

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
    const depositMethod = abiContract.getMethodByName('deposit_rewards');

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
        method: depositMethod,
        methodArgs: [
          { txn: rewardTxn, signer },
        ],
        appForeignAssets: [Number(opts.rewardToken)],
        sender: treasuryAddr,
        signer,
        suggestedParams: params,
      });

      const result = await atc.execute(client, 4);
      console.log(`DepositRewards TX: ${result.txIDs[0]}`);
    });
  } else if (opts.rewardTokenType === 0) {
    const depositMethod = abiContract.getMethodByName('deposit_rewards_algo');

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
        method: depositMethod,
        methodArgs: [
          { txn: rewardPayTxn, signer },
        ],
        sender: treasuryAddr,
        signer,
        suggestedParams: params,
      });

      const result = await atc.execute(client, 4);
      console.log(`DepositRewardsAlgo TX: ${result.txIDs[0]}`);
    });
  } else {
    console.log('ARC-200 reward funding requires manual arc200_transfer call.');
    console.log('Use deposit_rewards_arc200 after transferring ARC-200 tokens to the contract.');
  }

  // ── Step 6: Record in MongoDB ─────────────────────────────────────
  console.log('\n--- Step 6: Recording pool in MongoDB ---');

  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/nftStakingPoolSchema');
  const NftStakingPool = mongoose.model('NftStakingPool');

  const rewardModelMap = { 0: 'fixed_rate', 1: 'proportional', 2: 'apr' };
  const collModeMap = { 0: 'creator_address', 1: 'whitelist', 2: 'both' };

  const pool = await NftStakingPool.create({
    chainId: opts.chain,
    creatorId: treasuryStr,
    appId: Number(appId),
    name: `ARC-72 Pool #${appId}`,
    collectionCreator: String(opts.collectionApp),
    collectionMode: collModeMap[opts.collectionMode] || 'creator_address',
    rewardTokenId: opts.rewardToken,
    rewardModel: rewardModelMap[opts.rewardModel] || 'fixed_rate',
    ratePerDay: opts.ratePerDay / 1e6,
    totalRewardPool: opts.rewardAmount / 1e6,
    aprRate: opts.aprRate,
    valuePerNft: opts.valuePerNft,
    poolEndTime: poolEndTime,
    lockPeriod: opts.lockPeriod,
    contractType: 'arc72',
    totalNftsStaked: 0,
    totalRewardsClaimed: 0,
    isActive: true,
  });

  console.log(`MongoDB ID: ${pool._id}`);
  console.log(`Pool saved with contractType: arc72`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log(`Chain:       ${opts.chain}`);
  console.log(`App ID:      ${appId}`);
  console.log(`App Addr:    ${appAddr}`);
  console.log(`Collection:  ${opts.collectionApp} (ARC-72)`);
  console.log(`Coll Mode:   ${collModeNames[opts.collectionMode]}`);
  console.log(`Reward:      ${rewardTypeNames[opts.rewardTokenType]} (${opts.rewardAmount / 1e6})`);
  console.log(`Model:       ${rewardModelNames[opts.rewardModel]}`);
  console.log(`Duration:    ${(opts.duration / 86400).toFixed(1)} days`);
  console.log(`MongoDB:     ${pool._id}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n=== DEPLOYMENT FAILED ===');
  console.error(err.message || err);
  if (err.response?.body) console.error('Response:', JSON.stringify(err.response.body));
  process.exit(1);
});
