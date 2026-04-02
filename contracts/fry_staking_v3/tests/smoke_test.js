/**
 * FryStaking V2 — Testnet Smoke Test
 * 8 sequential tests covering the full contract lifecycle.
 * Critical test: Test 4 proves the V1 reward truncation bug is fixed.
 *
 * Usage: NODE_PATH=/opt/fry-farm/backend/node_modules node smoke_test.js
 */

const algosdk = require('algosdk');
const fs = require('fs');
const path = require('path');

// ── Globals ─────────────────────────────────────────────────────────
let algod, config, creator, staker, creatorSigner, stakerSigner, contract;
let compiledApproval, compiledClear;
let appId, appAddr;
const txLog = [];
const results = [];

const APR = 50000n;                    // 500% — high so rewards are visible in seconds
const STAKE_AMOUNT = 100_000_000n;     // 100 tokens (6 decimals)
const REWARD_DEPOSIT = 100_000_000n;   // 100 tokens (6 decimals)
const BOX_PAYMENT = 28_100n;           // exact amount contract requires

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

async function readGlobalState(id) {
  const info = await algod.getApplicationByID(Number(id)).do();
  const state = {};
  for (const kv of info.params.globalState || []) {
    const key = Buffer.from(kv.key, 'base64').toString('utf8');
    if (kv.value.type === 2) {
      state[key] = BigInt(kv.value.uint);
    } else {
      state[key] = kv.value.bytes;
    }
  }
  return state;
}

async function readBox(id, boxName) {
  try {
    const result = await algod.getApplicationBoxByName(Number(id), boxName).do();
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
  return {
    staked: dv.getBigUint64(0),
    stakeTime: dv.getBigUint64(8),
    pendingReward: dv.getBigUint64(16),
    totalClaimed: dv.getBigUint64(24),
  };
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

async function fundApp(amount, senderAccount) {
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

// ── Init ────────────────────────────────────────────────────────────

async function init() {
  console.log('=== FryStaking V2 Smoke Test ===\n');

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

  console.log(`Creator:    ${creator.addr.toString()}`);
  console.log(`Staker:     ${staker.addr.toString()}`);
  console.log(`Stake ASA:  ${config.stakeASAId}`);
  console.log(`Reward ASA: ${config.rewardASAId}`);

  // Check balances and redistribute if needed
  const creatorBal = await getBalance(creator.addr.toString());
  const stakerBal = await getBalance(staker.addr.toString());
  console.log(`Creator balance: ${creatorBal / 1e6} ALGO`);
  console.log(`Staker balance:  ${stakerBal / 1e6} ALGO`);

  if (creatorBal < 3_000_000 && stakerBal > 2_000_000) {
    const transfer = Math.min(stakerBal - 1_500_000, 3_000_000);
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
      console.log(`  Done.`);
    }
  }
  console.log('');

  // Load ARC32 and compile TEAL
  const arc32Path = path.join(__dirname, '..', 'FryStaking.arc32.json');
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
  console.log('--- Test 1: Deploy Contract (init_staking) ---');
  try {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const sp = await getSP();

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: 0,
      method: contract.getMethodByName('init_staking'),
      methodArgs: [
        creator.addr.toString(),      // _authority (address type — 32-byte encoding)
        BigInt(config.stakeASAId),     // _stake_token
        BigInt(config.rewardASAId),    // _reward_token
        REWARD_DEPOSIT,               // _reward_token_amount
        now,                          // _stake_start_time
        now + 86400n,                 // _stake_end_time
        0n,                           // _lock_period (no lock)
        86400n,                       // _pool_time
      ],
      sender: creator.addr,
      suggestedParams: sp,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      approvalProgram: compiledApproval,
      clearProgram: compiledClear,
      numGlobalInts: 12,
      numGlobalByteSlices: 1,
      numLocalInts: 0,
      numLocalByteSlices: 0,
      extraPages: 3,
      signer: creatorSigner,
    });

    const result = await atc.execute(algod, 4);
    const txId = result.txIDs[0];
    const txInfo = result.methodResults[0].txInfo;
    appId = Number(txInfo.applicationIndex);
    appAddr = algosdk.getApplicationAddress(appId);
    logTx(1, 'deploy', txId);
    console.log(`  App ID:      ${appId}`);
    console.log(`  App Address: ${appAddr.toString()}`);

    // Verify global state
    const state = await readGlobalState(appId);
    const checks = [
      ['stake_token', BigInt(config.stakeASAId)],
      ['reward_token', BigInt(config.rewardASAId)],
      ['reward_token_amount', REWARD_DEPOSIT],
      ['total_stakers', 0n],
      ['total_staked', 0n],
      ['lock_period', 0n],
      ['pool_time', 86400n],
    ];
    for (const [key, expected] of checks) {
      if (state[key] !== expected) {
        throw new Error(`Global state ${key}: expected ${expected}, got ${state[key]}`);
      }
    }

    pass(1, `Contract deployed. App ID = ${appId}`);
  } catch (err) {
    fail(1, 'Deploy failed', err);
    throw err;
  }
}

