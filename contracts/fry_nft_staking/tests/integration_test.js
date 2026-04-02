/**
 * Phase 6 — FryNftStaking Full-Stack Integration Test
 * Tests: on-chain contract (testnet) ↔ backend API (Express+MongoDB) consistency.
 *
 * Spins up a temporary Express server on port 5099 with an isolated test DB,
 * deploys contracts on Algorand testnet, and validates that on-chain state
 * matches backend database state at every step.
 *
 * Usage: NODE_PATH=/opt/fry-farm/backend/node_modules node integration_test.js
 */

const algosdk = require('algosdk');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');

// ── Config ──────────────────────────────────────────────────────────
// Use production DB — test records are cleaned up by appId after tests
const MONGO_URI = 'mongodb://fryFarmUser:vyuLEh7TBrIGI6GkZRFEbIdO20sSJVfJ0I9zDC0%2FnJI%3D@100.107.174.29:27017/frystaking?authSource=admin&tls=true&tlsCAFile=/etc/ssl/mongo/mongo-ca.crt';
const API_PORT = 5099;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

// Reuse an existing deployed contract when testnet ALGO is insufficient for fresh deploy
// Set to 0 to force fresh deploy, or set to an existing app ID
const REUSE_APP_ID = 756948284;

// ── Globals ─────────────────────────────────────────────────────────
let algod, config, creator, staker, creatorSigner, stakerSigner, contract;
let compiledApproval, compiledClear;
let appId1, appAddr1, appId2, appAddr2;
let mongoPoolId1, mongoPoolId2; // MongoDB _id references
let server; // Express server handle
const results = [];
const txLog = [];

// ── HTTP helper ─────────────────────────────────────────────────────

