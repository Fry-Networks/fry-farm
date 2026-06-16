#!/usr/bin/env node
/**
 * One-time opt-in for the REWARD_MNEMONIC treasury address to aVOI + FRY ASAs.
 *
 * The swap pipeline routes aVOI through this address, so it must be opted in
 * to both aVOI (receive bridged tokens) and FRY (hold swap output before forwarding).
 *
 * Safe to re-run — skips already opted-in assets.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const algosdk = require('algosdk');
const { withFallbackForChain, getAlgodClientForChain } = require('../services/algodService');
const { getTreasury } = require('../services/stakingClaimService');

const CHAIN_ID = 'algorand-mainnet';
const ASSETS = [
  { id: 2320775407, name: 'aVOI' },
  { id: 2485314946, name: 'FRY' },
];

async function isOptedIn(client, addr, asaId) {
  try {
    await client.accountAssetInformation(addr, asaId).do();
    return true;
  } catch (err) {
    if (err.message?.includes('404') || err.status === 404) return false;
    throw err;
  }
}

async function main() {
  const { addr, sk } = getTreasury(CHAIN_ID);
  const addrStr = addr.toString();
  console.log(`Treasury address: ${addrStr}\n`);

  const client = getAlgodClientForChain(CHAIN_ID);

  for (const asset of ASSETS) {
    const optedIn = await isOptedIn(client, addrStr, asset.id);
    if (optedIn) {
      console.log(`${asset.name} (${asset.id}): already opted in`);
      continue;
    }

    console.log(`${asset.name} (${asset.id}): opting in...`);

    const txId = await withFallbackForChain(CHAIN_ID, async (algod) => {
      const params = await algod.getTransactionParams().do();
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: addr,
        receiver: addr,
        amount: 0,
        assetIndex: asset.id,
        suggestedParams: params,
      });
      const signedTxn = txn.signTxn(sk);
      const { txid } = await algod.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(algod, txid, 4);
      return txid;
    });

    console.log(`${asset.name} (${asset.id}): opted in — txId=${txId}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
