#!/usr/bin/env node
/**
 * V1 On-Chain State Investigation + Corrected Audit — READ-ONLY
 *
 * Reads on-chain global state for all 11 V1 staking pools, checks pool
 * reward balances, recalculates the audit with on-chain APR (not MongoDB),
 * and computes the delta between what V1 will pay on unstake vs what users
 * are actually owed.
 *
 * Phase 1: Read global state from Indexer for all V1 pools
 * Phase 2: Check reward token balances held by each pool's contract address
 * Phase 3: Read all user boxes per pool
 * Phase 4: Recalculate audit using on-chain APR
 * Phase 5: Write corrected audit JSON and investigation report
 *
 * Usage:
 *   MONGODB_URI=$(docker exec fry-farm-backend printenv MONGODB_URI) \
 *   NODE_PATH=./backend/node_modules \
 *   node scripts/v1OnChainInvestigation.js
 *
 * Output:
 *   scripts/v1_reward_audit_corrected.json
 *   docs/v1_pool_investigation_report.md
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const mongoose = require('mongoose');
const algosdk = require('algosdk');

// Resolve models — works both inside container and on host
const modelsDir = fs.existsSync(path.join(__dirname, '..', 'models'))
  ? path.join(__dirname, '..', 'models')
  : path.join(__dirname, '..', 'backend', 'models');

const Staking = require(path.join(modelsDir, 'stakingSchema'));

// ── Constants ────────────────────────────────────────────────────────────────

const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const SECONDS_PER_YEAR = 31104000; // 360 * 86400
const FRY_ASA_ID = 2485314946;

// All V1 pool app IDs (10 migrated + 1 pre-migration pool)
const V1_POOL_APP_IDS = [
  3465579498,   // Fry → Fry (pre-migration, no V2 mapping)
  3468848937,   // USDC → Fry
  3469720617,   // Fry → Fry
  3470020844,   // Fry → Fry
  3473560676,   // Fry Node → Fry Node
  3473562061,   // Fry VPN → Fry VPN
  3473563847,   // Fry → Fry
  3473565258,   // Token → Token
  3473566323,   // Token → Token
  3473573376,   // Fry → Fry
  3473574550,   // Fry Node → Fry Node
];

const MANIFEST_PATH = path.join(__dirname, 'phantom_claims_manifest.json');
const OUTPUT_PATH = path.join(__dirname, 'v1_reward_audit_corrected.json');
const REPORT_PATH = path.join(__dirname, '..', 'docs', 'v1_pool_investigation_report.md');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

function decodeUint64(buffer, offset) {
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value = (value << BigInt(8)) | BigInt(buffer[offset + i]);
  }
  return Number(value);
}

/**
 * Decode global state key-value pairs from Indexer response.
 * Returns { keyName: value } where value is either a number (uint) or string (bytes as base64).
 */
function decodeGlobalState(globalState) {
  const decoded = {};
  for (const kv of globalState) {
    const keyBytes = Buffer.from(kv.key, 'base64');
    const keyName = keyBytes.toString('utf8');
    if (kv.value.type === 2) {
      decoded[keyName] = kv.value.uint;
    } else {
      decoded[keyName] = kv.value.bytes; // base64 string
    }
  }
  return decoded;
}

/**
 * Correct reward formula (V2 — no truncation).
 * APR is in on-chain units (percentage * 100, e.g. 50% = 5000).
 * Formula: staked * apr * duration / (10000 * SECONDS_PER_YEAR)
 */
function calcCorrectReward(staked, onChainApr, duration) {
  if (!onChainApr || !duration || !staked) return 0;
  // Use BigInt for 128-bit precision matching V2 contract
  const s = BigInt(staked);
  const a = BigInt(onChainApr);
  const d = BigInt(duration);
  const divisor = BigInt(10000) * BigInt(SECONDS_PER_YEAR);
  return Number((s * a * d) / divisor);
}

/**
 * V1 buggy reward formula (with intermediate truncation).
 * Formula: (staked * apr * floor((duration * 100) / SECONDS_PER_YEAR)) / 1000000
 * Truncates to 0 when duration < 311,040 seconds (~3.6 days).
 */
function calcV1Reward(staked, onChainApr, duration) {
  if (!onChainApr || !duration || !staked) return 0;
  const intermediate = Math.floor((duration * 100) / SECONDS_PER_YEAR);
  return Math.floor((staked * onChainApr * intermediate) / 1000000);
}