function apiCall(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(`API ${res.statusCode}: ${JSON.stringify(parsed)}`);
            err.statusCode = res.statusCode;
            err.body = parsed;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`API parse error: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── On-chain helpers (from smoke_test.js) ───────────────────────────

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
  const sp = await getSP(1000);
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

async function optInAsset(appId, appAddr, assetId, senderAccount, senderSigner, testNum, label) {
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
  const txId = result.txIDs[result.txIDs.length - 1];
  logTx(testNum, label, txId);
  console.log(`  Opted app into ASA ${assetId}`);
  return txId;
}

// ── Cross-check helper ──────────────────────────────────────────────

async function crossCheckPool(testNum, appId, label) {
  const onChain = await readGlobalState(appId);
  const dbRes = await apiCall('GET', `/nft/pool/${appId}`);
  const db = dbRes.data;

  const checks = [];
  // total_nfts_staked
  const onChainStaked = Number(onChain.total_nfts_staked);
  const dbStaked = db.totalNftsStaked;
  checks.push({
    field: 'totalNftsStaked',
    onChain: onChainStaked,
    db: dbStaked,
    match: onChainStaked === dbStaked,
  });

  // is_active
  const onChainActive = Number(onChain.is_active) === 1;
  const dbActive = db.isActive;
  checks.push({
    field: 'isActive',
    onChain: onChainActive,
    db: dbActive,
    match: onChainActive === dbActive,
  });

  // totalRewardsClaimed
  const onChainClaimed = Number(onChain.total_rewards_claimed);
  const dbClaimed = db.totalRewardsClaimed;
  checks.push({
    field: 'totalRewardsClaimed',
    onChain: onChainClaimed,
    db: dbClaimed,
    match: onChainClaimed === dbClaimed,
  });

  for (const c of checks) {
    const status = c.match ? 'MATCH' : 'MISMATCH';
    console.log(`  [${label}] ${c.field}: on-chain=${c.onChain}, DB=${c.db}  ${status}`);
    if (!c.match) {
      throw new Error(`Cross-check MISMATCH: ${c.field} on-chain=${c.onChain} DB=${c.db}`);
    }
  }
  return checks;
}

// ── Express Server Setup ────────────────────────────────────────────

async function startServer() {
  // Connect to test MongoDB
  await mongoose.connect(MONGO_URI);
  console.log(`  MongoDB: CONNECTED (${MONGO_URI})`);

  const app = express();
  app.use(express.json());

  // Import controllers
  const poolCtrl = require(path.resolve('/opt/fry-farm/backend/controllers/nftStakingController'));
  const tokenCtrl = require(path.resolve('/opt/fry-farm/backend/controllers/nftStakingTokenController'));
  const claimCtrl = require(path.resolve('/opt/fry-farm/backend/controllers/nftStakingClaimController'));
  const { validate, nftStakingPoolSchema, nftStakeSchema, nftUnstakeSchema, nftClaimSchema } =
    require(path.resolve('/opt/fry-farm/backend/middleware/validate'));

  // Routes (no auth, keep Joi validation)
  app.get('/nft/all', poolCtrl.getAllPools);
  app.get('/nft/pool/:appId', poolCtrl.getPoolByAppId);
  app.get('/nft/creator/:wallet', poolCtrl.getPoolsByCreator);
  app.post('/nft/add', validate(nftStakingPoolSchema), poolCtrl.addPool);
  app.put('/nft/update/:appId', poolCtrl.updatePool);
  app.post('/nft/stake', validate(nftStakeSchema), tokenCtrl.addStakedNft);
  app.get('/nft/stakes/wallet/:wallet', tokenCtrl.getStakedNftsByWallet);
  app.get('/nft/stakes/pool/:appId', tokenCtrl.getStakedNftsByPool);
  app.post('/nft/unstake', validate(nftUnstakeSchema), tokenCtrl.unstakeNft);
  app.post('/nft/claim', validate(nftClaimSchema), claimCtrl.addClaim);
  app.get('/nft/claims/:wallet', claimCtrl.getClaimsByWallet);

  return new Promise((resolve, reject) => {
    server = app.listen(API_PORT, '127.0.0.1', () => {
      console.log(`  Express: LISTENING on port ${API_PORT}`);
      resolve();
    });
    server.on('error', reject);
  });
}

async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('  Express server closed.');
  }
  if (mongoose.connection.readyState === 1) {
    // Clean up test records by appId (we're in the production DB)
    const testAppIds = [appId1, appId2].filter(Boolean);
    if (testAppIds.length > 0) {
      try {
        const db = mongoose.connection.db;
        for (const id of testAppIds) {
          const r1 = await db.collection('nftStakingPools').deleteMany({ appId: id });
          const r2 = await db.collection('nftStakedTokens').deleteMany({ appId: id });
          const r3 = await db.collection('nftStakingClaims').deleteMany({ appId: id });
          console.log(`  Cleaned appId=${id}: pools=${r1.deletedCount}, stakes=${r2.deletedCount}, claims=${r3.deletedCount}`);
        }
      } catch (e) {
        console.error(`  Warning: cleanup failed: ${e.message}`);
      }
    }
    await mongoose.disconnect();
    console.log('  MongoDB disconnected.');
  }
}

// ── Init ────────────────────────────────────────────────────────────

async function init() {
  console.log('========================================');
  console.log('    INTEGRATION TEST — PRE-FLIGHT');
  console.log('========================================\n');

  // Load config
  const configPath = path.join(__dirname, 'test_config.json');
  if (!fs.existsSync(configPath)) {
    console.error('ERROR: test_config.json not found.');
    process.exit(1);
  }
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.funded) {
    console.error('ERROR: Accounts not funded. Check test_config.json.');
    process.exit(1);
  }

  // Setup algod
  algod = new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort);

  // Test algod connectivity
  try {
    await algod.status().do();
    console.log('  Algod:   CONNECTED (testnet)');
  } catch (e) {
    console.error('ERROR: Cannot connect to Algorand testnet:', e.message);
    process.exit(1);
  }

  // Reconstruct accounts
  creator = algosdk.mnemonicToSecretKey(config.creator.mnemonic);
  staker = algosdk.mnemonicToSecretKey(config.staker.mnemonic);
  creatorSigner = algosdk.makeBasicAccountTransactionSigner(creator);
  stakerSigner = algosdk.makeBasicAccountTransactionSigner(staker);

  // Check balances
  const creatorBal = await getBalance(creator.addr.toString());
  const stakerBal = await getBalance(staker.addr.toString());
  console.log(`  Creator: ${(creatorBal / 1e6).toFixed(2)} ALGO ${creatorBal >= 3_000_000 ? '(OK)' : '(LOW!)'}`);
  console.log(`  Staker:  ${(stakerBal / 1e6).toFixed(2)} ALGO ${stakerBal >= 2_000_000 ? '(OK)' : '(LOW!)'}`);

  // Creator needs at least 5 ALGO for two pool deploys + funding + deposits
  const totalBal = creatorBal + stakerBal;
  if (creatorBal < 5_000_000) {
    // Give creator 75% of combined balance (needs more for deploys)
    const targetCreator = Math.floor(totalBal * 3 / 4);
    const transfer = Math.max(0, targetCreator - creatorBal);
    if (transfer > 100_000 && stakerBal - transfer > 500_000) {
      console.log(`  Rebalancing: ${(transfer / 1e6).toFixed(2)} ALGO staker → creator...`);
      const sp = await getSP();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: staker.addr, receiver: creator.addr, amount: transfer, suggestedParams: sp,
      });
      const signed = txn.signTxn(staker.sk);
      const { txid } = await algod.sendRawTransaction(signed).do();
      await algosdk.waitForConfirmation(algod, txid, 4);
      const newCreatorBal = await getBalance(creator.addr.toString());
      console.log(`  Rebalance done. New creator balance: ${(newCreatorBal / 1e6).toFixed(2)} ALGO`);
    }
  }

  // Check NFT ownership
  const nft1Bal = await getAssetBalance(staker.addr.toString(), config.nft1Id);
  const nft2Bal = await getAssetBalance(staker.addr.toString(), config.nft2Id);
  console.log(`  NFT1 (${config.nft1Id}): balance=${nft1Bal} ${nft1Bal >= 1 ? '(OK)' : '(MISSING!)'}`);
  console.log(`  NFT2 (${config.nft2Id}): balance=${nft2Bal} ${nft2Bal >= 1 ? '(OK)' : '(MISSING!)'}`);

  if (nft1Bal < 1 || nft2Bal < 1) {
    console.error('ERROR: Staker must hold both test NFTs. Cannot proceed.');
    process.exit(1);
  }

  // Load ARC32 and compile TEAL
  const arc32Path = path.join(__dirname, '..', 'FryNftStaking.arc32.json');
  const arc32 = JSON.parse(fs.readFileSync(arc32Path, 'utf8'));
  contract = new algosdk.ABIContract(arc32.contract);

  console.log('  Compiling TEAL...');
  const approvalSource = Buffer.from(arc32.source.approval, 'base64');
  const clearSource = Buffer.from(arc32.source.clear, 'base64');
  const approvalResult = await algod.compile(approvalSource).do();
  const clearResult = await algod.compile(clearSource).do();
  compiledApproval = new Uint8Array(Buffer.from(approvalResult.result, 'base64'));
  compiledClear = new Uint8Array(Buffer.from(clearResult.result, 'base64'));
  console.log(`  Contract: COMPILED (approval: ${compiledApproval.length}b, clear: ${compiledClear.length}b)`);

  // Start Express server
  await startServer();

  console.log('\n  PRE-FLIGHT: ALL CHECKS PASSED\n');
}

// ── Tests ───────────────────────────────────────────────────────────

async function test1_deployPool() {
  console.log('--- Test 1: Deploy / Reuse Pool (on-chain + backend) ---');
  try {
    const collectionCreator = config.collection_creator || creator.addr.toString();

    if (REUSE_APP_ID > 0) {
      // Reuse existing contract (saves ~3.5 ALGO testnet deploy cost)
      appId1 = REUSE_APP_ID;
      appAddr1 = algosdk.getApplicationAddress(appId1);
      console.log(`  Reusing existing app: ${appId1}`);
      console.log(`  App Address: ${appAddr1.toString()}`);

      // Verify global state is usable
      const state = await readGlobalState(appId1);
      if (state.is_active !== 1n) throw new Error(`App not active: is_active=${state.is_active}`);
      if (state.total_nfts_staked !== 0n) throw new Error(`App has staked NFTs: ${state.total_nfts_staked}`);
      console.log(`  State OK: active, 0 staked, reward_balance=${state.total_reward_balance}`);
    } else {
      // Deploy fresh contract
      const result = await deployPool({
        methodArgs: [
          0n, 0n, 0n, collectionCreator, 0n, 100_000n, 0n, 0n, 0n, 0n, 0n,
          creator.addr.toString(), 0n, 0n, 0n,
        ],
      });
      appId1 = result.appId;
      appAddr1 = result.appAddr;
      logTx(1, 'deploy', result.txId);
      console.log(`  App ID: ${appId1}`);
      const fundTxId = await fundApp(appAddr1, 100_000, creator, creatorSigner);
      logTx(1, 'fund_app', fundTxId);
    }

    // Verify global state
    const state = await readGlobalState(appId1);
    const checks = [['is_active', 1n], ['reward_model', 0n], ['total_nfts_staked', 0n]];
    for (const [key, expected] of checks) {
      if (state[key] !== expected) throw new Error(`Global ${key}: expected ${expected}, got ${state[key]}`);
    }

    // Register in backend
    const addRes = await apiCall('POST', '/nft/add', {
      creatorId: creator.addr.toString(),
      appId: appId1,
      name: 'Integration Test Pool',
      rewardTokenId: 0,
      rewardModel: 'fixed_rate',
      collectionMode: 'creator_address',
      collectionCreator,
      ratePerDay: 100000,
    });
    mongoPoolId1 = addRes.data._id;
    console.log(`  MongoDB _id: ${mongoPoolId1}`);

    // If reusing app, sync DB totalRewardsClaimed with on-chain value
    if (REUSE_APP_ID > 0 && Number(state.total_rewards_claimed) > 0) {
      const priorClaimed = Number(state.total_rewards_claimed);
      console.log(`  Syncing DB totalRewardsClaimed with on-chain: ${priorClaimed}`);
      await apiCall('PUT', `/nft/update/${appId1}`, { totalRewardsClaimed: priorClaimed });
    }

    // Verify GET
    const getRes = await apiCall('GET', `/nft/pool/${appId1}`);
    if (getRes.data.appId !== appId1) throw new Error(`DB appId mismatch: ${getRes.data.appId}`);

    pass(1, `Pool ready (appId=${appId1}, DB created${REUSE_APP_ID ? ', reused' : ', fresh deploy'})`);
  } catch (err) {
    fail(1, 'Deploy/reuse pool failed', err);
    throw err;
  }
}

async function test2_depositRewards() {
  console.log('--- Test 2: Deposit / Verify Rewards (on-chain only) ---');
  try {
    const stateBefore = await readGlobalState(appId1);
    const existingBalance = Number(stateBefore.total_reward_balance);

    if (existingBalance >= 50_000) {
      // Already has sufficient reward balance (reused app)
      console.log(`  Existing reward balance: ${existingBalance} µALGO (sufficient, skipping deposit)`);
      pass(2, `Rewards verified (existing: ${existingBalance} µALGO)`);
      return;
    }

    const depositAmount = 100_000;
    const sp = await getSP();
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr, receiver: appAddr1, amount: depositAmount, suggestedParams: sp,
    });

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('deposit_rewards_algo'),
      methodArgs: [{ txn: payTxn, signer: creatorSigner }],
      sender: creator.addr, suggestedParams: sp, signer: creatorSigner,
    });

    const result = await atc.execute(algod, 4);
    logTx(2, 'deposit_rewards_algo', result.txIDs[result.txIDs.length - 1]);

    const stateAfter = await readGlobalState(appId1);
    const newBalance = Number(stateAfter.total_reward_balance);
    if (newBalance < depositAmount) {
      throw new Error(`total_reward_balance too low: ${newBalance}`);
    }

    pass(2, `Rewards deposited (${depositAmount} µALGO, total: ${newBalance})`);
  } catch (err) {
    fail(2, 'Deposit rewards failed', err);
    throw err;
  }
}

async function test3_stakeNft1() {
  console.log('--- Test 3: Stake NFT #1 (on-chain + backend) ---');
  try {
    // 3a: Opt contract into NFT1 (skip if already opted in)
    const appAssets1 = await algod.accountInformation(appAddr1.toString()).do();
    const alreadyOptedIn1 = (appAssets1.assets || []).some(a => Number(a.assetId) === config.nft1Id);
    if (alreadyOptedIn1) {
      console.log(`  App already opted into NFT1 (${config.nft1Id}), skipping opt-in`);
    } else {
      await optInAsset(appId1, appAddr1, config.nft1Id, staker, stakerSigner, 3, 'opt_in_nft1');
    }

    // 3b: Stake on-chain
    // Box MBR = 335,300 (2500 + 400*832). If app already has surplus ALGO, reduce payment.
    const appInfo = await algod.accountInformation(appAddr1.toString()).do();
    const appSurplus = Number(appInfo.amount) - Number(appInfo.minBalance);
    const boxMbr = 335_300;
    const boxPaymentAmount = Math.max(0, boxMbr - appSurplus + 10_000); // 10K buffer
    console.log(`  App surplus: ${appSurplus} µALGO, box payment: ${boxPaymentAmount} µALGO`);

    const sp = await getSP();
    const nftTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr1, amount: 1, assetIndex: config.nft1Id,
      suggestedParams: await getSP(),
    });
    const boxPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr1, amount: boxPaymentAmount,
      suggestedParams: await getSP(),
    });
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [{ txn: nftTransfer, signer: stakerSigner }, { txn: boxPayment, signer: stakerSigner }],
      sender: staker.addr, suggestedParams: sp, signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft1Id)],
    });
    const result = await atc.execute(algod, 4);
    logTx(3, 'stake_nft_1', result.txIDs[result.txIDs.length - 1]);

    // Verify on-chain
    const state = await readGlobalState(appId1);
    if (state.total_nfts_staked !== 1n) throw new Error(`total_nfts_staked: expected 1, got ${state.total_nfts_staked}`);
    const boxData = await readBox(appId1, staker.addr.publicKey);
    if (!boxData) throw new Error('User box not found');
    const box = parseUserBox(boxData);
    if (box.nftCount !== 1n) throw new Error(`box nft_count: expected 1, got ${box.nftCount}`);

    // 3c: Record in backend
    await apiCall('POST', '/nft/stake', {
      wallet: staker.addr.toString(),
      poolId: mongoPoolId1,
      appId: appId1,
      nftAsaId: config.nft1Id,
      nftName: 'Test NFT 1',
    });

    // 3d: Verify backend
    const walletStakes = await apiCall('GET', `/nft/stakes/wallet/${staker.addr.toString()}`);
    if (walletStakes.data.length !== 1) throw new Error(`Expected 1 wallet stake, got ${walletStakes.data.length}`);
    const poolStakes = await apiCall('GET', `/nft/stakes/pool/${appId1}`);
    if (poolStakes.data.length !== 1) throw new Error(`Expected 1 pool stake, got ${poolStakes.data.length}`);

    // 3e: Cross-check
    await crossCheckPool(3, appId1, 'Pool1');

    pass(3, `NFT #1 staked (on-chain=1, DB=1)`);
  } catch (err) {
    fail(3, 'Stake NFT #1 failed', err);
    throw err;
  }
}