async function test2_optinAndDeposit() {
  console.log('--- Test 2: Opt-in Assets + Deposit Rewards ---');
  try {
    // 2a: Fund app with ALGO for MBR
    console.log('  2a: Funding app with MBR ALGO...');
    const fundTxId = await fundApp(300_000, creator);
    logTx(2, 'fund_app', fundTxId);

    // 2b: Opt app into both ASAs via optInAsset
    console.log('  2b: Opting app into ASAs...');
    const sp2 = await getSP(2000); // 2 inner opt-in txns
    const mbrPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddr,
      amount: 200_000, // MBR for 2 ASA opt-ins
      suggestedParams: await getSP(),
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('optInAsset'),
      methodArgs: [
        BigInt(config.stakeASAId),
        BigInt(config.rewardASAId),
        { txn: mbrPay, signer: creatorSigner },
      ],
      sender: creator.addr,
      suggestedParams: sp2,
      signer: creatorSigner,
      appForeignAssets: [config.stakeASAId, config.rewardASAId],
    });

    const optResult = await atc.execute(algod, 4);
    logTx(2, 'optInAsset', optResult.txIDs[optResult.txIDs.length - 1]);

    // 2c: Deposit reward tokens via assetReceive
    console.log('  2c: Depositing reward tokens...');
    const sp3 = await getSP();
    const axferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: creator.addr,
      receiver: appAddr,
      amount: Number(REWARD_DEPOSIT),
      assetIndex: config.rewardASAId,
      suggestedParams: await getSP(),
    });

    const atc2 = new algosdk.AtomicTransactionComposer();
    atc2.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('assetReceive'),
      methodArgs: [
        { txn: axferTxn, signer: creatorSigner },
      ],
      sender: creator.addr,
      suggestedParams: sp3,
      signer: creatorSigner,
      appForeignAssets: [config.rewardASAId],
    });

    const depResult = await atc2.execute(algod, 4);
    logTx(2, 'assetReceive', depResult.txIDs[depResult.txIDs.length - 1]);

    // Verify reward balance in app
    const appRewardBal = await getAssetBalance(appAddr.toString(), config.rewardASAId);
    if (appRewardBal !== Number(REWARD_DEPOSIT)) {
      throw new Error(`App reward token balance: expected ${REWARD_DEPOSIT}, got ${appRewardBal}`);
    }

    pass(2, `Opted in + deposited ${REWARD_DEPOSIT} reward tokens`);
  } catch (err) {
    fail(2, 'Opt-in/Deposit failed', err);
    throw err;
  }
}

async function test3_stake() {
  console.log('--- Test 3: Stake Tokens (stakeTokens) ---');
  try {
    const sp = await getSP();

    const stakeAxfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr,
      amount: Number(STAKE_AMOUNT),
      assetIndex: config.stakeASAId,
      suggestedParams: await getSP(),
    });

    const boxPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr,
      receiver: appAddr,
      amount: Number(BOX_PAYMENT),
      suggestedParams: await getSP(),
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('stakeTokens'),
      methodArgs: [
        STAKE_AMOUNT,
        APR,
        { txn: stakeAxfer, signer: stakerSigner },
        { txn: boxPay, signer: stakerSigner },
      ],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [config.stakeASAId],
    });

    const result = await atc.execute(algod, 4);
    logTx(3, 'stakeTokens', result.txIDs[result.txIDs.length - 1]);

    // Verify global state
    const state = await readGlobalState(appId);
    if (state.total_stakers !== 1n) throw new Error(`total_stakers: expected 1, got ${state.total_stakers}`);
    if (state.total_staked !== STAKE_AMOUNT) throw new Error(`total_staked: expected ${STAKE_AMOUNT}, got ${state.total_staked}`);

    // Verify box
    const boxData = await readBox(appId, staker.addr.publicKey);
    if (!boxData) throw new Error('User box not created');
    const box = parseUserBox(boxData);
    if (box.staked !== STAKE_AMOUNT) throw new Error(`box staked: expected ${STAKE_AMOUNT}, got ${box.staked}`);

    pass(3, `Staked ${STAKE_AMOUNT} tokens. total_stakers=1`);
  } catch (err) {
    fail(3, 'Stake failed', err);
    throw err;
  }
}

