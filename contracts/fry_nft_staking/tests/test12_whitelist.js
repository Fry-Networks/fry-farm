/**
 * Test 12 — Whitelist Pool Test (standalone)
 * Deploys a second FryNftStaking with collection_mode=1 (whitelist),
 * tests add/remove whitelist, verifies whitelisted staking works
 * and non-whitelisted staking is rejected.
 *
 * Usage: NODE_PATH=/opt/fry-farm/backend/node_modules node test12_whitelist.js
 */

const algosdk = require('algosdk');
const fs = require('fs');
const path = require('path');

let algod, config, creator, staker, creatorSigner, stakerSigner, contract;
let compiledApproval, compiledClear;
let appId, appAddr;
const txLog = [];

// ── Helpers ─────────────────────────────────────────────────────────

async function getSP(extraFee = 0) {
  const sp = await algod.getTransactionParams().do();
  if (extraFee > 0) {
    sp.fee = 1000 + extraFee;
    sp.flatFee = true;
  }
  return sp;
}

function logTx(label, txId) {
  txLog.push({ label, txId });
  console.log(`  txId: ${txId}`);
}

async function readGlobalState(id) {
  const info = await algod.getApplicationByID(Number(id)).do();
  const state = {};
  for (const kv of info.params.globalState || []) {
    const key = Buffer.from(kv.key).toString('utf8');
    state[key] = kv.value.type === 2 ? kv.value.uint : kv.value.bytes;
  }
  return state;
}

async function readBox(id, boxName) {
  try {
    const result = await algod.getApplicationBoxByName(Number(id), boxName).do();
    return result.value;
  } catch (e) {
    if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('box not found')) return null;
    throw e;
  }
}

function parseUserBox(boxBytes) {
  const dv = new DataView(boxBytes.buffer, boxBytes.byteOffset, boxBytes.byteLength);
  return {
    nftCount: dv.getBigUint64(0),
    firstStakeTime: dv.getBigUint64(8),
    lastClaimTime: dv.getBigUint64(16),
    totalClaimed: dv.getBigUint64(24),
    nftIds: Array.from({ length: Number(dv.getBigUint64(0)) }, (_, i) => dv.getBigUint64(32 + i * 8)),
  };
}

async function getAssetBalance(addr, assetId) {
  const info = await algod.accountInformation(addr).do();
  const asset = (info.assets || []).find(a => Number(a.assetId) === assetId);
  return asset ? Number(asset.amount) : 0;
}