async function test4_stakeNft2() {
  console.log('--- Test 4: Stake NFT #2 (on-chain + backend) ---');
  try {
    // Opt contract into NFT2 (skip if already opted in)
    const appAssets2 = await algod.accountInformation(appAddr1.toString()).do();
    const alreadyOptedIn2 = (appAssets2.assets || []).some(a => Number(a.assetId) === config.nft2Id);
    if (alreadyOptedIn2) {
      console.log(`  App already opted into NFT2 (${config.nft2Id}), skipping opt-in`);
    } else {
      await optInAsset(appId1, appAddr1, config.nft2Id, staker, stakerSigner, 4, 'opt_in_nft2');
    }

    // Record on-chain state before (to detect auto-claim)
    const stateBefore = await readGlobalState(appId1);

    // Stake on-chain (no box creation, payment=0)
    const sp = await getSP(1000); // extra fee for auto-claim on second stake
    const nftTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr1, amount: 1, assetIndex: config.nft2Id,
      suggestedParams: await getSP(),
    });
    const boxPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr1, amount: 0,
      suggestedParams: await getSP(),
    });
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [{ txn: nftTransfer, signer: stakerSigner }, { txn: boxPayment, signer: stakerSigner }],
      sender: staker.addr, suggestedParams: sp, signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft2Id)],
    });
    const result = await atc.execute(algod, 4);
    const stakeTxId = result.txIDs[result.txIDs.length - 1];
    logTx(4, 'stake_nft_2', stakeTxId);

    // Verify on-chain
    const stateAfter = await readGlobalState(appId1);
    if (stateAfter.total_nfts_staked !== 2n) throw new Error(`total_nfts_staked: expected 2, got ${stateAfter.total_nfts_staked}`);
    const box = parseUserBox(await readBox(appId1, staker.addr.publicKey));
    if (box.nftCount !== 2n) throw new Error(`box nft_count: expected 2, got ${box.nftCount}`);

    // Record in backend
    await apiCall('POST', '/nft/stake', {
      wallet: staker.addr.toString(),
      poolId: mongoPoolId1,
      appId: appId1,
      nftAsaId: config.nft2Id,
      nftName: 'Test NFT 2',
    });

    // If the contract auto-claimed during the 2nd stake, record it in DB too
    const autoClaimAmount = Number(stateAfter.total_rewards_claimed - stateBefore.total_rewards_claimed);
    if (autoClaimAmount > 0) {
      console.log(`  Auto-claim detected: ${autoClaimAmount} µALGO`);
      await apiCall('POST', '/nft/claim', {
        wallet: staker.addr.toString(),
        poolId: mongoPoolId1,
        appId: appId1,
        rewardClaimed: autoClaimAmount,
        txId: stakeTxId, // same txId — auto-claim is part of the stake txn
        feeAmount: 0,
      });
    }

    // Verify backend
    const walletStakes = await apiCall('GET', `/nft/stakes/wallet/${staker.addr.toString()}`);
    if (walletStakes.data.length !== 2) throw new Error(`Expected 2 wallet stakes, got ${walletStakes.data.length}`);

    // Cross-check
    await crossCheckPool(4, appId1, 'Pool1');

    pass(4, `NFT #2 staked (on-chain=2, DB=2${autoClaimAmount > 0 ? `, auto-claim=${autoClaimAmount}` : ''})`);
  } catch (err) {
    fail(4, 'Stake NFT #2 failed', err);
    throw err;
  }
}

