/**
 * Phase 3 — Setup Script
 * Generates testnet accounts, funds them, creates test NFTs, distributes to staker.
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

async function fundFromDispenser(address, amountMicroAlgo) {
  const addrStr = address.toString();
  // Try multiple dispenser endpoints
  const dispensers = [
    {
      url: `https://dispenser.testnet.aws.algodev.network/fund?amount=${amountMicroAlgo}&address=${addrStr}`,
      method: 'POST',
      body: null,
    },
  ];

  for (const d of dispensers) {
    try {
      const resp = await fetch(d.url, {
        method: d.method,
        body: d.body,
        headers: d.body ? { 'Content-Type': 'application/json' } : {},
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        console.log(`  Funded ${addrStr.substring(0, 8)}... with ${amountMicroAlgo / 1e6} ALGO via dispenser`);
        return true;
      }
      console.log(`  Dispenser returned ${resp.status}: ${await resp.text().catch(() => '')}`);
    } catch (err) {
      console.log(`  Dispenser error: ${err.message}`);
    }
  }
  return false;
}

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
  console.log(`  Created ASA "${params.assetName}" (${params.unitName}): ID=${assetId}, txId=${txid}`);
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
  console.log('=== FryNftStaking Testnet Setup ===\n');

  const configPath = path.join(__dirname, 'test_config.json');
  let creator, staker;

  // Check if we have existing accounts to resume from
  if (fs.existsSync(configPath)) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (existing.creator?.mnemonic && existing.staker?.mnemonic) {
      console.log('Found existing accounts from previous run, reconstructing...');
      creator = algosdk.mnemonicToSecretKey(existing.creator.mnemonic);
      staker = algosdk.mnemonicToSecretKey(existing.staker.mnemonic);

      // Check if NFTs already created
      if (existing.nft1Id > 0 && existing.nft2Id > 0 && existing.funded) {
        console.log('Setup already complete! NFTs already created.');
        console.log(`  Creator: ${creator.addr.toString()}`);
        console.log(`  Staker:  ${staker.addr.toString()}`);
        console.log(`  NFT1 ID: ${existing.nft1Id}`);
        console.log(`  NFT2 ID: ${existing.nft2Id}`);
        return;
      }
    }
  }

  // Generate new accounts if we don't have existing ones
  if (!creator || !staker) {
    console.log('1. Generating new accounts...');
    creator = algosdk.generateAccount();
    staker = algosdk.generateAccount();

    // Save config IMMEDIATELY so mnemonics are never lost
    const earlyConfig = {
      network: 'testnet',
      algodServer: ALGOD_SERVER,
      algodPort: ALGOD_PORT,
      algodToken: ALGOD_TOKEN,
      creator: { addr: creator.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(creator.sk) },
      staker: { addr: staker.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(staker.sk) },
      nft1Id: 0,
      nft2Id: 0,
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
    console.log('Please fund these accounts (need ~4 ALGO each):');
    console.log(`  Creator: ${creator.addr.toString()}`);
    console.log(`  Staker:  ${staker.addr.toString()}`);
    console.log('\nThen re-run this script.');
    process.exit(1);
  }

  console.log(`  Creator: ${creatorBal / 1e6} ALGO`);
  console.log(`  Staker:  ${stakerBal / 1e6} ALGO`);

  // 3. Create test NFTs from creator
  console.log('\n3. Creating test NFTs...');
  const nft1Id = await createASA(creator, {
    total: 1,
    decimals: 0,
    unitName: 'TNFT1',
    assetName: 'TestNFT1',
  });
  const nft2Id = await createASA(creator, {
    total: 1,
    decimals: 0,
    unitName: 'TNFT2',
    assetName: 'TestNFT2',
  });

  // 4. Staker opts into both NFTs
  console.log('\n4. Staker opting into NFTs...');
  await optInASA(staker, nft1Id);
  await optInASA(staker, nft2Id);

  // 5. Transfer NFTs to staker
  console.log('\n5. Transferring NFTs to staker...');
  await transferASA(creator, staker, nft1Id, 1);
  await transferASA(creator, staker, nft2Id, 1);

  // 6. Write config
  const config = {
    network: 'testnet',
    algodServer: ALGOD_SERVER,
    algodPort: ALGOD_PORT,
    algodToken: ALGOD_TOKEN,
    creator: { addr: creator.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(creator.sk) },
    staker: { addr: staker.addr.toString(), mnemonic: algosdk.secretKeyToMnemonic(staker.sk) },
    nft1Id,
    nft2Id,
    funded: true,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('\n=== Setup Complete ===');
  console.log(`Config written to ${configPath}`);
  console.log(`Creator: ${creator.addr.toString()}`);
  console.log(`Staker:  ${staker.addr.toString()}`);
  console.log(`NFT1 ID: ${nft1Id}`);
  console.log(`NFT2 ID: ${nft2Id}`);
  console.log(`\nPera Explorer links:`);
  console.log(`  NFT1: https://testnet.explorer.perawallet.app/asset/${nft1Id}/`);
  console.log(`  NFT2: https://testnet.explorer.perawallet.app/asset/${nft2Id}/`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