/**
 * Convert on-chain APR to human-readable percentage.
 * On-chain: 5000 = 50%, 49412 = 494.12%
 */
function aprToPercent(onChainApr) {
  return onChainApr / 100;
}

// ── Phase 1: Read global state ──────────────────────────────────────────────

async function readGlobalStates(appIds) {
  console.log('PHASE 1: Reading on-chain global state for all V1 pools...\n');
  const states = {};

  for (const appId of appIds) {
    await sleep(200);
    try {
      const resp = await fetchJson(`${INDEXER_BASE}/v2/applications/${appId}`);
      if (!resp || !resp.application) {
        console.log(`  [${appId}] Application not found on-chain`);
        states[appId] = null;
        continue;
      }

      const gs = resp.application.params?.['global-state'] || [];
      const decoded = decodeGlobalState(gs);
      states[appId] = decoded;

      const apr = decoded.apr ?? 0;
      const stakeToken = decoded.stake_token ?? 0;
      const rewardToken = decoded.reward_token ?? 0;
      const rewardAmount = decoded.reward_token_amount ?? 0;
      const totalStaked = decoded.total_staked ?? 0;
      const totalStakers = decoded.total_stakers ?? 0;
      const rewardsDistributed = decoded.rewards_distributed ?? 0;

      console.log(`  [${appId}] APR: ${apr} (${aprToPercent(apr).toFixed(2)}%), ` +
        `stakeToken: ${stakeToken}, rewardToken: ${rewardToken}, ` +
        `rewardAmount: ${rewardAmount}, totalStaked: ${totalStaked}, ` +
        `stakers: ${totalStakers}, distributed: ${rewardsDistributed}`);
    } catch (err) {
      console.log(`  [${appId}] Error reading global state: ${err.message}`);
      states[appId] = null;
    }
  }

  return states;
}

// ── Phase 2: Check reward token balances ────────────────────────────────────

async function checkPoolBalances(appIds, globalStates) {
  console.log('\nPHASE 2: Checking reward token balances for each pool...\n');
  const balances = {};

  for (const appId of appIds) {
    await sleep(200);
    const appAddress = algosdk.getApplicationAddress(BigInt(appId)).toString();
    const gs = globalStates[appId];
    const rewardTokenId = gs?.reward_token ?? 0;

    try {
      const resp = await fetchJson(`${INDEXER_BASE}/v2/accounts/${appAddress}`);
      if (!resp || !resp.account) {
        console.log(`  [${appId}] ${appAddress.slice(0, 12)}... — account not found`);
        balances[appId] = { address: appAddress, algoBalance: 0, rewardBalance: 0, assets: [] };
        continue;
      }

      const acct = resp.account;
      const algoBalance = acct.amount || 0;
      const assets = acct.assets || [];
      const rewardAsset = assets.find(a => a['asset-id'] === rewardTokenId);
      const rewardBalance = rewardAsset?.amount ?? 0;

      balances[appId] = {
        address: appAddress,
        algoBalance,
        rewardBalance,
        rewardTokenId,
        assets: assets.map(a => ({ asaId: a['asset-id'], amount: a.amount })),
      };

      console.log(`  [${appId}] ${appAddress.slice(0, 12)}... — ` +
        `ALGO: ${(algoBalance / 1e6).toFixed(3)}, ` +
        `reward(${rewardTokenId}): ${rewardBalance} (${(rewardBalance / 1e6).toFixed(3)} tokens)`);
    } catch (err) {
      console.log(`  [${appId}] Error reading balance: ${err.message}`);
      balances[appId] = { address: appAddress, algoBalance: 0, rewardBalance: 0, assets: [], error: err.message };
    }
  }

  return balances;
}

// ── Phase 3 + 4: Read boxes and recalculate ─────────────────────────────────