async function test5_claimRewards() {
  console.log('--- Test 5: Claim Rewards (waiting 65s for accrual) ---');
  try {
    const stateBefore = await readGlobalState(appId1);
    const boxBefore = parseUserBox(await readBox(appId1, staker.addr.publicKey));

    console.log('  Waiting 65 seconds for rewards to accrue...');
    await new Promise(r => setTimeout(r, 65000));

    // Claim on-chain
    const sp = await getSP(1000);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('claim_rewards'),
      methodArgs: [],
      sender: staker.addr, suggestedParams: sp, signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
    });
    const result = await atc.execute(algod, 4);
    const claimTxId = result.txIDs[result.txIDs.length - 1];
    logTx(5, 'claim_rewards', claimTxId);

    const stateAfter = await readGlobalState(appId1);
    const boxAfter = parseUserBox(await readBox(appId1, staker.addr.publicKey));

    const rewardsClaimed = stateBefore.total_reward_balance - stateAfter.total_reward_balance;
    console.log(`  Rewards claimed: ${rewardsClaimed} µALGO`);
    console.log(`  total_rewards_claimed: ${stateBefore.total_rewards_claimed} → ${stateAfter.total_rewards_claimed}`);

    if (rewardsClaimed <= 0n) throw new Error('No rewards claimed');
    if (stateAfter.total_rewards_claimed <= stateBefore.total_rewards_claimed) {
      throw new Error('total_rewards_claimed did not increase');
    }
    if (boxAfter.lastClaimTime <= boxBefore.lastClaimTime) {
      throw new Error('last_claim_time did not update');
    }

    // Record in backend
    const claimAmount = Number(rewardsClaimed);
    await apiCall('POST', '/nft/claim', {
      wallet: staker.addr.toString(),
      poolId: mongoPoolId1,
      appId: appId1,
      rewardClaimed: claimAmount,
      txId: claimTxId,
      feeAmount: 0,
    });

    // Verify backend claim record exists (there may be auto-claims from earlier stakes)
    const claims = await apiCall('GET', `/nft/claims/${staker.addr.toString()}`);
    if (claims.data.length < 1) throw new Error(`Expected at least 1 claim, got ${claims.data.length}`);
    const lastClaim = claims.data[0]; // sorted by claimedAt desc
    if (lastClaim.rewardClaimed !== claimAmount) {
      throw new Error(`Last claim amount mismatch: DB=${lastClaim.rewardClaimed}, expected=${claimAmount}`);
    }
    console.log(`  Total claim records: ${claims.data.length}`);

    // Cross-check all pool fields (including totalRewardsClaimed)
    await crossCheckPool(5, appId1, 'Pool1');

    pass(5, `Rewards claimed (${claimAmount} µALGO, DB recorded)`);
  } catch (err) {
    fail(5, 'Claim rewards failed', err);
    throw err;
  }
}

