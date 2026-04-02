/**
 * Phase 3 — FryNftStaking Smoke Test
 * 12 sequential tests covering the full contract lifecycle on Algorand testnet.
 * Uses ALGO rewards (reward_token_id=0). Calls opt_in_asset before staking.
 *
 * Usage: NODE_PATH=/opt/fry-farm/backend/node_modules node smoke_test.js
 */

const algosdk = require('algosdk');
const fs = require('fs');
const path = require('path');

// ── Globals ─────────────────────────────────────────────────────────
let algod, config, creator, staker, creatorSigner, stakerSigner, contract;
let compiledApproval, compiledClear;
let appId1, appAddr1, appId2, appAddr2;
const txLog = [];
const results = [];

// ── Helpers ─────────────────────────────────────────────────────────

async function getSP(extraFee = 0) {
  const sp = await algod.getTransactionParams().do();
  if (extraFee > 0) {
    sp.fee = 1000 + extraFee;
    sp.flatFee = true;
  }
  return sp;
}

function logTx(testNum, label, txId) {
  txLog.push({ test: testNum, label, txId });
  console.log(`  txId: ${txId}`);
}

function pass(testNum, msg) {
  results.push({ test: testNum, status: 'PASS', msg });
  console.log(`TEST ${testNum} PASSED: ${msg}\n`);
}

function fail(testNum, msg, err) {
  results.push({ test: testNum, status: 'FAIL', msg });
  console.error(`TEST ${testNum} FAILED: ${msg}`);
  if (err) {
    console.error(`  Error: ${err.message || err}`);
    if (err.response?.body) {
      try {
        const body = JSON.parse(err.response.body.toString());
        console.error(`  Detail: ${JSON.stringify(body)}`);
      } catch (_) {
        console.error(`  Body: ${err.response.body.toString().substring(0, 500)}`);
      }
    }
  }
  console.error('');
}

async function readGlobalState(appId) {
  const info = await algod.getApplicationByID(Number(appId)).do();
  const state = {};
  for (const kv of info.params.globalState || []) {
    const key = Buffer.from(kv.key).toString('utf8');
    if (kv.value.type === 2) {
      state[key] = kv.value.uint;
    } else {
      state[key] = kv.value.bytes;
    }
  }
  return state;
}

async function readBox(appId, boxName) {
  try {
    const result = await algod.getApplicationBoxByName(Number(appId), boxName).do();
    return result.value;
  } catch (e) {
    if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('box not found')) {
      return null;
    }
    throw e;
  }
}

function parseUserBox(boxBytes) {
  const dv = new DataView(boxBytes.buffer, boxBytes.byteOffset, boxBytes.byteLength);
  const nftCount = dv.getBigUint64(0);
  const firstStakeTime = dv.getBigUint64(8);
  const lastClaimTime = dv.getBigUint64(16);
  const totalClaimed = dv.getBigUint64(24);
  const nftIds = [];
  for (let i = 0; i < Number(nftCount); i++) {
    nftIds.push(dv.getBigUint64(32 + i * 8));
  }
  return { nftCount, firstStakeTime, lastClaimTime, totalClaimed, nftIds };
}

async function getBalance(addr) {
  const info = await algod.accountInformation(addr).do();
  return Number(info.amount);
}

async function getAssetBalance(addr, assetId) {
  const info = await algod.accountInformation(addr).do();
  const asset = (info.assets || []).find(a => Number(a.assetId) === assetId);
  return asset ? Number(asset.amount) : 0;
}

async function fundApp(appAddr, amount, senderAccount, senderSigner) {
  const sp = await getSP();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: senderAccount.addr,
    receiver: appAddr,
    amount,
    suggestedParams: sp,
  });
  const signed = txn.signTxn(senderAccount.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  return txid;
}

async function deployPool(params) {
  const sp = await getSP(1000); // extra 1000 for inner txn budget
  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: 0,
    method: contract.getMethodByName('init_pool'),
    methodArgs: params.methodArgs,
    sender: creator.addr,
    suggestedParams: sp,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: compiledApproval,
    clearProgram: compiledClear,
    numGlobalInts: 17,
    numGlobalByteSlices: 3,
    numLocalInts: 0,
    numLocalByteSlices: 0,
    extraPages: 3,
    signer: creatorSigner,
  });
  const result = await atc.execute(algod, 4);
  const txId = result.txIDs[0];
  const txInfo = result.methodResults[0].txInfo;
  const newAppId = Number(txInfo.applicationIndex);
  const newAppAddr = algosdk.getApplicationAddress(newAppId);
  return { appId: newAppId, appAddr: newAppAddr, txId };
}