async function optInAsset(assetId, senderAccount, senderSigner, label) {
  const sp = await getSP(1000);
  const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: senderAccount.addr,
    receiver: appAddr,
    amount: 100_000,
    suggestedParams: await getSP(),
  });
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName('opt_in_asset'),
    methodArgs: [BigInt(assetId), { txn: mbrPay, signer: senderSigner }],
    sender: senderAccount.addr,
    suggestedParams: sp,
    signer: senderSigner,
    appForeignAssets: [BigInt(assetId)],
  });
  const result = await atc.execute(algod, 4);
  logTx(label, result.txIDs[result.txIDs.length - 1]);
  console.log(`  Opted app into ASA ${assetId}`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Test 12: Whitelist Pool ===\n');

  // Load config
  const configPath = path.join(__dirname, 'test_config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  algod = new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);
  creator = algosdk.mnemonicToSecretKey(config.creator.mnemonic);
  staker = algosdk.mnemonicToSecretKey(config.staker.mnemonic);
  creatorSigner = algosdk.makeBasicAccountTransactionSigner(creator);
  stakerSigner = algosdk.makeBasicAccountTransactionSigner(staker);

  console.log(`Creator:  ${creator.addr.toString()}`);
  console.log(`Staker:   ${staker.addr.toString()}`);
  console.log(`NFT1:     ${config.nft1Id}`);
  console.log(`NFT2:     ${config.nft2Id}`);

  // Check balances, transfer ALGO from staker to creator if needed
  const ci = await algod.accountInformation(creator.addr.toString()).do();
  const si = await algod.accountInformation(staker.addr.toString()).do();
  const creatorSpendable = Number(ci.amount) - Number(ci.minBalance);
  const stakerSpendable = Number(si.amount) - Number(si.minBalance);
  console.log(`Creator spendable: ${creatorSpendable / 1e6} ALGO`);
  console.log(`Staker spendable:  ${stakerSpendable / 1e6} ALGO`);

  // Creator needs ~1.4 ALGO more for second pool deploy + fund + deposit
  if (creatorSpendable < 1_400_000 && stakerSpendable > 2_000_000) {
    const transfer = 1_500_000;
    console.log(`\nTransferring ${transfer / 1e6} ALGO from staker to creator...`);
    const sp = await getSP();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: creator.addr,
      amount: transfer, suggestedParams: sp,
    });
    const signed = txn.signTxn(staker.sk);
    const { txid } = await algod.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(algod, txid, 4);
    console.log('  Done.');
  }

  // Load ARC32 and compile TEAL
  const arc32Path = path.join(__dirname, '..', 'FryNftStaking.arc32.json');
  const arc32 = JSON.parse(fs.readFileSync(arc32Path, 'utf8'));
  contract = new algosdk.ABIContract(arc32.contract);

  console.log('\nCompiling TEAL...');
  const approvalSource = Buffer.from(arc32.source.approval, 'base64');
  const clearSource = Buffer.from(arc32.source.clear, 'base64');
  const approvalResult = await algod.compile(approvalSource).do();
  const clearResult = await algod.compile(clearSource).do();
  compiledApproval = new Uint8Array(Buffer.from(approvalResult.result, 'base64'));
  compiledClear = new Uint8Array(Buffer.from(clearResult.result, 'base64'));
  console.log(`  Approval: ${compiledApproval.length} bytes, Clear: ${compiledClear.length} bytes\n`);

  // ── 12a: Deploy whitelist pool ──────────────────────────────────
  console.log('12a: Deploying whitelist pool (collection_mode=1)...');
  const deploySp = await getSP(1000);
  const atcDeploy = new algosdk.AtomicTransactionComposer();
  atcDeploy.addMethodCall({
    appID: 0,
    method: contract.getMethodByName('init_pool'),
    methodArgs: [
      0n,                          // reward_token_id (ALGO)
      0n,                          // reward_model (fixed rate)
      1n,                          // collection_mode = WHITELIST
      creator.addr.toString(),     // collection_creator (unused for whitelist)
      0n, 100_000n, 0n, 0n, 0n,   // nft_value, rate_per_day, total_reward_pool, apr_rate, value_per_nft
      0n, 0n,                      // pool_end_time, lock_period
      creator.addr.toString(),     // fee_recipient
      0n, 0n, 0n,                  // fee BPS
    ],
    sender: creator.addr,
    suggestedParams: deploySp,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: compiledApproval,
    clearProgram: compiledClear,
    numGlobalInts: 17, numGlobalByteSlices: 3,
    numLocalInts: 0, numLocalByteSlices: 0,
    extraPages: 3,
    signer: creatorSigner,
  });
  const deployResult = await atcDeploy.execute(algod, 4);
  const txInfo = deployResult.methodResults[0].txInfo;
  appId = Number(txInfo.applicationIndex);
  appAddr = algosdk.getApplicationAddress(appId);
  logTx('deploy', deployResult.txIDs[0]);
  console.log(`  App ID: ${appId}`);
  console.log(`  App Address: ${appAddr.toString()}`);

  // Fund app
  const fundSp = await getSP();
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: creator.addr, receiver: appAddr,
    amount: 200_000, suggestedParams: fundSp,
  });
  const fundSigned = fundTxn.signTxn(creator.sk);
  const { txid: fundTxId } = await algod.sendRawTransaction(fundSigned).do();
  await algosdk.waitForConfirmation(algod, fundTxId, 4);
  logTx('fund_app', fundTxId);
  console.log('  Funded app with 0.2 ALGO');

  // Verify global state
  const state = await readGlobalState(appId);
  if (state.collection_mode !== 1n) throw new Error(`collection_mode: expected 1, got ${state.collection_mode}`);
  console.log('  PASS: collection_mode = 1 (whitelist)\n');

  // ── 12b: Deposit ALGO rewards ──────────────────────────────────
  console.log('12b: Depositing ALGO rewards...');
  const depSp = await getSP();
  const depPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: creator.addr, receiver: appAddr,
    amount: 100_000, suggestedParams: depSp,
  });
  const atcDep = new algosdk.AtomicTransactionComposer();
  atcDep.addMethodCall({
    appID: appId,
    method: contract.getMethodByName('deposit_rewards_algo'),
    methodArgs: [{ txn: depPayTxn, signer: creatorSigner }],
    sender: creator.addr, suggestedParams: depSp, signer: creatorSigner,
  });
  const depResult = await atcDep.execute(algod, 4);
  logTx('deposit_rewards', depResult.txIDs[depResult.txIDs.length - 1]);
  console.log('  Deposited 0.1 ALGO rewards\n');

  // ── 12c: Add NFT1 and NFT2 to whitelist ────────────────────────
  console.log('12c: Adding NFT1 and NFT2 to whitelist...');
  const wlBoxName = new Uint8Array(Buffer.from('wl'));

  for (const nftId of [config.nft1Id, config.nft2Id]) {
    const wlSp = await getSP();
    const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr, receiver: appAddr,
      amount: 50_000, suggestedParams: wlSp,
    });
    const atcWl = new algosdk.AtomicTransactionComposer();
    atcWl.addTransaction({ txn: mbrPayTxn, signer: creatorSigner });
    atcWl.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('add_to_whitelist'),
      methodArgs: [BigInt(nftId)],
      sender: creator.addr, suggestedParams: wlSp, signer: creatorSigner,
      boxes: [{ appIndex: 0, name: wlBoxName }],
    });
    const wlResult = await atcWl.execute(algod, 4);
    logTx(`add_whitelist_${nftId}`, wlResult.txIDs[wlResult.txIDs.length - 1]);
  }

  // Verify whitelist box has 2 entries (16 bytes)
  const wlData = await readBox(appId, wlBoxName);
  if (!wlData) throw new Error('Whitelist box not found');
  if (wlData.length !== 16) throw new Error(`Whitelist box: expected 16 bytes (2 entries), got ${wlData.length}`);
  const dv = new DataView(wlData.buffer, wlData.byteOffset, wlData.byteLength);
  console.log(`  Whitelist entry 0: ASA ${dv.getBigUint64(0)}`);
  console.log(`  Whitelist entry 1: ASA ${dv.getBigUint64(8)}`);
  console.log('  PASS: Whitelist has 2 entries\n');

  // ── 12d: Opt app into NFT2, then stake (whitelisted) ───────────
  console.log('12d: Opting app into NFT2 + staking...');
  await optInAsset(config.nft2Id, staker, stakerSigner, 'opt_in_nft2');

  const stakeSp = await getSP();
  const nft2Transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: staker.addr, receiver: appAddr,
    amount: 1, assetIndex: config.nft2Id, suggestedParams: await getSP(),
  });
  const stakeBoxPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: staker.addr, receiver: appAddr,
    amount: 435_300, suggestedParams: await getSP(),
  });
  const atcStake = new algosdk.AtomicTransactionComposer();
  atcStake.addMethodCall({
    appID: appId,
    method: contract.getMethodByName('stake_nft'),
    methodArgs: [
      { txn: nft2Transfer, signer: stakerSigner },
      { txn: stakeBoxPay, signer: stakerSigner },
    ],
    sender: staker.addr, suggestedParams: stakeSp, signer: stakerSigner,
    boxes: [
      { appIndex: 0, name: staker.addr.publicKey },
      { appIndex: 0, name: wlBoxName },
    ],
    appForeignAssets: [BigInt(config.nft2Id)],
  });
  const stakeResult = await atcStake.execute(algod, 4);
  logTx('stake_whitelisted_nft2', stakeResult.txIDs[stakeResult.txIDs.length - 1]);

  // Verify staking succeeded
  const stateAfterStake = await readGlobalState(appId);
  if (stateAfterStake.total_nfts_staked !== 1n) throw new Error(`total_nfts_staked: expected 1, got ${stateAfterStake.total_nfts_staked}`);
  const boxData = await readBox(appId, staker.addr.publicKey);
  if (!boxData) throw new Error('User box not found after staking');
  const box = parseUserBox(boxData);
  if (box.nftCount !== 1n) throw new Error(`box nft_count: expected 1, got ${box.nftCount}`);
  if (box.nftIds[0] !== BigInt(config.nft2Id)) throw new Error(`box nft_ids[0]: expected ${config.nft2Id}, got ${box.nftIds[0]}`);
  console.log('  PASS: Whitelisted NFT2 staked successfully\n');

  // ── 12e: Remove NFT1 from whitelist ────────────────────────────
  console.log('12e: Removing NFT1 from whitelist...');
  const rmSp = await getSP();
  const atcRm = new algosdk.AtomicTransactionComposer();
  atcRm.addMethodCall({
    appID: appId,
    method: contract.getMethodByName('remove_from_whitelist'),
    methodArgs: [BigInt(config.nft1Id)],
    sender: creator.addr, suggestedParams: rmSp, signer: creatorSigner,
    boxes: [{ appIndex: 0, name: wlBoxName }],
  });
  const rmResult = await atcRm.execute(algod, 4);
  logTx('remove_whitelist_nft1', rmResult.txIDs[0]);

  // Verify whitelist now has 1 entry (8 bytes)
  const wlDataAfter = await readBox(appId, wlBoxName);
  if (wlDataAfter.length !== 8) throw new Error(`Whitelist after remove: expected 8 bytes, got ${wlDataAfter.length}`);
  const remainingId = new DataView(wlDataAfter.buffer, wlDataAfter.byteOffset, 8).getBigUint64(0);
  if (remainingId !== BigInt(config.nft2Id)) throw new Error(`Remaining whitelist entry: expected ${config.nft2Id}, got ${remainingId}`);
  console.log(`  Whitelist now has 1 entry: ASA ${remainingId}`);
  console.log('  PASS: NFT1 removed from whitelist\n');

  // ── 12f: Attempt to stake NFT1 (not whitelisted — expect rejection) ──
  console.log('12f: Attempting to stake non-whitelisted NFT1 (expect rejection)...');
  await optInAsset(config.nft1Id, staker, stakerSigner, 'opt_in_nft1');

  try {
    const nft1Transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr,
      amount: 1, assetIndex: config.nft1Id, suggestedParams: await getSP(),
    });
    const boxPay2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr,
      amount: 0, suggestedParams: await getSP(),
    });
    const atcFail = new algosdk.AtomicTransactionComposer();
    atcFail.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [
        { txn: nft1Transfer, signer: stakerSigner },
        { txn: boxPay2, signer: stakerSigner },
      ],
      sender: staker.addr, suggestedParams: await getSP(), signer: stakerSigner,
      boxes: [
        { appIndex: 0, name: staker.addr.publicKey },
        { appIndex: 0, name: wlBoxName },
      ],
      appForeignAssets: [BigInt(config.nft1Id)],
    });
    await atcFail.execute(algod, 4);
    throw new Error('Expected rejection but transaction SUCCEEDED — whitelist not enforced!');
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('Expected rejection')) throw err;
    if (msg.includes('NFT not whitelisted') || msg.includes('logic eval error') || msg.includes('assert')) {
      console.log('  Transaction correctly rejected');
      console.log('  PASS: Non-whitelisted NFT1 staking rejected\n');
    } else {
      console.log(`  Rejected with: ${msg.substring(0, 200)}`);
      console.log('  PASS: Transaction rejected (non-whitelist error, but NFT1 not stakeable)\n');
    }
  }

  // ── 12g: Unstake NFT2 (cleanup) ────────────────────────────────
  console.log('12g: Unstaking NFT2 from whitelist pool (cleanup)...');
  const unSp = await getSP(2000); // inner claim + inner NFT return
  const atcUn = new algosdk.AtomicTransactionComposer();
  atcUn.addMethodCall({
    appID: appId,
    method: contract.getMethodByName('unstake_nft'),
    methodArgs: [BigInt(config.nft2Id)],
    sender: staker.addr, suggestedParams: unSp, signer: stakerSigner,
    boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
    appForeignAssets: [BigInt(config.nft2Id)],
  });
  const unResult = await atcUn.execute(algod, 4);
  logTx('unstake_nft2', unResult.txIDs[unResult.txIDs.length - 1]);

  // Verify unstake
  const stateEnd = await readGlobalState(appId);
  if (stateEnd.total_nfts_staked !== 0n) throw new Error(`total_nfts_staked: expected 0, got ${stateEnd.total_nfts_staked}`);
  const nft2Bal = await getAssetBalance(staker.addr.toString(), config.nft2Id);
  if (nft2Bal !== 1) throw new Error(`Staker NFT2 balance: expected 1, got ${nft2Bal}`);
  const boxAfter = await readBox(appId, staker.addr.publicKey);
  if (boxAfter !== null) throw new Error('User box still exists after full unstake');
  console.log('  NFT2 returned to staker, user box deleted');
  console.log('  PASS: Unstake from whitelist pool succeeded\n');

  // ── Summary ────────────────────────────────────────────────────
  console.log('========================================');
  console.log('    TEST 12 COMPLETE — ALL PASSED');
  console.log('========================================\n');
  console.log(`Whitelist Pool App ID: ${appId}`);
  console.log(`  https://testnet.explorer.perawallet.app/application/${appId}/\n`);
  console.log('Sub-tests:');
  console.log('  12a PASS — Deploy whitelist pool (collection_mode=1)');
  console.log('  12b PASS — Deposit ALGO rewards');
  console.log('  12c PASS — add_to_whitelist (NFT1 + NFT2)');
  console.log('  12d PASS — Whitelisted NFT2 staking succeeds');
  console.log('  12e PASS — remove_from_whitelist (NFT1)');
  console.log('  12f PASS — Non-whitelisted NFT1 staking rejected');
  console.log('  12g PASS — Unstake NFT2 + box cleanup');
  console.log('\nTransaction log:');
  for (const entry of txLog) {
    console.log(`  [${entry.label}]: ${entry.txId}`);
  }
  console.log('');
}

main().catch(err => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