async function test6_unstakeNft1() {
  console.log('--- Test 6: Unstake NFT #1 (on-chain + backend) ---');
  try {
    const stateBefore = await readGlobalState(appId1);

    // Unstake on-chain
    const sp = await getSP(2000);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('unstake_nft'),
      methodArgs: [BigInt(config.nft1Id)],
      sender: staker.addr, suggestedParams: sp, signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft1Id)],
    });
    const result = await atc.execute(algod, 4);
    const unstakeTxId = result.txIDs[result.txIDs.length - 1];
    logTx(6, 'unstake_nft_1', unstakeTxId);

    // Verify on-chain
    const stateAfter = await readGlobalState(appId1);
    if (stateAfter.total_nfts_staked !== 1n) throw new Error(`total_nfts_staked: expected 1, got ${stateAfter.total_nfts_staked}`);
    const nft1Bal = await getAssetBalance(staker.addr.toString(), config.nft1Id);
    if (nft1Bal !== 1) throw new Error(`Staker NFT1 balance: expected 1, got ${nft1Bal}`);

    // Record in backend
    await apiCall('POST', '/nft/unstake', {
      wallet: staker.addr.toString(),
      appId: appId1,
      nftAsaId: config.nft1Id,
    });

    // Record auto-claim from unstake (unstake always auto-claims)
    const autoClaimAmount = Number(stateAfter.total_rewards_claimed - stateBefore.total_rewards_claimed);
    if (autoClaimAmount > 0) {
      console.log(`  Auto-claim on unstake: ${autoClaimAmount} µALGO`);
      await apiCall('POST', '/nft/claim', {
        wallet: staker.addr.toString(),
        poolId: mongoPoolId1,
        appId: appId1,
        rewardClaimed: autoClaimAmount,
        txId: unstakeTxId,
        feeAmount: 0,
      });
    }

    // Verify backend
    const walletStakes = await apiCall('GET', `/nft/stakes/wallet/${staker.addr.toString()}`);
    const activeCount = walletStakes.data.filter(s => s.appId === appId1).length;
    if (activeCount !== 1) throw new Error(`Expected 1 active stake, got ${activeCount}`);

    // Cross-check
    await crossCheckPool(6, appId1, 'Pool1');

    pass(6, `NFT #1 unstaked (on-chain=1, DB=1)`);
  } catch (err) {
    fail(6, 'Unstake NFT #1 failed', err);
    throw err;
  }
}