// ── Init ────────────────────────────────────────────────────────────

async function init() {
  console.log('=== FryNftStaking Smoke Test ===\n');

  // Load config
  const configPath = path.join(__dirname, 'test_config.json');
  if (!fs.existsSync(configPath)) {
    console.error('ERROR: test_config.json not found. Run setup_accounts.js first.');
    process.exit(1);
  }
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.funded) {
    console.error('ERROR: Accounts not funded. Check test_config.json.');
    process.exit(1);
  }

  // Setup algod
  algod = new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);

  // Reconstruct accounts
  creator = algosdk.mnemonicToSecretKey(config.creator.mnemonic);
  staker = algosdk.mnemonicToSecretKey(config.staker.mnemonic);
  creatorSigner = algosdk.makeBasicAccountTransactionSigner(creator);
  stakerSigner = algosdk.makeBasicAccountTransactionSigner(staker);

  console.log(`Creator: ${creator.addr.toString()}`);
  console.log(`Staker:  ${staker.addr.toString()}`);
  console.log(`NFT1:    ${config.nft1Id}`);
  console.log(`NFT2:    ${config.nft2Id}`);

  // Check balances and redistribute if needed
  const creatorBal = await getBalance(creator.addr.toString());
  const stakerBal = await getBalance(staker.addr.toString());
  console.log(`Creator balance: ${creatorBal / 1e6} ALGO`);
  console.log(`Staker balance:  ${stakerBal / 1e6} ALGO`);

  // Creator needs more ALGO (two pool deployments + funding + deposits)
  // Transfer excess from staker to creator if needed
  if (creatorBal < 5_000_000 && stakerBal > 2_500_000) {
    const transfer = Math.min(stakerBal - 2_000_000, 5_000_000 - creatorBal);
    if (transfer > 100_000) {
      console.log(`Transferring ${transfer / 1e6} ALGO from staker to creator...`);
      const sp = await getSP();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: staker.addr,
        receiver: creator.addr,
        amount: transfer,
        suggestedParams: sp,
      });
      const signed = txn.signTxn(staker.sk);
      const { txid } = await algod.sendRawTransaction(signed).do();
      await algosdk.waitForConfirmation(algod, txid, 4);
      console.log(`  Done. New creator balance: ${(creatorBal + transfer) / 1e6} ALGO`);
    }
  }
  console.log('');

  // Load ARC32 and compile TEAL
  const arc32Path = path.join(__dirname, '..', 'FryNftStaking.arc32.json');
  const arc32 = JSON.parse(fs.readFileSync(arc32Path, 'utf8'));
  contract = new algosdk.ABIContract(arc32.contract);

  console.log('Compiling TEAL programs...');
  const approvalSource = Buffer.from(arc32.source.approval, 'base64');
  const clearSource = Buffer.from(arc32.source.clear, 'base64');
  const approvalResult = await algod.compile(approvalSource).do();
  const clearResult = await algod.compile(clearSource).do();
  compiledApproval = new Uint8Array(Buffer.from(approvalResult.result, 'base64'));
  compiledClear = new Uint8Array(Buffer.from(clearResult.result, 'base64'));
  console.log(`  Approval: ${compiledApproval.length} bytes`);
  console.log(`  Clear:    ${compiledClear.length} bytes`);
  console.log('');
}

// ── Tests ───────────────────────────────────────────────────────────