async function readBoxesAndRecalculate(appIds, globalStates, mongoRecords, phantomRefunds) {
  console.log('\nPHASE 3+4: Reading user boxes and recalculating with on-chain APR...\n');
  const now = Math.floor(Date.now() / 1000);
  const allUsers = [];
  const poolSummaries = [];

  for (const appId of appIds) {
    const gs = globalStates[appId];
    const mongoRec = mongoRecords[appId];
    const onChainApr = gs?.apr ?? 0;
    const mongoApr = mongoRec?.aprRate ?? 0;
    // MongoDB aprRate is percentage, on-chain is percentage * 100
    const mongoAprAsOnChain = Math.round(mongoApr * 100);
    const aprMismatch = onChainApr !== mongoAprAsOnChain;

    const poolName = mongoRec
      ? `${mongoRec.stakeToken?.name || '?'} -> ${mongoRec.rewardToken?.name || '?'}`
      : 'Unknown';

    console.log(`--- Pool ${appId} (${poolName}) ---`);
    console.log(`  On-chain APR: ${onChainApr} (${aprToPercent(onChainApr).toFixed(2)}%)`);
    console.log(`  MongoDB APR:  ${mongoAprAsOnChain} (${mongoApr}% -> *100 = ${mongoAprAsOnChain})`);
    if (aprMismatch) {
      console.log(`  *** APR MISMATCH: on-chain=${onChainApr} vs MongoDB=${mongoAprAsOnChain} ***`);
    }

    // Read boxes
    let boxes = [];
    try {
      const boxesResp = await fetchJson(`${INDEXER_BASE}/v2/applications/${appId}/boxes?limit=100`);
      boxes = boxesResp?.boxes || [];
    } catch (err) {
      console.log(`  [error] Cannot read boxes: ${err.message}`);
      poolSummaries.push({
        appId, poolName, onChainApr, mongoApr, mongoAprAsOnChain, aprMismatch,
        userCount: 0, totalCorrectReward: 0, totalV1WouldPay: 0, totalDeltaOwed: 0,
        note: `Error: ${err.message}`,
      });
      await sleep(200);
      continue;
    }

    console.log(`  Boxes found: ${boxes.length}`);
    let poolTotalCorrectReward = 0;
    let poolTotalV1WouldPay = 0;
    let poolTotalDeltaOwed = 0;
    let poolUsersWithStake = 0;
    let poolUsersOwed = 0;

    for (const box of boxes) {
      await sleep(200);

      const nameB64 = box.name;
      let boxData;
      try {
        const boxResp = await fetchJson(
          `${INDEXER_BASE}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(nameB64)}`
        );
        if (!boxResp || !boxResp.value) continue;
        boxData = Buffer.from(boxResp.value, 'base64');
      } catch (err) {
        console.log(`    [error] Box read failed: ${err.message}`);
        continue;
      }

      if (boxData.length < 32) continue;

      const stakedAmount = decodeUint64(boxData, 0);
      const stakeTime = decodeUint64(boxData, 8);
      const pendingReward = decodeUint64(boxData, 16);
      const cumulativeClaimed = decodeUint64(boxData, 24);

      // Decode wallet address
      const nameBytes = Buffer.from(nameB64, 'base64');
      let wallet = '';
      try {
        wallet = algosdk.encodeAddress(nameBytes);
      } catch {
        wallet = nameBytes.toString('hex').slice(0, 16) + '...';
      }

      if (stakedAmount === 0) continue;
      poolUsersWithStake++;

      const duration = now - stakeTime;

      // Correct reward (V2 formula with on-chain APR)
      const correctReward = calcCorrectReward(stakedAmount, onChainApr, duration);

      // What V1 contract would pay on unstake (truncating formula with on-chain APR)
      const v1WouldPay = calcV1Reward(stakedAmount, onChainApr, duration);

      // Phantom refund already issued for this user+pool
      const phantomKey = `${wallet}|${appId}`;
      const alreadyRefunded = phantomRefunds[phantomKey] || 0;

      // Delta owed = correct reward - what V1 pays - already claimed - already refunded
      const deltaOwed = Math.max(0, correctReward - v1WouldPay - cumulativeClaimed - alreadyRefunded);

      poolTotalCorrectReward += correctReward;
      poolTotalV1WouldPay += v1WouldPay;
      poolTotalDeltaOwed += deltaOwed;
      if (deltaOwed > 0) poolUsersOwed++;

      allUsers.push({
        wallet,
        poolAppId: appId,
        poolName,
        stakedAmount,
        stakeTime,
        stakeTimeISO: new Date(stakeTime * 1000).toISOString(),
        durationDays: Math.round(duration / 86400 * 10) / 10,
        onChainApr,
        onChainAprPercent: aprToPercent(onChainApr),
        correctReward,
        v1WouldPay,
        cumulativeClaimed,
        pendingReward,
        alreadyRefunded,
        deltaOwed,
      });
    }

    console.log(`  Users with stake: ${poolUsersWithStake}, Users owed delta: ${poolUsersOwed}`);
    console.log(`  Total correct reward: ${(poolTotalCorrectReward / 1e6).toFixed(3)} tokens`);
    console.log(`  Total V1 would pay:   ${(poolTotalV1WouldPay / 1e6).toFixed(3)} tokens`);
    console.log(`  Total delta owed:     ${(poolTotalDeltaOwed / 1e6).toFixed(3)} tokens`);

    poolSummaries.push({
      appId,
      poolName,
      onChainApr,
      onChainAprPercent: aprToPercent(onChainApr),
      mongoApr,
      mongoAprAsOnChain,
      aprMismatch,
      rewardTokenId: gs?.reward_token ?? 0,
      userCount: poolUsersWithStake,
      usersOwed: poolUsersOwed,
      totalCorrectReward: poolTotalCorrectReward,
      totalV1WouldPay: poolTotalV1WouldPay,
      totalDeltaOwed: poolTotalDeltaOwed,
    });
  }

  return { allUsers, poolSummaries };
}