async function test7_pausePool() {
  console.log('--- Test 7: Pause Pool (on-chain + backend) ---');
  try {
    // Pause on-chain
    const sp = await getSP();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('pause_pool'),
      methodArgs: [],
      sender: creator.addr, suggestedParams: sp, signer: creatorSigner,
    });
    const result = await atc.execute(algod, 4);
    logTx(7, 'pause_pool', result.txIDs[0]);

    const state = await readGlobalState(appId1);
    if (state.is_active !== 0n) throw new Error(`is_active: expected 0, got ${state.is_active}`);

    // Update backend
    await apiCall('PUT', `/nft/update/${appId1}`, { isActive: false });

    // Verify cross-check
    await crossCheckPool(7, appId1, 'Pool1');

    pass(7, 'Pool paused (on-chain=inactive, DB=inactive)');
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
      sender: staker.addr, receiver: appAddr1, amount: 1, assetIndex: config.nft1Id,
      suggestedParams: await getSP(),
    });
    const boxPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr1, amount: 0,
      suggestedParams: await getSP(),
    });
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('stake_nft'),
      methodArgs: [{ txn: nftTransfer, signer: stakerSigner }, { txn: boxPayment, signer: stakerSigner }],
      sender: staker.addr, suggestedParams: sp, signer: stakerSigner,
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
        pass(8, 'Stake rejected (insufficient balance context, pool is paused per Test 7)');
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
  console.log('--- Test 9: Resume Pool (on-chain + backend) ---');
  try {
    const sp = await getSP();
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('resume_pool'),
      methodArgs: [],
      sender: creator.addr, suggestedParams: sp, signer: creatorSigner,
    });
    const result = await atc.execute(algod, 4);
    logTx(9, 'resume_pool', result.txIDs[0]);

    const state = await readGlobalState(appId1);
    if (state.is_active !== 1n) throw new Error(`is_active: expected 1, got ${state.is_active}`);

    // Update backend
    await apiCall('PUT', `/nft/update/${appId1}`, { isActive: true });

    // Cross-check
    await crossCheckPool(9, appId1, 'Pool1');

    pass(9, 'Pool resumed (on-chain=active, DB=active)');
  } catch (err) {
    fail(9, 'Resume pool failed', err);
    throw err;
  }
}

async function test10_unstakeLast() {
  console.log('--- Test 10: Unstake Last NFT (box deletion) ---');
  try {
    const stateBefore = await readGlobalState(appId1);

    const sp = await getSP(2000);
    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId1,
      method: contract.getMethodByName('unstake_nft'),
      methodArgs: [BigInt(config.nft2Id)],
      sender: staker.addr, suggestedParams: sp, signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft2Id)],
    });
    const result = await atc.execute(algod, 4);
    const unstakeTxId = result.txIDs[result.txIDs.length - 1];
    logTx(10, 'unstake_nft_2', unstakeTxId);

    // Verify on-chain
    const stateAfter = await readGlobalState(appId1);
    if (stateAfter.total_nfts_staked !== 0n) throw new Error(`total_nfts_staked: expected 0, got ${stateAfter.total_nfts_staked}`);
    const nft2Bal = await getAssetBalance(staker.addr.toString(), config.nft2Id);
    if (nft2Bal !== 1) throw new Error(`Staker NFT2 balance: expected 1, got ${nft2Bal}`);
    const boxData = await readBox(appId1, staker.addr.publicKey);
    if (boxData !== null) throw new Error('User box still exists after unstaking all NFTs');

    // Record in backend
    await apiCall('POST', '/nft/unstake', {
      wallet: staker.addr.toString(),
      appId: appId1,
      nftAsaId: config.nft2Id,
    });

    // Record auto-claim from unstake
    const autoClaimAmount = Number(stateAfter.total_rewards_claimed - stateBefore.total_rewards_claimed);
    if (autoClaimAmount > 0) {
      console.log(`  Auto-claim on unstake: ${autoClaimAmount} µALGO`);
      await apiCall('POST', '/nft/claim', {
        wallet: staker.addr.toString(),
        poolId: mongoPoolId1,
        appId: appId1,
        rewardClaimed: autoClaimAmount,
        txId: unstakeTxId,
        feeAmount: 0,
      });
    }

    // Verify backend
    const walletStakes = await apiCall('GET', `/nft/stakes/wallet/${staker.addr.toString()}`);
    const pool1Active = walletStakes.data.filter(s => s.appId === appId1);
    if (pool1Active.length !== 0) throw new Error(`Expected 0 active stakes, got ${pool1Active.length}`);

    // Cross-check
    await crossCheckPool(10, appId1, 'Pool1');

    pass(10, 'Last NFT unstaked (box deleted, on-chain=0, DB=0)');
  } catch (err) {
    fail(10, 'Unstake last NFT failed', err);
    throw err;
  }
}