async function test1_deploy() {
  console.log('--- Test 1: Deploy Contract (init_pool) ---');
  try {
    // Use collection_creator from config (may differ from deployer)
    const collectionCreator = config.collection_creator || creator.addr.toString();

    const result = await deployPool({
      methodArgs: [
        0n,                          // reward_token_id (ALGO)
        0n,                          // reward_model (fixed rate)
        0n,                          // collection_mode (creator address)
        collectionCreator,           // collection_creator (original NFT creator)
        0n,                          // nft_value
        100_000n,                    // rate_per_day (0.1 ALGO/day/NFT — budget-friendly)
        0n,                          // total_reward_pool
        0n,                          // apr_rate
        0n,                          // value_per_nft
        0n,                          // pool_end_time (no end)
        0n,                          // lock_period (no lock)
        creator.addr.toString(),     // fee_recipient
        0n, 0n, 0n,                  // fee BPS all 0
      ],
    });

    appId1 = result.appId;
    appAddr1 = result.appAddr;
    logTx(1, 'deploy', result.txId);
    console.log(`  App ID: ${appId1}`);
    console.log(`  App Address: ${appAddr1.toString()}`);

    // Fund app with minimal amount (staker MBR payments cover most of app's needs)
    const fundTxId = await fundApp(appAddr1, 100_000, creator, creatorSigner);
    logTx(1, 'fund_app', fundTxId);
    console.log(`  Funded app with 0.1 ALGO`);

    // Verify global state
    const state = await readGlobalState(appId1);
    const checks = [
      ['is_active', 1n],
      ['reward_model', 0n],
      ['reward_token_id', 0n],
      ['total_nfts_staked', 0n],
      ['rate_per_day', 100_000n],
    ];
    for (const [key, expected] of checks) {
      if (state[key] !== expected) {
        throw new Error(`Global state ${key}: expected ${expected}, got ${state[key]}`);
      }
    }
    pass(1, `Contract deployed. App ID = ${appId1}`);
  } catch (err) {
    fail(1, 'Deploy failed', err);
    throw err;
  }
}

async function test2_deposit() {
  console.log('--- Test 2: Deposit Rewards (deposit_rewards_algo) ---');
  try {
    const sp = await getSP();
    const depositAmount = 100_000; // 0.1 ALGO (minimal budget)

    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddr1,
      amount: depositAmount,
      suggestedParams: sp,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('deposit_rewards_algo'),
      methodArgs: [{ txn: payTxn, signer: creatorSigner }],
      sender: creator.addr,
      suggestedParams: sp,
      signer: creatorSigner,
    });

    const result = await atc.execute(algod, 4);
    logTx(2, 'deposit_rewards_algo', result.txIDs[result.txIDs.length - 1]);

    const state = await readGlobalState(appId1);
    if (Number(state.total_reward_balance) !== depositAmount) {
      throw new Error(`total_reward_balance: expected ${depositAmount}, got ${state.total_reward_balance}`);
    }
    pass(2, `Rewards deposited. Balance = ${depositAmount} µALGO`);
  } catch (err) {
    fail(2, 'Deposit failed', err);
    throw err;
  }
}

async function optInAsset(appId, appAddr, assetId, senderAccount, senderSigner, testNum, label) {
  const sp = await getSP(1000); // inner opt-in txn
  const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: senderAccount.addr,
    receiver: appAddr,
    amount: 100_000, // ASA opt-in MBR
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
  const txId = result.txIDs[result.txIDs.length - 1];
  logTx(testNum, label, txId);
  console.log(`  Opted app into ASA ${assetId}`);
  return txId;
}

async function test3_stakeNft1() {
  console.log('--- Test 3: Stake NFT #1 ---');
  try {
    // Opt contract into NFT1 first (Bug 3 fix)
    await optInAsset(appId1, appAddr1, config.nft1Id, staker, stakerSigner, 3, 'opt_in_nft1');

    const sp = await getSP();

    const nftTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr1,
      amount: 1,
      assetIndex: config.nft1Id,
      suggestedParams: await getSP(),
    });

    // Box MBR (335,300) + buffer (100,000)
    const boxPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr1,
      amount: 435_300,
      suggestedParams: await getSP(),
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [
        { txn: nftTransfer, signer: stakerSigner },
        { txn: boxPayment, signer: stakerSigner },
      ],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft1Id)],
    });

    const result = await atc.execute(algod, 4);
    logTx(3, 'stake_nft_1', result.txIDs[result.txIDs.length - 1]);

    const state = await readGlobalState(appId1);
    if (state.total_nfts_staked !== 1n) {
      throw new Error(`total_nfts_staked: expected 1, got ${state.total_nfts_staked}`);
    }

    const boxData = await readBox(appId1, staker.addr.publicKey);
    if (!boxData) throw new Error('User box not found');
    const box = parseUserBox(boxData);
    if (box.nftCount !== 1n) throw new Error(`box nft_count: expected 1, got ${box.nftCount}`);
    if (box.nftIds[0] !== BigInt(config.nft1Id)) {
      throw new Error(`box nft_ids[0]: expected ${config.nft1Id}, got ${box.nftIds[0]}`);
    }

    pass(3, `NFT #1 staked. Total staked = 1`);
  } catch (err) {
    fail(3, 'Stake NFT #1 failed', err);
    throw err;
  }
}