// ── Phase 5: Write outputs ──────────────────────────────────────────────────

function writeOutputs(globalStates, poolBalances, allUsers, poolSummaries, mongoRecords) {
  console.log('\nPHASE 5: Writing corrected audit and investigation report...\n');

  const usersOwed = allUsers.filter(u => u.deltaOwed > 0);
  const totalDeltaOwedMicro = usersOwed.reduce((sum, u) => sum + u.deltaOwed, 0);
  const totalCorrectRewardMicro = allUsers.reduce((sum, u) => sum + u.correctReward, 0);
  const totalV1WouldPayMicro = allUsers.reduce((sum, u) => sum + u.v1WouldPay, 0);

  // ── Corrected audit JSON ──
  const auditOutput = {
    generatedAt: new Date().toISOString(),
    note: 'Corrected audit using on-chain APR values (not MongoDB)',
    totalUsers: allUsers.length,
    usersOwed: usersOwed.length,
    totalCorrectRewardMicro,
    totalV1WouldPayMicro,
    totalDeltaOwedMicro,
    totalDeltaOwedHuman: Math.round(totalDeltaOwedMicro / 1e6 * 1e6) / 1e6,
    pools: poolSummaries.map(p => ({
      ...p,
      poolBalance: poolBalances[p.appId]?.rewardBalance ?? 0,
      poolAddress: poolBalances[p.appId]?.address ?? '',
      canCoverV1Payouts: (poolBalances[p.appId]?.rewardBalance ?? 0) >= p.totalV1WouldPay,
    })),
    users: allUsers,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(auditOutput, null, 2));
  console.log(`  Corrected audit written to: ${OUTPUT_PATH}`);

  // ── Investigation report (Markdown) ──
  const lines = [];
  lines.push('# V1 Pool On-Chain Investigation Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total pools checked | ${V1_POOL_APP_IDS.length} |`);
  lines.push(`| Total active stakers | ${allUsers.length} |`);
  lines.push(`| Users owed delta | ${usersOwed.length} |`);
  lines.push(`| Total correct reward | ${(totalCorrectRewardMicro / 1e6).toFixed(6)} tokens |`);
  lines.push(`| Total V1 would pay | ${(totalV1WouldPayMicro / 1e6).toFixed(6)} tokens |`);
  lines.push(`| Total delta owed | ${(totalDeltaOwedMicro / 1e6).toFixed(6)} tokens |`);
  lines.push('');

  // APR discrepancy table
  lines.push('## APR Discrepancies: On-Chain vs MongoDB');
  lines.push('');
  lines.push('| App ID | Pool | On-Chain APR | MongoDB APR | Match? |');
  lines.push('|--------|------|-------------|------------|--------|');
  for (const p of poolSummaries) {
    const matchIcon = p.aprMismatch ? 'MISMATCH' : 'OK';
    lines.push(`| ${p.appId} | ${p.poolName} | ${p.onChainApr} (${p.onChainAprPercent.toFixed(2)}%) | ${p.mongoAprAsOnChain} (${p.mongoApr}%) | ${matchIcon} |`);
  }
  lines.push('');

  // Pool balance check
  lines.push('## Pool Reward Token Balances');
  lines.push('');
  lines.push('| App ID | Pool | Reward Token | Balance | V1 Would Pay | Can Cover? |');
  lines.push('|--------|------|-------------|---------|-------------|------------|');
  for (const p of poolSummaries) {
    const bal = poolBalances[p.appId];
    const balance = bal?.rewardBalance ?? 0;
    const canCover = balance >= p.totalV1WouldPay ? 'YES' : 'NO';
    lines.push(`| ${p.appId} | ${p.poolName} | ${p.rewardTokenId} | ${(balance / 1e6).toFixed(3)} | ${(p.totalV1WouldPay / 1e6).toFixed(3)} | ${canCover} |`);
  }
  lines.push('');

  // On-chain global state dump
  lines.push('## On-Chain Global State (All V1 Pools)');
  lines.push('');
  for (const appId of V1_POOL_APP_IDS) {
    const gs = globalStates[appId];
    const mongoRec = mongoRecords[appId];
    const poolName = mongoRec
      ? `${mongoRec.stakeToken?.name || '?'} -> ${mongoRec.rewardToken?.name || '?'}`
      : 'Unknown';

    lines.push(`### Pool ${appId} — ${poolName}`);
    lines.push('');
    if (!gs) {
      lines.push('*Application not found on-chain or error reading state.*');
    } else {
      lines.push('| Key | Value |');
      lines.push('|-----|-------|');
      for (const [key, val] of Object.entries(gs).sort()) {
        let display = val;
        if (key === 'authority') {
          try {
            display = algosdk.encodeAddress(Buffer.from(String(val), 'base64'));
          } catch { /* keep raw */ }
        }
        if (key === 'apr') {
          display = `${val} (${aprToPercent(val).toFixed(2)}%)`;
        }
        lines.push(`| ${key} | ${display} |`);
      }
    }
    lines.push('');
  }

  // Per-pool detailed breakdown
  lines.push('## Per-Pool Corrected Audit');
  lines.push('');
  for (const p of poolSummaries) {
    lines.push(`### Pool ${p.appId} — ${p.poolName}`);
    lines.push('');
    lines.push(`- On-chain APR: ${p.onChainApr} (${p.onChainAprPercent.toFixed(2)}%)`);
    lines.push(`- MongoDB APR: ${p.mongoApr}% ${p.aprMismatch ? '**MISMATCH**' : '(matches)'}`);
    lines.push(`- Active stakers: ${p.userCount}`);
    lines.push(`- Users owed delta: ${p.usersOwed}`);
    lines.push(`- Total correct reward: ${(p.totalCorrectReward / 1e6).toFixed(6)} tokens`);
    lines.push(`- Total V1 would pay: ${(p.totalV1WouldPay / 1e6).toFixed(6)} tokens`);
    lines.push(`- Total delta owed: ${(p.totalDeltaOwed / 1e6).toFixed(6)} tokens`);
    lines.push('');

    const poolUsers = allUsers.filter(u => u.poolAppId === p.appId);
    if (poolUsers.length > 0) {
      lines.push('| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |');
      lines.push('|--------|--------|------|---------|---------|---------|----------|-------|');
      for (const u of poolUsers) {
        lines.push(`| ${u.wallet.slice(0, 8)}... | ${(u.stakedAmount / 1e6).toFixed(3)} | ${u.durationDays} | ${(u.correctReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(u.cumulativeClaimed / 1e6).toFixed(3)} | ${(u.alreadyRefunded / 1e6).toFixed(3)} | ${(u.deltaOwed / 1e6).toFixed(3)} |`);
      }
    } else {
      lines.push('*No active stakers.*');
    }
    lines.push('');
  }

  // Top 10
  if (usersOwed.length > 0) {
    lines.push('## Top 10 Largest Deltas Owed');
    lines.push('');
    lines.push('| Wallet | Pool | Delta Owed |');
    lines.push('|--------|------|-----------|');
    const top10 = [...usersOwed].sort((a, b) => b.deltaOwed - a.deltaOwed).slice(0, 10);
    for (const u of top10) {
      lines.push(`| ${u.wallet.slice(0, 12)}... | ${u.poolAppId} (${u.poolName}) | ${(u.deltaOwed / 1e6).toFixed(6)} tokens |`);
    }
    lines.push('');
  }

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
  console.log(`  Investigation report written to: ${REPORT_PATH}`);

  return { totalDeltaOwedMicro, totalCorrectRewardMicro, totalV1WouldPayMicro, usersOwed };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================================');
  console.log('  V1 On-Chain State Investigation + Corrected Audit');
  console.log('  READ-ONLY — no transactions, no state changes');
  console.log('  Pools to check:', V1_POOL_APP_IDS.length);
  console.log('============================================================\n');

  // Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('FATAL: MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  // Load MongoDB pool records
  const mongoRecords = {};
  for (const appId of V1_POOL_APP_IDS) {
    const rec = await Staking.findOne({ stakingContractId: String(appId) });
    mongoRecords[appId] = rec;
    if (!rec) {
      console.log(`  WARNING: Pool ${appId} not found in MongoDB`);
    }
  }
  console.log(`Loaded ${Object.values(mongoRecords).filter(Boolean).length} MongoDB pool records\n`);

  // Load phantom claims manifest
  let phantomRefunds = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const claim of manifest.phantomClaims || []) {
      const key = `${claim.wallet}|${claim.poolAppId}`;
      phantomRefunds[key] = (phantomRefunds[key] || 0) + (claim.feeAmountMicro || 0);
    }
    console.log(`Loaded ${manifest.phantomClaims?.length || 0} phantom claim refunds\n`);
  }

  // Phase 1: Read on-chain global state
  const globalStates = await readGlobalStates(V1_POOL_APP_IDS);

  // Phase 2: Check pool reward balances
  const poolBalances = await checkPoolBalances(V1_POOL_APP_IDS, globalStates);

  // Phase 3 + 4: Read boxes and recalculate
  const { allUsers, poolSummaries } = await readBoxesAndRecalculate(
    V1_POOL_APP_IDS, globalStates, mongoRecords, phantomRefunds
  );

  // Phase 5: Write outputs
  const { totalDeltaOwedMicro, totalCorrectRewardMicro, totalV1WouldPayMicro, usersOwed } =
    writeOutputs(globalStates, poolBalances, allUsers, poolSummaries, mongoRecords);

  // Console summary
  console.log('\n============================================================');
  console.log('  INVESTIGATION SUMMARY');
  console.log('============================================================');
  console.log(`  Total users checked:      ${allUsers.length}`);
  console.log(`  Users owed delta:         ${usersOwed.length}`);
  console.log(`  Total correct reward:     ${(totalCorrectRewardMicro / 1e6).toFixed(6)} tokens`);
  console.log(`  Total V1 would pay:       ${(totalV1WouldPayMicro / 1e6).toFixed(6)} tokens`);
  console.log(`  Total delta owed:         ${(totalDeltaOwedMicro / 1e6).toFixed(6)} tokens`);
  console.log('');
  console.log('  Per-pool breakdown:');
  for (const p of poolSummaries) {
    const mismatchFlag = p.aprMismatch ? ' [APR MISMATCH]' : '';
    const bal = poolBalances[p.appId];
    const canCover = (bal?.rewardBalance ?? 0) >= p.totalV1WouldPay ? 'OK' : 'INSUFFICIENT';
    console.log(`    ${p.appId} (${p.poolName}):` +
      ` APR=${p.onChainApr}(${p.onChainAprPercent.toFixed(1)}%)` +
      ` stakers=${p.userCount}` +
      ` delta=${(p.totalDeltaOwed / 1e6).toFixed(3)}` +
      ` balance=${canCover}${mismatchFlag}`);
  }

  if (usersOwed.length > 0) {
    console.log('\n  Top 5 largest deltas owed:');
    const top5 = [...usersOwed].sort((a, b) => b.deltaOwed - a.deltaOwed).slice(0, 5);
    for (const u of top5) {
      console.log(`    ${u.wallet.slice(0, 12)}... → ${(u.deltaOwed / 1e6).toFixed(6)} tokens (pool ${u.poolAppId})`);
    }
  }

  if (totalDeltaOwedMicro / 1e6 > 50000) {
    console.log('\n  WARNING: Total delta owed exceeds 50,000 tokens — manual review required!');
  }

  // Compare against original MongoDB-based audit total (416,874 FRY)
  console.log('\n  Comparison with original MongoDB-based audit:');
  console.log('    Original audit total (MongoDB APR):  ~416,874 FRY');
  console.log(`    Corrected total (on-chain APR):       ${(totalDeltaOwedMicro / 1e6).toFixed(6)} tokens`);

  await mongoose.disconnect();
  console.log('\n  Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