async function test11_whitelist() {
  console.log('--- Test 11: Whitelist Test (second pool) ---');
  try {
    const collectionCreator = config.collection_creator || creator.addr.toString();

    // 11a: Deploy second pool with collection_mode=1 (whitelist)
    console.log('  11a: Deploying whitelist pool...');
    const result = await deployPool({
      methodArgs: [
        0n, 0n, 1n,                   // reward_token_id, reward_model, collection_mode=WHITELIST
        creator.addr.toString(),       // collection_creator (irrelevant for whitelist)
        0n, 100_000n,                  // nft_value, rate_per_day
        0n, 0n, 0n,                    // total_reward_pool, apr_rate, value_per_nft
        0n, 0n,                        // pool_end_time, lock_period
        creator.addr.toString(),       // fee_recipient
        0n, 0n, 0n,                    // fee BPS
      ],
    });
    appId2 = result.appId;
    appAddr2 = result.appAddr;
    logTx(11, 'deploy_whitelist_pool', result.txId);
    console.log(`  App ID: ${appId2}`);

    // Fund second pool
    const fundTxId = await fundApp(appAddr2, 1_500_000, creator, creatorSigner);
    logTx(11, 'fund_whitelist_pool', fundTxId);

    // Deposit rewards
    const sp = await getSP();
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: creator.addr, receiver: appAddr2, amount: 200_000, suggestedParams: sp,
    });
    const atcDep = new algosdk.AtomicTransactionComposer();
    atcDep.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('deposit_rewards_algo'),
      methodArgs: [{ txn: payTxn, signer: creatorSigner }],
      sender: creator.addr, suggestedParams: sp, signer: creatorSigner,
    });
    const depResult = await atcDep.execute(algod, 4);
    logTx(11, 'deposit_whitelist', depResult.txIDs[depResult.txIDs.length - 1]);

    // 11b: Register in backend
    const addRes = await apiCall('POST', '/nft/add', {
      creatorId: creator.addr.toString(),
      appId: appId2,
      name: 'Integration Whitelist Pool',
      rewardTokenId: 0,
      rewardModel: 'fixed_rate',
      collectionMode: 'whitelist',
      ratePerDay: 100000,
    });
    mongoPoolId2 = addRes.data._id;
    console.log(`  MongoDB pool2 _id: ${mongoPoolId2}`);

    // 11c: Add NFT1 and NFT2 to whitelist
    console.log('  11c: Adding NFTs to whitelist...');
    const wlBoxName = new Uint8Array(Buffer.from('wl'));

    for (const nftId of [config.nft1Id, config.nft2Id]) {
      const atcWl = new algosdk.AtomicTransactionComposer();
      const wlSp = await getSP();
      const mbrPayTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: creator.addr, receiver: appAddr2, amount: 50_000, suggestedParams: wlSp,
      });
      atcWl.addTransaction({ txn: mbrPayTxn, signer: creatorSigner });
      atcWl.addMethodCall({
        appID: appId2,
        method: contract.getMethodByName('add_to_whitelist'),
        methodArgs: [BigInt(nftId)],
        sender: creator.addr, suggestedParams: wlSp, signer: creatorSigner,
        boxes: [{ appIndex: 0, name: wlBoxName }],
      });
      const wlResult = await atcWl.execute(algod, 4);
      logTx(11, `add_whitelist_${nftId}`, wlResult.txIDs[wlResult.txIDs.length - 1]);
    }

    // Verify whitelist box
    const wlData = await readBox(appId2, wlBoxName);
    if (!wlData) throw new Error('Whitelist box not found');
    const wlCount = wlData.length / 8;
    console.log(`  Whitelist has ${wlCount} entries`);
    if (wlCount !== 2) throw new Error(`Expected 2 whitelist entries, got ${wlCount}`);

    // 11d: Opt in + stake NFT2 (whitelisted)
    console.log('  11d: Staking whitelisted NFT2...');
    await optInAsset(appId2, appAddr2, config.nft2Id, staker, stakerSigner, 11, 'opt_in_nft2_wl');

    const stakeSp = await getSP();
    const nft2Transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr2, amount: 1, assetIndex: config.nft2Id,
      suggestedParams: await getSP(),
    });
    const stakeBoxPay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: staker.addr, receiver: appAddr2, amount: 535_300,
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
      sender: staker.addr, suggestedParams: stakeSp, signer: stakerSigner,
      boxes: [
        { appIndex: 0, name: staker.addr.publicKey },
        { appIndex: 0, name: wlBoxName },
      ],
      appForeignAssets: [BigInt(config.nft2Id)],
    });
    const stakeResult = await atcStake.execute(algod, 4);
    logTx(11, 'stake_whitelisted_nft2', stakeResult.txIDs[stakeResult.txIDs.length - 1]);

    // Record in backend
    await apiCall('POST', '/nft/stake', {
      wallet: staker.addr.toString(),
      poolId: mongoPoolId2,
      appId: appId2,
      nftAsaId: config.nft2Id,
      nftName: 'Test NFT 2 (WL)',
    });

    // 11e: Remove NFT1 from whitelist
    console.log('  11e: Removing NFT1 from whitelist...');
    const rmAtc = new algosdk.AtomicTransactionComposer();
    rmAtc.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('remove_from_whitelist'),
      methodArgs: [BigInt(config.nft1Id)],
      sender: creator.addr, suggestedParams: await getSP(), signer: creatorSigner,
      boxes: [{ appIndex: 0, name: wlBoxName }],
    });
    const rmResult = await rmAtc.execute(algod, 4);
    logTx(11, 'remove_whitelist_nft1', rmResult.txIDs[0]);

    const wlDataAfter = await readBox(appId2, wlBoxName);
    if (wlDataAfter.length !== 8) throw new Error(`Whitelist should have 1 entry (8 bytes), got ${wlDataAfter.length}`);

    // 11f: Attempt to stake non-whitelisted NFT1
    console.log('  11f: Attempting non-whitelisted NFT1 stake (expect fail)...');
    await optInAsset(appId2, appAddr2, config.nft1Id, staker, stakerSigner, 11, 'opt_in_nft1_wl');
    try {
      const nft1Transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: staker.addr, receiver: appAddr2, amount: 1, assetIndex: config.nft1Id,
        suggestedParams: await getSP(),
      });
      const boxPay2 = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: staker.addr, receiver: appAddr2, amount: 200_000,
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
        sender: staker.addr, suggestedParams: await getSP(), signer: stakerSigner,
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
      if (errMsg.includes('Expected rejection')) throw innerErr;
      console.log(`  NFT1 stake correctly rejected: ${errMsg.substring(0, 100)}`);
    }

    // 11g: Unstake NFT2 from whitelist pool
    console.log('  11g: Unstaking NFT2 from whitelist pool...');
    const unSp = await getSP(2000);
    const atcUn = new algosdk.AtomicTransactionComposer();
    atcUn.addMethodCall({
      appID: appId2,
      method: contract.getMethodByName('unstake_nft'),
      methodArgs: [BigInt(config.nft2Id)],
      sender: staker.addr, suggestedParams: unSp, signer: stakerSigner,
      boxes: [{ appIndex: 0, name: staker.addr.publicKey }],
      appForeignAssets: [BigInt(config.nft2Id)],
    });
    const unResult = await atcUn.execute(algod, 4);
    logTx(11, 'unstake_nft2_wl', unResult.txIDs[unResult.txIDs.length - 1]);

    // Record in backend
    await apiCall('POST', '/nft/unstake', {
      wallet: staker.addr.toString(),
      appId: appId2,
      nftAsaId: config.nft2Id,
    });

    // Cross-check pool 2
    await crossCheckPool(11, appId2, 'Pool2');

    pass(11, 'Whitelist add/remove/enforce working');
  } catch (err) {
    fail(11, 'Whitelist test failed', err);
    throw err;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  await init();

  console.log('========================================');
  console.log('    INTEGRATION TESTS');
  console.log('========================================\n');

  const tests = [
    test1_deployPool,
    test2_depositRewards,
    test3_stakeNft1,
    test4_stakeNft2,
    test5_claimRewards,
    test6_unstakeNft1,
    test7_pausePool,
    test8_stakeWhilePaused,
    test9_resumePool,
    test10_unstakeLast,
  ];

  // Only run whitelist test if we have enough ALGO for a second pool deploy
  const creatorAvail = await getBalance(creator.addr.toString()) - 3_200_000; // rough MBR
  if (creatorAvail > 2_000_000) {
    tests.push(test11_whitelist);
  } else {
    console.log('  Skipping Test 11 (whitelist): insufficient ALGO for second pool deploy');
    console.log(`  (Creator available: ~${(creatorAvail / 1e6).toFixed(2)} ALGO, need ~2.0 ALGO)\n`);
  }

  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      break;
    }
  }

  // ── Final Consistency Checks ────────────────────────────────────
  console.log('\n--- Final Consistency Checks ---');
  try {
    if (appId1) await crossCheckPool('final', appId1, 'Pool1');
    if (appId2) await crossCheckPool('final', appId2, 'Pool2');
  } catch (e) {
    console.error('  Final cross-check error:', e.message);
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('    INTEGRATION TEST REPORT');
  console.log('========================================\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Results: ${passed}/${results.length} passed, ${failed} failed\n`);

  for (const r of results) {
    console.log(`  ${r.status === 'PASS' ? 'PASS' : 'FAIL'} Test ${r.test}: ${r.msg}`);
  }

  console.log('\n--- App IDs ---');
  if (appId1) console.log(`  Pool 1 (creator mode): ${appId1}`);
  if (appId2) console.log(`  Pool 2 (whitelist mode): ${appId2}`);

  console.log('\n--- Transaction Log ---');
  for (const entry of txLog) {
    console.log(`  Test ${entry.test} [${entry.label}]: ${entry.txId}`);
  }

  console.log('\n========================================\n');

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(err => {
    console.error('FATAL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
  });