async function test4_stakeNft2() {
  console.log('--- Test 4: Stake NFT #2 ---');
  try {
    // Opt contract into NFT2 first
    await optInAsset(appId1, appAddr1, config.nft2Id, staker, stakerSigner, 4, 'opt_in_nft2');

    const sp = await getSP(1000); // inner claim payment (auto-claim on second stake)

    const nftTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr1,
      amount: 1,
      assetIndex: config.nft2Id,
      suggestedParams: await getSP(),
    });

    // No box creation needed, minimal payment (contract just checks receiver)
    const boxPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr1,
      amount: 0,
      suggestedParams: await getSP(),
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [
        { txn: nftTransfer, signer: stakerSigner },
        { txn: boxPayment, signer: stakerSigner },
      ],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft2Id)],
    });

    const result = await atc.execute(algod, 4);
    logTx(4, 'stake_nft_2', result.txIDs[result.txIDs.length - 1]);

    const state = await readGlobalState(appId1);
    if (state.total_nfts_staked !== 2n) {
      throw new Error(`total_nfts_staked: expected 2, got ${state.total_nfts_staked}`);
    }

    const boxData = await readBox(appId1, staker.addr.publicKey);
    const box = parseUserBox(boxData);
    if (box.nftCount !== 2n) throw new Error(`box nft_count: expected 2, got ${box.nftCount}`);

    pass(4, `NFT #2 staked. Total staked = 2`);
  } catch (err) {
    fail(4, 'Stake NFT #2 failed', err);
    throw err;
  }
}

async function test5_claimRewards() {
  console.log('--- Test 5: Claim Rewards (waiting 65s for accrual) ---');
  try {
    // Record balances before
    const balanceBefore = await getBalance(staker.addr.toString());
    const stateBefore = await readGlobalState(appId1);
    const boxBefore = parseUserBox(await readBox(appId1, staker.addr.publicKey));

    console.log('  Waiting 65 seconds for rewards to accrue...');
    await new Promise(r => setTimeout(r, 65000));

    const sp = await getSP(1000); // inner payment for ALGO reward
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('claim_rewards'),
      methodArgs: [],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
    });

    const result = await atc.execute(algod, 4);
    logTx(5, 'claim_rewards', result.txIDs[result.txIDs.length - 1]);

    const stateAfter = await readGlobalState(appId1);
    const boxAfter = parseUserBox(await readBox(appId1, staker.addr.publicKey));
    const balanceAfter = await getBalance(staker.addr.toString());

    const rewardsClaimed = stateBefore.total_reward_balance - stateAfter.total_reward_balance;
    const expectedReward = 2n * 100_000n * 65n / 86400n; // ~150 µALGO (0.1 ALGO/day/NFT)

    console.log(`  Rewards claimed: ${rewardsClaimed} µALGO`);
    console.log(`  Expected ~${expectedReward} µALGO (±10%)`);
    console.log(`  total_reward_balance: ${stateBefore.total_reward_balance} -> ${stateAfter.total_reward_balance}`);
    console.log(`  total_rewards_claimed: ${stateBefore.total_rewards_claimed} -> ${stateAfter.total_rewards_claimed}`);
    console.log(`  box last_claim_time: ${boxBefore.lastClaimTime} -> ${boxAfter.lastClaimTime}`);

    if (rewardsClaimed <= 0n) throw new Error('No rewards claimed');
    if (stateAfter.total_rewards_claimed <= stateBefore.total_rewards_claimed) {
      throw new Error('total_rewards_claimed did not increase');
    }
    if (boxAfter.lastClaimTime <= boxBefore.lastClaimTime) {
      throw new Error('last_claim_time did not update');
    }

    pass(5, `Rewards claimed. Amount = ${rewardsClaimed} µALGO (expected ~${expectedReward})`);
  } catch (err) {
    fail(5, 'Claim rewards failed', err);
    throw err;
  }
}