async function test4_claim() {
  console.log('--- Test 4: Claim Rewards — THE CRITICAL TEST (V1 bug fix) ---');
  try {
    const rewardBalBefore = await getAssetBalance(staker.addr.toString(), config.rewardASAId);
    const stateBefore = await readGlobalState(appId);

    console.log('  Waiting 5 seconds for rewards to accrue...');
    await new Promise(r => setTimeout(r, 5000));

    const sp = await getSP(2000); // up to 2 inner txns (reward + pending)
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('claimTokens'),
      methodArgs: [APR],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [config.rewardASAId],
    });

    const result = await atc.execute(algod, 4);
    logTx(4, 'claimTokens', result.txIDs[result.txIDs.length - 1]);

    const rewardBalAfter = await getAssetBalance(staker.addr.toString(), config.rewardASAId);
    const stateAfter = await readGlobalState(appId);
    const rewardReceived = rewardBalAfter - rewardBalBefore;
    const rewardsDistributed = stateAfter.rewards_distributed - stateBefore.rewards_distributed;

    console.log(`  Reward received by staker: ${rewardReceived} µ-units`);
    console.log(`  rewards_distributed delta: ${rewardsDistributed}`);
    console.log(`  reward_token_amount: ${stateBefore.reward_token_amount} -> ${stateAfter.reward_token_amount}`);

    // THE CRITICAL CHECK: V1 would give 0 here, V2 must give > 0
    if (rewardReceived <= 0) {
      throw new Error(`CRITICAL: Reward is ${rewardReceived} — V1 truncation bug NOT fixed!`);
    }

    // Expected: staked * apr * duration / (10000 * 31104000)
    // = 100_000_000 * 50000 * ~5 / 311_040_000_000 ≈ 80
    console.log(`  Expected ~80 µ-units (actual: ${rewardReceived})`);

    pass(4, `CRITICAL: Reward = ${rewardReceived} > 0 — V1 truncation bug FIXED`);
  } catch (err) {
    fail(4, 'Claim failed', err);
    throw err;
  }
}

async function test5_reClaim() {
  console.log('--- Test 5: Re-claim Rewards ---');
  try {
    const rewardBalBefore = await getAssetBalance(staker.addr.toString(), config.rewardASAId);

    console.log('  Waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    const sp = await getSP(2000);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('claimTokens'),
      methodArgs: [APR],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [config.rewardASAId],
    });

    const result = await atc.execute(algod, 4);
    logTx(5, 'claimTokens_2', result.txIDs[result.txIDs.length - 1]);

    const rewardBalAfter = await getAssetBalance(staker.addr.toString(), config.rewardASAId);
    const rewardReceived = rewardBalAfter - rewardBalBefore;
    console.log(`  Reward received: ${rewardReceived} µ-units`);

    if (rewardReceived <= 0) {
      throw new Error(`Re-claim reward is ${rewardReceived} — expected > 0`);
    }

    pass(5, `Re-claim reward = ${rewardReceived} > 0`);
  } catch (err) {
    fail(5, 'Re-claim failed', err);
    throw err;
  }
}

async function test6_compound() {
  console.log('--- Test 6: Compound ---');
  try {
    const boxBefore = parseUserBox(await readBox(appId, staker.addr.publicKey));
    console.log(`  Staked before compound: ${boxBefore.staked}`);

    console.log('  Waiting 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));

    const sp = await getSP();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('compound'),
      methodArgs: [APR],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
    });

    const result = await atc.execute(algod, 4);
    logTx(6, 'compound', result.txIDs[result.txIDs.length - 1]);

    const boxAfter = parseUserBox(await readBox(appId, staker.addr.publicKey));
    console.log(`  Staked after compound:  ${boxAfter.staked}`);

    const compoundReward = boxAfter.staked - boxBefore.staked;
    console.log(`  Compound reward added to principal: ${compoundReward}`);

    if (compoundReward <= 0n) {
      throw new Error(`Compound reward is ${compoundReward} — expected > 0`);
    }

    pass(6, `Compound added ${compoundReward} to principal (no inner transfer)`);
  } catch (err) {
    fail(6, 'Compound failed', err);
    throw err;
  }
}

