#!/usr/bin/env node
/**
 * Deploy a FryStaking V3 pool on-chain and record it in MongoDB.
 *
 * Usage:
 *   node scripts/deployV3Pool.js \
 *     --chain voi-mainnet \
 *     --stakeToken 0 \
 *     --rewardToken 48968653 \
 *     --rewardAmount 100000000 \
 *     --duration 2592000 \
 *     --aprRate 10 \
 *     --lockPeriod 0
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const algosdk = require('algosdk');
const mongoose = require('mongoose');
const { withFallbackForChain, getAlgodClientForChain } = require('../services/algodService');
const { getChainConfig } = require('../config/chains');

/** Load chain-specific treasury wallet (mirrors stakingClaimService pattern) */
function getTreasury(chainId) {
  if (chainId === 'voi-mainnet') {
    if (!process.env.VOI_REWARD_MNEMONIC) throw new Error('VOI_REWARD_MNEMONIC not set');
    const account = algosdk.mnemonicToSecretKey(process.env.VOI_REWARD_MNEMONIC);
    return { addr: account.addr, sk: account.sk };
  }
  // Algorand: rekeyed treasury
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
    chain: args.chain || 'algorand-mainnet',
    stakeToken: parseInt(args.stakeToken ?? '0', 10),
    rewardToken: parseInt(args.rewardToken, 10),
    rewardAmount: parseInt(args.rewardAmount, 10),
    duration: parseInt(args.duration, 10),      // seconds
    aprRate: parseFloat(args.aprRate),
    lockPeriod: parseInt(args.lockPeriod ?? '0', 10), // seconds
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function makeSigner(addr, sk) {
  return algosdk.makeBasicAccountTransactionSigner({ addr, sk });
}

// Pre-compiled V3 bytecode (compiled via https://mainnet-api.4160.nodely.dev/v2/teal/compile)
// Hash: 3O33K4ELKEHDXM32UWLT7JWVKCXNQH2ECPJC54A2CHNCQWVGLRLECZU33Q
const V3_APPROVAL_B64 = 'CiAEAAgBBCYJE3Jld2FyZF90b2tlbl9hbW91bnQMcmV3YXJkX3Rva2VuDnN0YWtlX2VuZF90aW1lC2xvY2tfcGVyaW9kA2Fwcgx0b3RhbF9zdGFrZWQTcmV3YXJkc19kaXN0cmlidXRlZAtzdGFrZV90b2tlbg10b3RhbF9zdGFrZXJzMRkURDEYQQA5ggcE9Bq9twSujxKYBAd8UckEbJRzgwTbs4yuBP2bXJQE6ny/OjYaAI4HAPgBWAGAAaEC5gRlBYwAgATz4MA/NhoAjgEAMACKAwGL/kEABYv/QAACIomL/Yv/HYv+HU8Ci/4LTwIITCKBgIC324YJH0YCTBREiTYaAUkVgSASRDYaAkkVIxJEFzYaA0kVIxJEFzYaBEkVIxJEFzYaBUkVIxJEFzYaBkkVIxJEFzYaB0kVIxJEFzYaCEkVIxJEFzEATwgSREsCSwQNRIAJYXV0aG9yaXR5MQBnJwdPB2cpTwZnKE8FZycIImcnBSJngApjcmVhdGVkX0F0MgdngBBzdGFrZV9zdGFydF90aW1lTwRnKk8DZytPAmcnBiJngAlwb29sX3RpbWVMZycEImckQzYaAUkVIxJEF0k2GgJJFSMSRBdMMRYkCUk4ECQSREk4BzIKEkQ4CDIQD0RBABOxMgoishKyFEsBshElshAisgGzSUEAGUlLAhNBABKxMgoishKyFEmyESWyECKyAbMkQzEWJAlJOBAlEkQiKWVESURLATgUMgoSREsBOBESRDgSIihlRBJEJEMxFiQJSTgQJBJEIillRBRESTgHMgoSRDgIIihlRBJEJEMigABHAjYaAUkVIxJEF0k2GgJJFSMSRBdMMRaBAwlJTgI4ECQSRDEWgQIJSU4COBAlEkQxFiQJSU4COBAkEkREIicHZURBAOtLAUk4EksGEkRJOBEiJwdlRBJEOBQyChJERwI4CIHE2wESRDgHMgoSRDEASUUKvUUBQQB2SwhJIiO6F0UHI0m6FzIHTAlFCCIrZURBADMiK2VESwgMQQApIicEZURLBkxLCYj9wUlFCCIoZUQNQQAHIihlTEUIREsGFksJgRBPArtLBUsFSU4CCBZLCklOAiJPArsyBxYjTLsiJwVlRAgnBUxnJwRLBGckQ0sISYEguUhLBUlOAhZLASJPArsyBxZLASNPArsiFksBgRBLAruBGEy7IicFZUQIJwVMZyInCGVEJAgnCExnQv+4SwJJOAcyChJEOAhLBRJEQv8cgABHAjYaAUkVIxJEF0k2GgJJFSMSRBdMMQBJTgJJvUUBREkiI7oXSU4CTgMjSboXTgJJRA5EIitlREEACzIHSwEJIitlRA9EMgdFCCIqZURBABEyByIqZUQNQQAHIiplTEUJREsHSwEJIicEZURLA0xPAoj8s0lFByIoZUQNQQAHIihlTEUHREsFQQBGIillREEA2LEiKWVEMQBLB7ISshSyESWyECKyAbMiKGVESwZJTgIJKExnIicGZURLAQgnBkxnSwNJTgKBGCO6FwgWgRhMuyInB2VEQQB+sSInB2VEMQBLBrISshSyESWyECKyAbNLAoEQI7oXSUUIQQAmIillREEAQLEiKWVEMQBLCLISshSyESWyECKyAbMiFksDgRBPArtLAUsFSU4CCRZLBCJPArsiJwVlREwJJwVMZycESwRnJEOxMQBLB7IIsgckshAisgGzQv/DsTEASwWyCLIHJLIQIrIBs0L/hrExAEsGsgiyBySyECKyAbNC/yuAAEcCNhoBSRUjEkQXMQBHAr1FAURJI0m6F0wiI7oXSUQiK2VEQQALMgdLAgkiK2VED0QyB0UHIiplREEAETIHIiplRA1BAAciKmVMRQhESwZLAgkiJwRlREsCTE8CiPtJSUUGIihlRA1BAAciKGVMRQZESwRBAE8iKWVEQQCVsSIpZUQxAEsGshKyFLIRJbIQIrIBsyIoZURLBUlOAgkoTGciJwZlREsBCCcGTGdLA0lOAoEYI7oXCBZLAYEYTwK7MgcWI0y7SwKBECO6F0lFB0EAJiIpZURBACaxIillRDEASweyErIUshElshAisgGzIhZLA4EQTwK7JwRLBGckQ7ExAEsGsgiyBySyECKyAbNC/92xMQBLBbIIsgckshAisgGzQv9ugABJNhoBSRUjEkQXMQBHAr1FAURJI0m6F0wiI7oXSUQiK2VEQQALMgdLAgkiK2VED0QyB0UGIiplREEAETIHIiplRA1BAAciKmVMRQdESwVLAgkiJwRlREsCTE8CiPojSUUGIihlRA1BAAciKGVMRQZESwRBADwiKGVESwVJTgIJKExnIicGZURLAQgnBkxnSggWSwRJTgIiTwK7MgcWSwEjTwK7SYEYI7oXTwIIFoEYTLsnBEsEZyRD';
const V3_CLEAR_B64 = 'CoEBQw==';

function getCompiledBytecode() {
  return {
    approval: new Uint8Array(Buffer.from(V3_APPROVAL_B64, 'base64')),
    clear: new Uint8Array(Buffer.from(V3_CLEAR_B64, 'base64')),
  };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log('=== FryStaking V3 Pool Deployment ===');
  console.log(`Chain:        ${opts.chain}`);
  console.log(`Stake Token:  ${opts.stakeToken} (${opts.stakeToken === 0 ? 'NATIVE' : 'ASA'})`);
  console.log(`Reward Token: ${opts.rewardToken} (${opts.rewardToken === 0 ? 'NATIVE' : 'ASA'})`);
  console.log(`Reward Amt:   ${opts.rewardAmount}`);
  console.log(`Duration:     ${opts.duration}s (${(opts.duration / 86400).toFixed(1)} days)`);
  console.log(`APR Rate:     ${opts.aprRate}%`);
  console.log(`Lock Period:  ${opts.lockPeriod}s`);
  console.log();

  // Load treasury
  const { addr: treasuryAddr, sk: treasurySk } = getTreasury(opts.chain);
  const treasuryStr = treasuryAddr.toString();
  console.log(`Treasury: ${treasuryStr}`);

  const signer = makeSigner(treasuryAddr, treasurySk);
  const chainConfig = getChainConfig(opts.chain);

  // Read TEAL files
  const tealDir = path.join(__dirname, '..', 'contracts', 'fry_staking_v3');
  const approvalTeal = fs.readFileSync(path.join(tealDir, 'FryStaking.approval.teal'), 'utf8');
  const clearTeal = fs.readFileSync(path.join(tealDir, 'FryStaking.clear.teal'), 'utf8');
  const arc32Spec = JSON.parse(fs.readFileSync(path.join(tealDir, 'FryStaking.arc32.json'), 'utf8'));

  // ── Step 1: Load pre-compiled bytecode ──────────────────────────────
  console.log('\n--- Step 1: Loading pre-compiled bytecode ---');
  const { approval: approvalBytes, clear: clearBytes } = getCompiledBytecode();
  console.log(`Approval: ${approvalBytes.length} bytes, Clear: ${clearBytes.length} bytes`);

  // ── Step 2: Deploy contract ────────────────────────────────────────
  console.log('\n--- Step 2: Deploying V3 contract ---');
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
        treasuryAddr,            // _authority
        opts.stakeToken,         // _stake_token (0 = native)
        opts.rewardToken,        // _reward_token (0 = native)
        opts.rewardAmount,       // _reward_token_amount
        BigInt(startTime),       // _stake_start_time
        BigInt(endTime),         // _stake_end_time
        opts.lockPeriod,         // _lock_period
        opts.duration,           // _pool_time
      ],
      approvalProgram: approvalBytes,
      clearProgram: clearBytes,
      numGlobalInts: 12,
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
  const asaTokens = new Set();
  if (opts.stakeToken > 0) asaTokens.add(opts.stakeToken);
  if (opts.rewardToken > 0) asaTokens.add(opts.rewardToken);
  const uniqueAssets = asaTokens.size;
  const mbrMicroAlgos = (100000 + uniqueAssets * 100000 + 100000); // 0.1 + per-ASA + buffer

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

  // ── Step 4: Opt-in to ASAs ────────────────────────────────────────
  if (uniqueAssets > 0) {
    console.log('\n--- Step 4: Opting in to ASAs ---');
    const optInMethod = abiContract.getMethodByName('optInAsset');

    await withFallbackForChain(opts.chain, async (client) => {
      const params = await client.getTransactionParams().do();

      // MBR payment for opt-in
      const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: 100000, // 0.1 ALGO
        suggestedParams: params,
      });

      const atc = new algosdk.AtomicTransactionComposer();
      const optInParams = { ...params, fee: 3000, flatFee: true };
      atc.addMethodCall({
        appID: Number(appId),
        method: optInMethod,
        methodArgs: [
          BigInt(opts.rewardToken),   // asset_one (uint64)
          BigInt(opts.stakeToken),    // asset_two (uint64)
          { txn: mbrPayTxn, signer },  // mbr_pay
        ],
        sender: treasuryAddr,
        signer,
        suggestedParams: optInParams,
      });

      const result = await atc.execute(client, 4);
      console.log(`OptIn TX: ${result.txIDs[0]}`);
    });
  } else {
    console.log('\n--- Step 4: Skipping opt-in (native-only pool) ---');
  }

  // ── Step 5: Fund reward tokens ────────────────────────────────────
  console.log('\n--- Step 5: Funding reward tokens ---');

  if (opts.rewardToken > 0) {
    // ASA rewards
    const assetReceiveMethod = abiContract.getMethodByName('assetReceive');

    await withFallbackForChain(opts.chain, async (client) => {
      const params = await client.getTransactionParams().do();

      // Asset transfer for rewards
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
          { txn: rewardTxn, signer },  // reward_token_transfer
        ],
        sender: treasuryAddr,
        signer,
        suggestedParams: params,
      });

      const result = await atc.execute(client, 4);
      console.log(`AssetReceive TX: ${result.txIDs[0]}`);
    });
  } else {
    // Native rewards
    const nativeReceiveMethod = abiContract.getMethodByName('nativeReceive');

    await withFallbackForChain(opts.chain, async (client) => {
      const params = await client.getTransactionParams().do();

      // Payment for native rewards
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
          { txn: rewardPayTxn, signer },  // reward_payment
        ],
        sender: treasuryAddr,
        signer,
        suggestedParams: params,
      });

      const result = await atc.execute(client, 4);
      console.log(`NativeReceive TX: ${result.txIDs[0]}`);
    });
  }

  // ── Step 6: Record in MongoDB ─────────────────────────────────────
  console.log('\n--- Step 6: Recording pool in MongoDB ---');

  await mongoose.connect(process.env.MONGODB_URI);
  require('../models/stakingSchema');
  const Staking = mongoose.model('Staking');

  const tokenNames = {
    0: opts.chain === 'voi-mainnet' ? 'VOI' : 'ALGO',
    [chainConfig.fryTokenId]: opts.chain === 'voi-mainnet' ? 'vFRY' : 'FRY',
  };

  const pool = await Staking.create({
    chainId: opts.chain,
    creatorId: treasuryStr,
    stakeToken: {
      id: String(opts.stakeToken),
      name: tokenNames[opts.stakeToken] || `ASA-${opts.stakeToken}`,
    },
    rewardToken: {
      id: String(opts.rewardToken),
      name: tokenNames[opts.rewardToken] || `ASA-${opts.rewardToken}`,
    },
    stakingStartTime: startTime,
    stakingEndTime: endTime,
    duration: opts.duration,
    aprRate: opts.aprRate,
    rewardTokenAmount: opts.rewardAmount,
    stakingContractId: String(appId),
    lockPeriod: opts.lockPeriod,
    contractVersion: 3,
    totalStakers: 0,
    totalAmountStaked: 0,
    rewardsDistributed: 0,
  });

  console.log(`MongoDB ID: ${pool._id}`);
  console.log(`Pool saved with contractVersion: 3`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log(`Chain:     ${opts.chain}`);
  console.log(`App ID:    ${appId}`);
  console.log(`App Addr:  ${appAddr}`);
  console.log(`Pool:      Stake ${tokenNames[opts.stakeToken] || opts.stakeToken} → Earn ${tokenNames[opts.rewardToken] || opts.rewardToken}`);
  console.log(`Duration:  ${(opts.duration / 86400).toFixed(1)} days`);
  console.log(`APR:       ${opts.aprRate}%`);
  console.log(`Rewards:   ${opts.rewardAmount / 1e6} tokens`);
  console.log(`MongoDB:   ${pool._id}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n=== DEPLOYMENT FAILED ===');
  console.error(err.message || err);
  if (err.response?.body) console.error('Response:', JSON.stringify(err.response.body));
  process.exit(1);
});