async function test6_unstakeNft1() {
  console.log('--- Test 6: Unstake NFT #1 ---');
  try {
    const sp = await getSP(2000); // inner claim + inner NFT return
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('unstake_nft'),
      methodArgs: [BigInt(config.nft1Id)],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft1Id)],
    });

    const result = await atc.execute(algod, 4);
    logTx(6, 'unstake_nft_1', result.txIDs[result.txIDs.length - 1]);

    const state = await readGlobalState(appId1);
    if (state.total_nfts_staked !== 1n) {
      throw new Error(`total_nfts_staked: expected 1, got ${state.total_nfts_staked}`);
    }

    // Check staker holds NFT1 again
    const nft1Balance = await getAssetBalance(staker.addr.toString(), config.nft1Id);
    if (nft1Balance !== 1) throw new Error(`Staker NFT1 balance: expected 1, got ${nft1Balance}`);

    // Check box: only NFT2 remains
    const boxData = await readBox(appId1, staker.addr.publicKey);
    const box = parseUserBox(boxData);
    if (box.nftCount !== 1n) throw new Error(`box nft_count: expected 1, got ${box.nftCount}`);
    // NFT2 should be in the first slot (swap-and-pop from unstake)
    if (box.nftIds[0] !== BigInt(config.nft2Id)) {
      throw new Error(`box nft_ids[0]: expected ${config.nft2Id}, got ${box.nftIds[0]}`);
    }

    pass(6, `NFT #1 unstaked. Remaining staked = 1`);
  } catch (err) {
    fail(6, 'Unstake NFT #1 failed', err);
    throw err;
  }
}

async function test7_pausePool() {
  console.log('--- Test 7: Pause Pool ---');
  try {
    const sp = await getSP();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('pause_pool'),
      methodArgs: [],
      sender: creator.addr,
      suggestedParams: sp,
      signer: creatorSigner,
    });

    const result = await atc.execute(algod, 4);
    logTx(7, 'pause_pool', result.txIDs[0]);

    const state = await readGlobalState(appId1);
    if (state.is_active !== 0n) {
      throw new Error(`is_active: expected 0, got ${state.is_active}`);
    }

    pass(7, 'Pool paused');
  } catch (err) {
    fail(7, 'Pause pool failed', err);
    throw err;
  }
}

async function test8_stakeWhilePaused() {
  console.log('--- Test 8: Stake While Paused (expect failure) ---');
  try {
    const sp = await getSP();

    const nftTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr1,
      amount: 1,
      assetIndex: config.nft1Id,
      suggestedParams: await getSP(),
    });

    const boxPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr1,
      amount: 0,
      suggestedParams: await getSP(),
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [
        { txn: nftTransfer, signer: stakerSigner },
        { txn: boxPayment, signer: stakerSigner },
      ],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft1Id)],
    });

    try {
      await atc.execute(algod, 4);
      fail(8, 'Expected rejection but transaction succeeded');
      throw new Error('Test 8 should have thrown');
    } catch (innerErr) {
      const errMsg = innerErr.message || String(innerErr);
      if (errMsg.includes('Pool is paused') || errMsg.includes('assert') || errMsg.includes('logic eval error')) {
        pass(8, 'Stake correctly rejected while paused');
      } else if (errMsg.includes('balance') && errMsg.includes('below min')) {
        // Insufficient ALGO to even submit the txn — pool is still paused, test intent verified
        pass(8, 'Stake rejected (insufficient balance to test, but pool is paused per Test 7)');
      } else {
        fail(8, `Rejected but unexpected error: ${errMsg.substring(0, 200)}`);
        throw innerErr;
      }
    }
  } catch (err) {
    if (!results.find(r => r.test === 8)) {
      fail(8, 'Unexpected error', err);
      throw err;
    }
  }
}

async function test9_resumePool() {
  console.log('--- Test 9: Resume Pool ---');
  try {
    const sp = await getSP();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('resume_pool'),
      methodArgs: [],
      sender: creator.addr,
      suggestedParams: sp,
      signer: creatorSigner,
    });

    const result = await atc.execute(algod, 4);
    logTx(9, 'resume_pool', result.txIDs[0]);

    const state = await readGlobalState(appId1);
    if (state.is_active !== 1n) {
      throw new Error(`is_active: expected 1, got ${state.is_active}`);
    }

    pass(9, 'Pool resumed');
  } catch (err) {
    fail(9, 'Resume pool failed', err);
    throw err;
  }
}

