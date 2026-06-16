#!/usr/bin/env node
/**
 * Resume V3 pool deployment from a specific step.
 * Use when deployV3Pool.js partially succeeded (app created but opt-in/fund failed).
 *
 * Usage:
 *   node scripts/resumeV3Deploy.js --chain voi-mainnet --appId 48974248 \
 *     --stakeToken 0 --rewardToken 48968653 --rewardAmount 100000000 \
 *     --step optIn
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const algosdk = require('algosdk');
const mongoose = require('mongoose');
const { withFallbackForChain, getAlgodClientForChain } = require('../services/algodService');
const { getChainConfig } = require('../config/chains');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  return args;
}

function getTreasury(chainId) {
  if (chainId === 'voi-mainnet') {
    const account = algosdk.mnemonicToSecretKey(process.env.VOI_REWARD_MNEMONIC);
    return { addr: account.addr, sk: account.sk };
  }
  const ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  const rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  return { addr: ogAccount.addr, sk: rekeyAccount.sk };
}

function makeSigner(addr, sk) {
  return algosdk.makeBasicAccountTransactionSigner({ addr, sk });
}

async function main() {
  const opts = parseArgs();
  const chainId = opts.chain;
  const appId = parseInt(opts.appId, 10);
  const stakeToken = parseInt(opts.stakeToken || '0', 10);
  const rewardToken = parseInt(opts.rewardToken, 10);
  const rewardAmount = parseInt(opts.rewardAmount || '0', 10);
  const step = opts.step; // optIn, fund, record

  const { addr: treasuryAddr, sk: treasurySk } = getTreasury(chainId);
  const signer = makeSigner(treasuryAddr, treasurySk);
  const appAddr = algosdk.getApplicationAddress(appId);
  const chainConfig = getChainConfig(chainId);

  const tealDir = path.join(__dirname, '..', 'contracts', 'fry_staking_v3');
  const arc32Spec = JSON.parse(fs.readFileSync(path.join(tealDir, 'FryStaking.arc32.json'), 'utf8'));
  const abiContract = new algosdk.ABIContract(arc32Spec.contract);

  console.log(`Resuming deployment: chain=${chainId}, appId=${appId}, step=${step}`);
  console.log(`Treasury: ${treasuryAddr.toString()}`);
  console.log(`App addr: ${appAddr}`);

  if (step === 'optIn' || step === 'all') {
    const asaTokens = new Set();
    if (stakeToken > 0) asaTokens.add(stakeToken);
    if (rewardToken > 0) asaTokens.add(rewardToken);

    if (asaTokens.size > 0) {
      console.log('\n--- Opt-in to ASAs ---');
      const optInMethod = abiContract.getMethodByName('optInAsset');

      await withFallbackForChain(chainId, async (client) => {
        const params = await client.getTransactionParams().do();
        const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: treasuryAddr, receiver: appAddr, amount: 100000, suggestedParams: params,
        });

        // Collect unique ASA IDs for foreign assets reference
        const foreignAssets = [...asaTokens].map(Number);
        const atc = new algosdk.AtomicTransactionComposer();
        atc.addMethodCall({
          appID: appId,
          method: optInMethod,
          methodArgs: [BigInt(rewardToken), BigInt(stakeToken), { txn: mbrPayTxn, signer }],
          sender: treasuryAddr,
          signer,
          suggestedParams: { ...params, fee: 3000, flatFee: true },
          appForeignAssets: foreignAssets,
        });
        const result = await atc.execute(client, 4);
        console.log(`OptIn TX: ${result.txIDs[0]}`);
      });
    } else {
      console.log('No ASAs to opt in to (native-only pool)');
    }
  }

  if (step === 'fund' || step === 'all') {
    console.log('\n--- Funding reward tokens ---');

    if (rewardToken > 0) {
      const assetReceiveMethod = abiContract.getMethodByName('assetReceive');
      await withFallbackForChain(chainId, async (client) => {
        const params = await client.getTransactionParams().do();
        const rewardTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: treasuryAddr, receiver: appAddr, amount: rewardAmount, assetIndex: rewardToken, suggestedParams: params,
        });
        const atc = new algosdk.AtomicTransactionComposer();
        atc.addMethodCall({
          appID: appId, method: assetReceiveMethod,
          methodArgs: [{ txn: rewardTxn, signer }],
          sender: treasuryAddr, signer, suggestedParams: params,
        });
        const result = await atc.execute(client, 4);
        console.log(`AssetReceive TX: ${result.txIDs[0]}`);
      });
    } else {
      const nativeReceiveMethod = abiContract.getMethodByName('nativeReceive');
      await withFallbackForChain(chainId, async (client) => {
        const params = await client.getTransactionParams().do();
        const rewardPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: treasuryAddr, receiver: appAddr, amount: rewardAmount, suggestedParams: params,
        });
        const atc = new algosdk.AtomicTransactionComposer();
        atc.addMethodCall({
          appID: appId, method: nativeReceiveMethod,
          methodArgs: [{ txn: rewardPayTxn, signer }],
          sender: treasuryAddr, signer, suggestedParams: params,
        });
        const result = await atc.execute(client, 4);
        console.log(`NativeReceive TX: ${result.txIDs[0]}`);
      });
    }
  }

  if (step === 'record' || step === 'all') {
    console.log('\n--- Recording in MongoDB ---');
    await mongoose.connect(process.env.MONGODB_URI);
    require('../models/stakingSchema');
    const Staking = mongoose.model('Staking');

    const duration = parseInt(opts.duration || '2592000', 10);
    const aprRate = parseFloat(opts.aprRate || '10');
    const lockPeriod = parseInt(opts.lockPeriod || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const tokenNames = {
      0: chainId === 'voi-mainnet' ? 'VOI' : 'ALGO',
      [chainConfig.fryTokenId]: chainId === 'voi-mainnet' ? 'vFRY' : 'FRY',
    };

    const pool = await Staking.create({
      chainId, creatorId: treasuryAddr.toString(),
      stakeToken: { id: String(stakeToken), name: tokenNames[stakeToken] || `ASA-${stakeToken}` },
      rewardToken: { id: String(rewardToken), name: tokenNames[rewardToken] || `ASA-${rewardToken}` },
      stakingStartTime: now, stakingEndTime: now + duration,
      duration, aprRate, rewardTokenAmount: rewardAmount,
      stakingContractId: String(appId), lockPeriod, contractVersion: 3,
    });
    console.log(`MongoDB ID: ${pool._id}`);
    await mongoose.disconnect();
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