async function test7_unstake() {
  console.log('--- Test 7: Unstake Tokens ---');
  try {
    const stakerStakeBefore = await getAssetBalance(staker.addr.toString(), config.stakeASAId);
    const stakerRewardBefore = await getAssetBalance(staker.addr.toString(), config.rewardASAId);

    // Unstake original amount (not compounded amount, since contract only holds original)
    const unstakeAmount = STAKE_AMOUNT;

    const sp = await getSP(3000); // up to 3 inner txns (reward + stake return + pending)
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName('unstakeTokens'),
      methodArgs: [unstakeAmount, APR],
      sender: staker.addr,
      suggestedParams: sp,
      signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [config.stakeASAId, config.rewardASAId],
    });

    const result = await atc.execute(algod, 4);
    logTx(7, 'unstakeTokens', result.txIDs[result.txIDs.length - 1]);

    const stakerStakeAfter = await getAssetBalance(staker.addr.toString(), config.stakeASAId);
    const stakerRewardAfter = await getAssetBalance(staker.addr.toString(), config.rewardASAId);
    const state = await readGlobalState(appId);

    const stakeReturned = stakerStakeAfter - stakerStakeBefore;
    const rewardReceived = stakerRewardAfter - stakerRewardBefore;

    console.log(`  Stake tokens returned: ${stakeReturned}`);
    console.log(`  Reward tokens received: ${rewardReceived}`);
    console.log(`  total_staked: ${state.total_staked}`);

    if (stakeReturned !== Number(unstakeAmount)) {
      throw new Error(`Stake returned: expected ${unstakeAmount}, got ${stakeReturned}`);
    }
    if (state.total_staked !== 0n) {
      throw new Error(`total_staked: expected 0, got ${state.total_staked}`);
    }

    pass(7, `Unstaked ${unstakeAmount}. Stake returned + rewards. total_staked=0`);
  } catch (err) {
    fail(7, 'Unstake failed', err);
    throw err;
  }
}

async function test8_updateApplication() {
  console.log('--- Test 8: UpdateApplication (creator-only) ---');
  try {
    // 8a: Creator updates — should succeed
    console.log('  8a: Creator sends UpdateApplication...');
    const sp = await getSP();
    const updateTxn = algosdk.makeApplicationUpdateTxnFromObject({
      sender: creator.addr,
      appIndex: appId,
      approvalProgram: compiledApproval,
      clearProgram: compiledClear,
      suggestedParams: sp,
    });
    const signed = updateTxn.signTxn(creator.sk);
    const { txid } = await algod.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(algod, txid, 4);
    logTx(8, 'update_creator', txid);
    console.log('  Creator update succeeded.');

    // 8b: Staker tries update — should be rejected
    console.log('  8b: Staker sends UpdateApplication (expect rejection)...');
    const sp2 = await getSP();
    const badTxn = algosdk.makeApplicationUpdateTxnFromObject({
      sender: staker.addr,
      appIndex: appId,
      approvalProgram: compiledApproval,
      clearProgram: compiledClear,
      suggestedParams: sp2,
    });
    const badSigned = badTxn.signTxn(staker.sk);

    try {
      await algod.sendRawTransaction(badSigned).do();
      throw new Error('Expected rejection but staker update succeeded');
    } catch (innerErr) {
      const errMsg = innerErr.message || String(innerErr);
      if (errMsg.includes('Expected rejection')) throw innerErr;
      if (errMsg.includes('Creator only') || errMsg.includes('assert') || errMsg.includes('logic eval error') || errMsg.includes('rejected')) {
        console.log(`  Staker update correctly rejected: ${errMsg.substring(0, 150)}`);
      } else {
        console.log(`  Staker rejected (unexpected reason): ${errMsg.substring(0, 200)}`);
      }
    }

    pass(8, 'Creator update succeeded, staker update rejected');
  } catch (err) {
    fail(8, 'UpdateApplication test failed', err);
    throw err;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  await init();

  const tests = [
    test1_deploy,
    test2_optinAndDeposit,
    test3_stake,
    test4_claim,
    test5_reClaim,
    test6_compound,
    test7_unstake,
    test8_updateApplication,
  ];

  for (const test of tests) {
    try {
      await test();
    } catch (err) {
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
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(`  ${icon} Test ${r.test}: ${r.msg}`);
  }

  if (appId) {
    console.log(`\n--- App ---`);
    console.log(`  App ID: ${appId} — https://testnet.explorer.perawallet.app/application/${appId}/`);
  }

  console.log('\n--- Test Assets ---');
  console.log(`  Stake:  ${config.stakeASAId} — https://testnet.explorer.perawallet.app/asset/${config.stakeASAId}/`);
  console.log(`  Reward: ${config.rewardASAId} — https://testnet.explorer.perawallet.app/asset/${config.rewardASAId}/`);

  console.log('\n--- Transaction Log ---');
  for (const entry of txLog) {
    console.log(`  Test ${entry.test} [${entry.label}]: ${entry.txId}`);
  }

  console.log('\n--- V2 Contract Notes ---');
  console.log('  FIX: 128-bit math in _calc_reward prevents integer truncation for short durations');
  console.log('  NEW: UpdateApplication bare method (creator-only)');
  console.log('  NOTE: compound adds reward to principal without moving tokens');

  console.log('\n========================================\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