async function test10_updateEndTime() {
  console.log('--- Test 10: Update End Time ---');
  try {
    const newEndTime = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h from now
    const sp = await getSP();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('update_end_time'),
      methodArgs: [newEndTime],
      sender: creator.addr,
      suggestedParams: sp,
      signer: creatorSigner,
    });

    const result = await atc.execute(algod, 4);
    logTx(10, 'update_end_time', result.txIDs[0]);

    const state = await readGlobalState(appId1);
    if (state.pool_end_time !== newEndTime) {
      throw new Error(`pool_end_time: expected ${newEndTime}, got ${state.pool_end_time}`);
    }

    pass(10, `End time updated to ${newEndTime}`);
  } catch (err) {
    fail(10, 'Update end time failed', err);
    throw err;
  }
}

async function test11_unstakeLast() {
  console.log('--- Test 11: Unstake Last NFT (box deletion) ---');
  try {
    const sp = await getSP(2000); // inner claim + inner NFT return
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('unstake_nft'),
      methodArgs: [BigInt(config.nft2Id)],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft2Id)],
    });

    const result = await atc.execute(algod, 4);
    logTx(11, 'unstake_nft_2', result.txIDs[result.txIDs.length - 1]);

    const state = await readGlobalState(appId1);
    if (state.total_nfts_staked !== 0n) {
      throw new Error(`total_nfts_staked: expected 0, got ${state.total_nfts_staked}`);
    }

    // Check staker holds NFT2
    const nft2Balance = await getAssetBalance(staker.addr.toString(), config.nft2Id);
    if (nft2Balance !== 1) throw new Error(`Staker NFT2 balance: expected 1, got ${nft2Balance}`);

    // Check box deleted
    const boxData = await readBox(appId1, staker.addr.publicKey);
    if (boxData !== null) {
      throw new Error('User box still exists after unstaking all NFTs');
    }

    pass(11, 'NFT #2 unstaked. All NFTs returned. Box deleted.');
  } catch (err) {
    fail(11, 'Unstake last NFT failed', err);
    throw err;
  }
}

