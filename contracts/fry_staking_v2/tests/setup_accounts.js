/**
 * FryStaking V2 — Testnet Setup Script
 * Creates testnet wallets, fungible test ASAs, and distributes tokens.
 * Outputs test_config.json for smoke_test.js to consume.
 *
 * Usage: NODE_PATH=/opt/fry-farm/backend/node_modules node setup_accounts.js
 */

const algosdk = require('algosdk');
const fs = require('fs');
const path = require('path');

const ALGOD_SERVER = 'https://testnet-api.4160.nodely.dev';
const ALGOD_PORT = 443;
const ALGOD_TOKEN = '';

const algod = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

async function waitForBalance(address, minBalance, timeoutMs = 120000) {
  const addrStr = address.toString();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const info = await algod.accountInformation(addrStr).do();
      const balance = Number(info.amount);
      if (balance >= minBalance) {
        console.log(`  ${addrStr.substring(0, 8)}... balance: ${balance / 1e6} ALGO`);
        return balance;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 3000));
  }
  return 0;
}

async function createASA(account, params) {
  const sp = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    total: params.total,
    decimals: params.decimals,
    defaultFrozen: false,
    unitName: params.unitName,
    assetName: params.assetName,
    suggestedParams: sp,
  });
  const signed = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const result = await algosdk.waitForConfirmation(algod, txid, 4);
  const assetId = Number(result.assetIndex);
  console.log(`  Created ASA "${params.assetName}" (${params.unitName}): ID=${assetId}, decimals=${params.decimals}, total=${params.total}`);
  return assetId;
}

async function optInASA(account, assetId) {
  const sp = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    receiver: account.addr,
    amount: 0,
    assetIndex: assetId,
    suggestedParams: sp,
  });
  const signed = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  console.log(`  ${account.addr.toString().substring(0, 8)}... opted in to ASA ${assetId}`);
}

async function transferASA(sender, receiver, assetId, amount) {
  const sp = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: sender.addr,
    receiver: receiver.addr,
    amount,
    assetIndex: assetId,
    suggestedParams: sp,
  });
  const signed = txn.signTxn(sender.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  console.log(`  Sent ${amount} of ASA ${assetId} to ${receiver.addr.toString().substring(0, 8)}...`);
}

async function main() {
  console.log('=== FryStaking V2 Testnet Setup ===\n');

  const configPath = path.join(__dirname, 'test_config.json');
  let creator, staker;

  // Check for existing accounts
  if (fs.existsSync(configPath)) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (existing.creator?.mnemonic && existing.staker?.mnemonic) {
      console.log('Found existing accounts from previous run, reconstructing...');
      creator = algosdk.mnemonicToSecretKey(existing.creator.mnemonic);
      staker = algosdk.mnemonicToSecretKey(existing.staker.mnemonic);

      if (existing.stakeASAId > 0 && existing.rewardASAId > 0 && existing.funded) {
        console.log('Setup already complete! ASAs already created.');
        console.log(`  Creator:    ${creator.addr.toString()}`);
        console.log(`  Staker:     ${staker.addr.toString()}`);
        console.log(`  Stake ASA:  ${existing.stakeASAId}`);
        console.log(`  Reward ASA: ${existing.rewardASAId}`);
        return;
      }
    }
  }

  // Generate new accounts if needed
  if (!creator || !staker) {
    console.log('1. Generating new accounts...');
    creator = algosdk.generateAccount();
    staker = algosdk.generateAccount();

    // Save immediately so mnemonics are never lost
    const earlyConfig = {
      network: 'testnet',
      algodServer: ALGOD_SERVER,
      algodPort: ALGOD_PORT,
      algodToken: ALGOD_TOKEN,
      creator: { addr: creator.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(creator.sk) },
      staker: { addr: staker.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(staker.sk) },
      stakeASAId: 0,
      rewardASAId: 0,
      funded: false,
    };
    fs.writeFileSync(configPath, JSON.stringify(earlyConfig, null, 2));
    console.log('  Config saved (mnemonics preserved).');
  }
  console.log(`  Creator: ${creator.addr.toString()}`);
  console.log(`  Staker:  ${staker.addr.toString()}`);

  // Check balances
  console.log('\n2. Checking balances...');
  const creatorBal = await waitForBalance(creator.addr, 1_000_000, 10000);
  const stakerBal = await waitForBalance(staker.addr, 1_000_000, 10000);

  if (!creatorBal || !stakerBal) {
    console.log('\n*** ACCOUNTS NOT FUNDED ***');
    console.log('Please fund these accounts (need ~5 ALGO each):');
    console.log(`  Creator: ${creator.addr.toString()}`);
    console.log(`  Staker:  ${staker.addr.toString()}`);
    console.log('\nThen re-run this script.');
    process.exit(1);
  }

  console.log(`  Creator: ${creatorBal / 1e6} ALGO`);
  console.log(`  Staker:  ${stakerBal / 1e6} ALGO`);

  // 3. Create fungible test ASAs from creator
  console.log('\n3. Creating fungible test ASAs...');
  const stakeASAId = await createASA(creator, {
    total: 10_000_000_000,  // 10B base units = 10,000 tokens (6 decimals)
    decimals: 6,
    unitName: 'TSTK',
    assetName: 'TestStakeToken',
  });
  const rewardASAId = await createASA(creator, {
    total: 10_000_000_000,  // 10B base units = 10,000 tokens (6 decimals)
    decimals: 6,
    unitName: 'TRWD',
    assetName: 'TestRewardToken',
  });

  // 4. Staker opts into both ASAs
  console.log('\n4. Staker opting into ASAs...');
  await optInASA(staker, stakeASAId);
  await optInASA(staker, rewardASAId);

  // 5. Transfer 500M TSTK to staker for staking
  console.log('\n5. Transferring TSTK to staker...');
  await transferASA(creator, staker, stakeASAId, 500_000_000);

  // 6. Write final config
  const config = {
    network: 'testnet',
    algodServer: ALGOD_SERVER,
    algodPort: ALGOD_PORT,
    algodToken: ALGOD_TOKEN,
    creator: { addr: creator.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(creator.sk) },
    staker: { addr: staker.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(staker.sk) },
    stakeASAId,
    rewardASAId,
    funded: true,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('\n=== Setup Complete ===');
  console.log(`Config written to ${configPath}`);
  console.log(`Creator:    ${creator.addr.toString()}`);
  console.log(`Staker:     ${staker.addr.toString()}`);
  console.log(`Stake ASA:  ${stakeASAId}`);
  console.log(`Reward ASA: ${rewardASAId}`);
  console.log(`\nPera Explorer links:`);
  console.log(`  Stake:  https://testnet.explorer.perawallet.app/asset/${stakeASAId}/`);
  console.log(`  Reward: https://testnet.explorer.perawallet.app/asset/${rewardASAId}/`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
