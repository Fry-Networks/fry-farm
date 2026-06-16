#!/usr/bin/env node
/**
 * Test FryStaking V3 pool operations: stake, claim, unstake.
 *
 * Usage:
 *   node scripts/testV3Staking.js --chain voi-mainnet --appId 12345 --action stake --amount 10000000
 *   node scripts/testV3Staking.js --chain voi-mainnet --appId 12345 --action claim
 *   node scripts/testV3Staking.js --chain voi-mainnet --appId 12345 --action unstake --amount 10000000
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const algosdk = require('algosdk');
const { withFallbackForChain, getAlgodClientForChain } = require('../services/algodService');
const { getChainConfig } = require('../config/chains');

function getTreasury(chainId) {
  if (chainId === 'voi-mainnet') {
    const account = algosdk.mnemonicToSecretKey(process.env.VOI_REWARD_MNEMONIC);
    return { addr: account.addr, sk: account.sk };
  }
  const ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  const rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  return { addr: ogAccount.addr, sk: rekeyAccount.sk };
}

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  return {
    chain: args.chain || 'algorand-mainnet',
    appId: parseInt(args.appId, 10),
    action: args.action,                     // stake | claim | unstake
    amount: parseInt(args.amount || '0', 10), // microalgos/micro-units
  };
}

function makeSigner(addr, sk) {
  return algosdk.makeBasicAccountTransactionSigner({ addr, sk });
}

const BOX_PRICE = 2500 + 400 * 64; // 28100 microalgos

async function readGlobalState(client, appId) {
  const appInfo = await client.getApplicationByID(appId).do();
  const gs = {};
  for (const entry of appInfo.params?.['global-state'] || []) {
    const key = Buffer.from(entry.key, 'base64').toString('utf8');
    gs[key] = entry.value.type === 2 ? entry.value.uint : entry.value.bytes;
  }
  return gs;
}

async function main() {
  const opts = parseArgs();
  console.log(`=== V3 Test: ${opts.action} ===`);
  console.log(`Chain: ${opts.chain}, App: ${opts.appId}, Amount: ${opts.amount}`);

  const { addr: treasuryAddr, sk: treasurySk } = getTreasury(opts.chain);
  const signer = makeSigner(treasuryAddr, treasurySk);
  const chainConfig = getChainConfig(opts.chain);
  const appAddr = algosdk.getApplicationAddress(opts.appId);

  // Load ARC32 ABI
  const tealDir = path.join(__dirname, '..', 'contracts', 'fry_staking_v3');
  const arc32Spec = JSON.parse(fs.readFileSync(path.join(tealDir, 'FryStaking.arc32.json'), 'utf8'));
  const abiContract = new algosdk.ABIContract(arc32Spec.contract);

  const algod = getAlgodClientForChain(opts.chain);
  const gs = await readGlobalState(algod, opts.appId);
  const stakeToken = gs.stake_token || 0;
  const rewardToken = gs.reward_token || 0;
  const fryTokenId = chainConfig.fryTokenId;

  console.log(`Stake token: ${stakeToken} (${stakeToken === 0 ? 'NATIVE' : 'ASA'})`);
  console.log(`Reward token: ${rewardToken}`);
  console.log();

  if (opts.action === 'stake') {
    await doStake(opts, abiContract, algod, treasuryAddr, treasurySk, signer, appAddr, stakeToken, fryTokenId);
  } else if (opts.action === 'claim') {
    await doClaim(opts, abiContract, algod, treasuryAddr, treasurySk, signer, appAddr, gs);
  } else if (opts.action === 'unstake') {
    await doUnstake(opts, abiContract, algod, treasuryAddr, treasurySk, signer, appAddr, gs);
  } else {
    console.error(`Unknown action: ${opts.action}. Use: stake, claim, unstake`);
    process.exit(1);
  }
}

async function doStake(opts, abiContract, algod, treasuryAddr, treasurySk, signer, appAddr, stakeToken, fryTokenId) {
  const method = abiContract.getMethodByName('stakeTokens');

  await withFallbackForChain(opts.chain, async (client) => {
    const params = await client.getTransactionParams().do();
    const gs = await readGlobalState(client, opts.appId);

    // Calculate updated APR
    const totalStaked = gs.total_staked || 0;
    const rewardAmount = gs.reward_token_amount || 0;
    const poolTime = gs.pool_time || 1;
    let updatedApr = (rewardAmount / (totalStaked + opts.amount)) * 100 * ((86400 * 360) / poolTime);
    if (!isFinite(updatedApr)) updatedApr = 0;
    const aprScaled = Math.floor(updatedApr * 100);

    // Build stake_pay and stake_axfer based on token type
    let stakePayTxn, stakeAxferTxn;

    if (stakeToken === 0) {
      // Native: real pay, dummy axfer
      stakePayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: opts.amount,
        suggestedParams: params,
      });
      stakeAxferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: 0,
        assetIndex: fryTokenId,
        suggestedParams: params,
      });
    } else {
      // ASA: dummy pay, real axfer
      stakePayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: 1000,
        suggestedParams: params,
      });
      stakeAxferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: appAddr,
        amount: opts.amount,
        assetIndex: stakeToken,
        suggestedParams: params,
      });
    }

    // Box payment
    const boxTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: treasuryAddr,
      receiver: appAddr,
      amount: BOX_PRICE,
      suggestedParams: params,
    });

    // Foreign assets: include the dummy axfer asset + reward token for inner txns
    const foreignAssets = [fryTokenId];
    if (stakeToken > 0 && !foreignAssets.includes(stakeToken)) foreignAssets.push(stakeToken);

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: opts.appId,
      method,
      methodArgs: [
        BigInt(opts.amount),                  // stake_amount
        BigInt(aprScaled),                    // updated_apr
        { txn: stakePayTxn, signer },         // stake_pay
        { txn: stakeAxferTxn, signer },       // stake_axfer
        { txn: boxTxn, signer },              // box_tx
      ],
      sender: treasuryAddr,
      signer,
      suggestedParams: params,
      boxes: [{ appIndex: opts.appId, name: algosdk.decodeAddress(treasuryAddr.toString()).publicKey }],
      appForeignAssets: foreignAssets,
    });

    const result = await atc.execute(client, 4);
    console.log(`STAKE SUCCESS — TX: ${result.txIDs[0]}`);
    console.log(`Staked: ${opts.amount / 1e6} tokens, APR: ${aprScaled / 100}%`);
  });
}

async function doClaim(opts, abiContract, algod, treasuryAddr, treasurySk, signer, appAddr, gs) {
  const method = abiContract.getMethodByName('claimTokens');

  await withFallbackForChain(opts.chain, async (client) => {
    const params = await client.getTransactionParams().do();
    const freshGs = await readGlobalState(client, opts.appId);

    // Calculate updated APR
    const totalStaked = freshGs.total_staked || 1;
    const rewardAmount = freshGs.reward_token_amount || 0;
    const poolTime = freshGs.pool_time || 1;
    let updatedApr = (rewardAmount / totalStaked) * 100 * ((86400 * 360) / poolTime);
    if (!isFinite(updatedApr)) updatedApr = 0;
    const aprScaled = Math.floor(updatedApr * 100);

    // Reward token needed for inner txn
    const rewardToken = freshGs.reward_token || 0;
    const foreignAssets = rewardToken > 0 ? [rewardToken] : [];

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: opts.appId,
      method,
      methodArgs: [BigInt(aprScaled)],
      sender: treasuryAddr,
      signer,
      suggestedParams: { ...params, fee: 3000, flatFee: true },
      boxes: [{ appIndex: opts.appId, name: algosdk.decodeAddress(treasuryAddr.toString()).publicKey }],
      appForeignAssets: foreignAssets,
    });

    const result = await atc.execute(client, 4);
    console.log(`CLAIM SUCCESS — TX: ${result.txIDs[0]}`);
  });
}

async function doUnstake(opts, abiContract, algod, treasuryAddr, treasurySk, signer, appAddr, gs) {
  const method = abiContract.getMethodByName('unstakeTokens');

  await withFallbackForChain(opts.chain, async (client) => {
    const params = await client.getTransactionParams().do();
    const freshGs = await readGlobalState(client, opts.appId);

    // Calculate updated APR
    const totalStaked = freshGs.total_staked || 1;
    const rewardAmount = freshGs.reward_token_amount || 0;
    const poolTime = freshGs.pool_time || 1;
    let updatedApr = (rewardAmount / (totalStaked - opts.amount || 1)) * 100 * ((86400 * 360) / poolTime);
    if (!isFinite(updatedApr)) updatedApr = 0;
    const aprScaled = Math.floor(updatedApr * 100);

    // Foreign assets for inner txns (stake return + reward return)
    const stakeTokenId = freshGs.stake_token || 0;
    const rewardToken = freshGs.reward_token || 0;
    const foreignAssets = [];
    if (stakeTokenId > 0) foreignAssets.push(stakeTokenId);
    if (rewardToken > 0 && !foreignAssets.includes(rewardToken)) foreignAssets.push(rewardToken);

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: opts.appId,
      method,
      methodArgs: [BigInt(opts.amount), BigInt(aprScaled)],
      sender: treasuryAddr,
      signer,
      suggestedParams: { ...params, fee: 4000, flatFee: true },
      boxes: [{ appIndex: opts.appId, name: algosdk.decodeAddress(treasuryAddr.toString()).publicKey }],
      appForeignAssets: foreignAssets,
    });

    const result = await atc.execute(client, 4);
    console.log(`UNSTAKE SUCCESS — TX: ${result.txIDs[0]}`);
    console.log(`Unstaked: ${opts.amount / 1e6} tokens`);
  });
}

main().catch((err) => {
  console.error('\n=== TEST FAILED ===');
  console.error(err.message || err);
  if (err.response?.body) console.error('Response:', JSON.stringify(err.response.body));
  process.exit(1);
});