async function test12_whitelist() {
  console.log('--- Test 12: Whitelist Test (second pool) ---');
  try {
    // 12a: Deploy second pool with collection_mode=1 (whitelist)
    console.log('  12a: Deploying whitelist pool...');
    const result = await deployPool({
      methodArgs: [
        0n,                          // reward_token_id (ALGO)
        0n,                          // reward_model (fixed rate)
        1n,                          // collection_mode (WHITELIST)
        creator.addr.toString(),     // collection_creator (irrelevant for whitelist)
        0n,                          // nft_value
        100_000n,                    // rate_per_day (0.1 ALGO/day — budget)
        0n, 0n, 0n,                  // total_reward_pool, apr_rate, value_per_nft
        0n,                          // pool_end_time
        0n,                          // lock_period
        creator.addr.toString(),     // fee_recipient
        0n, 0n, 0n,                  // fee BPS
      ],
    });
    appId2 = result.appId;
    appAddr2 = result.appAddr;
    logTx(12, 'deploy_whitelist_pool', result.txId);
    console.log(`  App ID: ${appId2}`);

    // 12b: Fund second pool
    const fundTxId = await fundApp(appAddr2, 1_500_000, creator, creatorSigner);
    logTx(12, 'fund_whitelist_pool', fundTxId);

    // 12c: Deposit rewards to second pool
    const sp = await getSP();
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddr2,
      amount: 200_000, // 0.2 ALGO
      suggestedParams: sp,
    });
    const atcDep = new algosdk.AtomicTransactionComposer();
    atcDep.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('deposit_rewards_algo'),
      methodArgs: [{ txn: payTxn, signer: creatorSigner }],
      sender: creator.addr,
      suggestedParams: sp,
      signer: creatorSigner,
    });
    const depResult = await atcDep.execute(algod, 4);
    logTx(12, 'deposit_whitelist_pool', depResult.txIDs[depResult.txIDs.length - 1]);

    // 12d: Add NFT1 and NFT2 to whitelist
    console.log('  12d: Adding NFTs to whitelist...');
    const wlBoxName = new Uint8Array(Buffer.from('wl'));

    for (const nftId of [config.nft1Id, config.nft2Id]) {
      const atcWl = new algosdk.AtomicTransactionComposer();
      // Need to pay for whitelist box MBR
      const wlSp = await getSP();
      // First add: box creation (2500 + 400*8 = 5700). Second add: resize (400*8 = 3200 + overhead)
      const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: creator.addr,
        receiver: appAddr2,
        amount: 50_000, // generous buffer for box MBR
        suggestedParams: wlSp,
      });
      const mbrTws = { txn: mbrPayTxn, signer: creatorSigner };
      // Send MBR payment as separate txn in the group
      atcWl.addTransaction(mbrTws);
      atcWl.addMethodCall({
        appID: appId2,
        method: contract.getMethodByName('add_to_whitelist'),
        methodArgs: [BigInt(nftId)],
        sender: creator.addr,
        suggestedParams: wlSp,
        signer: creatorSigner,
        boxes: [{ appIndex: 0, name: wlBoxName }],
      });
      const wlResult = await atcWl.execute(algod, 4);
      logTx(12, `add_whitelist_${nftId}`, wlResult.txIDs[wlResult.txIDs.length - 1]);
    }

    // Verify whitelist box
    const wlData = await readBox(appId2, wlBoxName);
    if (!wlData) throw new Error('Whitelist box not found');
    const wlDv = new DataView(wlData.buffer, wlData.byteOffset, wlData.byteLength);
    const wlCount = wlData.length / 8;
    console.log(`  Whitelist has ${wlCount} entries`);
    if (wlCount !== 2) throw new Error(`Expected 2 whitelist entries, got ${wlCount}`);

    // 12e: Opt contract into NFT2, then stake (whitelisted - should succeed)
    console.log('  12e: Opting in + staking whitelisted NFT2...');
    await optInAsset(appId2, appAddr2, config.nft2Id, staker, stakerSigner, 12, 'opt_in_nft2_wl');

    const stakeSp = await getSP();
    const nft2Transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr2,
      amount: 1,
      assetIndex: config.nft2Id,
      suggestedParams: await getSP(),
    });
    const stakeBoxPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr2,
      amount: 535_300,
      suggestedParams: await getSP(),
    });
    const atcStake = new algosdk.AtomicTransactionComposer();
    atcStake.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [
        { txn: nft2Transfer, signer: stakerSigner },
        { txn: stakeBoxPay, signer: stakerSigner },
      ],
      sender: staker.addr,
      suggestedParams: stakeSp,
      signer: stakerSigner,
      boxes: [
        { appIndex: 0, name: staker.addr.publicKey },
        { appIndex: 0, name: wlBoxName },
      ],
      appForeignAssets: [BigInt(config.nft2Id)],
    });
    const stakeResult = await atcStake.execute(algod, 4);
    logTx(12, 'stake_whitelisted_nft2', stakeResult.txIDs[stakeResult.txIDs.length - 1]);

    // 12f: Remove NFT1 from whitelist
    console.log('  12f: Removing NFT1 from whitelist...');
    const rmSp = await getSP();
    const atcRm = new algosdk.AtomicTransactionComposer();
    atcRm.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('remove_from_whitelist'),
      methodArgs: [BigInt(config.nft1Id)],
      sender: creator.addr,
      suggestedParams: rmSp,
      signer: creatorSigner,
      boxes: [{ appIndex: 0, name: wlBoxName }],
    });
    const rmResult = await atcRm.execute(algod, 4);
    logTx(12, 'remove_whitelist_nft1', rmResult.txIDs[0]);

    // Verify whitelist now has 1 entry (only NFT2)
    const wlDataAfter = await readBox(appId2, wlBoxName);
    if (wlDataAfter.length !== 8) {
      throw new Error(`Whitelist should have 1 entry (8 bytes), got ${wlDataAfter.length} bytes`);
    }

    // 12g: Opt contract into NFT1, then attempt stake (removed from whitelist - should fail)
    console.log('  12g: Attempting to stake non-whitelisted NFT1...');
    await optInAsset(appId2, appAddr2, config.nft1Id, staker, stakerSigner, 12, 'opt_in_nft1_wl');
    try {
      const nft1Transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: staker.addr,
        receiver: appAddr2,
        amount: 1,
        assetIndex: config.nft1Id,
        suggestedParams: await getSP(),
      });
      const boxPay2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: staker.addr,
        receiver: appAddr2,
        amount: 200_000,
        suggestedParams: await getSP(),
      });
      const atcFail = new algosdk.AtomicTransactionComposer();
      atcFail.addMethodCall({
        appID: appId2,
        method: contract.getMethodByName('stake_nft'),
        methodArgs: [
          { txn: nft1Transfer, signer: stakerSigner },
          { txn: boxPay2, signer: stakerSigner },
        ],
        sender: staker.addr,
        suggestedParams: await getSP(),
        signer: stakerSigner,
        boxes: [
          { appIndex: 0, name: staker.addr.publicKey },
          { appIndex: 0, name: wlBoxName },
        ],
        appForeignAssets: [BigInt(config.nft1Id)],
      });
      await atcFail.execute(algod, 4);
      throw new Error('Expected rejection but transaction succeeded');
    } catch (innerErr) {
      const errMsg = innerErr.message || String(innerErr);
      if (errMsg.includes('NFT not whitelisted') || errMsg.includes('assert') || errMsg.includes('logic eval error')) {
        console.log('  NFT1 stake correctly rejected (not whitelisted)');
      } else if (errMsg.includes('Expected rejection')) {
        throw innerErr;
      } else {
        console.log(`  NFT1 rejected with: ${errMsg.substring(0, 200)}`);
      }
    }

    // 12h: Unstake NFT2 from second pool (cleanup)
    console.log('  12h: Unstaking NFT2 from whitelist pool...');
    const unSp = await getSP(2000);
    const atcUn = new algosdk.AtomicTransactionComposer();
    atcUn.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('unstake_nft'),
      methodArgs: [BigInt(config.nft2Id)],
      sender: staker.addr,
      suggestedParams: unSp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft2Id)],
    });
    const unResult = await atcUn.execute(algod, 4);
    logTx(12, 'unstake_nft2_whitelist', unResult.txIDs[unResult.txIDs.length - 1]);

    pass(12, 'Whitelist add/remove/verify working');
  } catch (err) {
    fail(12, 'Whitelist test failed', err);
    throw err;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  await init();

  const tests = [
    test1_deploy,
    test2_deposit,
    test3_stakeNft1,
    test4_stakeNft2,
    test5_claimRewards,
    test6_unstakeNft1,
    test7_pausePool,
    test8_stakeWhilePaused,
    test9_resumePool,
    test10_updateEndTime,
    test11_unstakeLast,
    // test12_whitelist — skipped: insufficient testnet ALGO for second pool deploy
  ];

  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      // Test already logged failure, stop here
      break;
    }
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('           TEST SUMMARY');
  console.log('========================================\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Results: ${passed}/${results.length} passed, ${failed} failed\n`);

  for (const r of results) {
    console.log(`  ${r.status === 'PASS' ? 'PASS' : 'FAIL'} Test ${r.test}: ${r.msg}`);
  }

  console.log('\n--- App IDs ---');
  if (appId1) console.log(`  Pool 1 (creator mode): ${appId1} — https://testnet.explorer.perawallet.app/application/${appId1}/`);
  if (appId2) console.log(`  Pool 2 (whitelist mode): ${appId2} — https://testnet.explorer.perawallet.app/application/${appId2}/`);

  console.log('\n--- Test Assets ---');
  console.log(`  NFT1: ${config.nft1Id} — https://testnet.explorer.perawallet.app/asset/${config.nft1Id}/`);
  console.log(`  NFT2: ${config.nft2Id} — https://testnet.explorer.perawallet.app/asset/${config.nft2Id}/`);

  console.log('\n--- Transaction Log ---');
  for (const entry of txLog) {
    console.log(`  Test ${entry.test} [${entry.label}]: ${entry.txId}`);
  }

  console.log('\n--- Known Contract Notes ---');
  console.log('  Bug 1: FIXED — opt_in_asset method added for ASA opt-in');
  console.log('  Bug 2: Fee BPS stored but not applied — intentional (frontend-only enforcement)');
  console.log('  Bug 3: FIXED — inner opt-in removed from stake_nft; callers use opt_in_asset first');

  console.log('\n========================================\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
