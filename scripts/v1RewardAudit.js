#!/usr/bin/env node
/**
 * V1 Legacy Reward Audit — READ-ONLY
 *
 * Calculates unclaimed rewards owed to V1 staking pool users whose rewards
 * were truncated to 0 by the V1 integer division bug.
 *
 * V1 formula (buggy): (staked * apr * ((duration * 100) / 31104000)) / 1000000
 *   → truncates to 0 when duration < 311,040 seconds (~3.6 days)
 *
 * Correct formula: staked * (aprRate / 100) * duration / 31104000
 *   → no truncation (float math in JS, 128-bit math on-chain in V2)
 *
 * Usage:
 *   node scripts/v1RewardAudit.js               # run audit
 *   docker exec fry-farm-backend node /app/scripts/v1RewardAudit.js   # inside container
 *
 * Output: scripts/v1_reward_audit.json
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const mongoose = require('mongoose');

// Resolve models — works both inside container and on host
const modelsDir = fs.existsSync(path.join(__dirname, '..', 'models'))
  ? path.join(__dirname, '..', 'models')
  : path.join(__dirname, '..', 'backend', 'models');

const Staking = require(path.join(modelsDir, 'stakingSchema'));

// ── Constants ────────────────────────────────────────────────────────────────

const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const SECONDS_PER_YEAR = 31104000; // 360 * 86400

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

// Phantom claims already refunded — subtract from owed amounts
const MANIFEST_PATH = path.join(__dirname, 'phantom_claims_manifest.json');
const OUTPUT_PATH = path.join(__dirname, 'v1_reward_audit.json');

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
  // Decode big-endian uint64 from buffer
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value = (value << BigInt(8)) | BigInt(buffer[offset + i]);
  }
  return Number(value);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================================');
  console.log('  V1 Legacy Reward Audit — READ-ONLY');
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

  // Load phantom claims manifest for deduction
  let phantomRefunds = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const claim of manifest.phantomClaims || []) {
      const key = `${claim.wallet}|${claim.poolAppId}`;
      phantomRefunds[key] = (phantomRefunds[key] || 0) + (claim.feeAmountMicro || 0);
    }
    console.log(`Loaded ${manifest.phantomClaims?.length || 0} phantom claim refunds\n`);
  }

  const allUsers = [];
  const poolSummaries = [];

  for (const appId of V1_POOL_APP_IDS) {
    console.log(`--- Pool ${appId} ---`);

    // Get pool APR from MongoDB
    const poolRecord = await Staking.findOne({ stakingContractId: String(appId) });
    const aprRate = poolRecord?.aprRate || 0;
    const poolName = poolRecord
      ? `${poolRecord.stakeToken?.name || '?'} → ${poolRecord.rewardToken?.name || '?'}`
      : 'Unknown';
    console.log(`  Name: ${poolName}, APR: ${aprRate}%`);

    if (!aprRate) {
      console.log('  [skip] No APR configured — cannot calculate rewards');
      poolSummaries.push({ appId, poolName, apr: 0, userCount: 0, totalOwed: 0, note: 'No APR' });
      continue;
    }

    // Read all boxes from Indexer
    let boxes = [];
    try {
      const boxesResp = await fetchJson(`${INDEXER_BASE}/v2/applications/${appId}/boxes?limit=100`);
      boxes = boxesResp?.boxes || [];
    } catch (err) {
      console.log(`  [error] Cannot read boxes: ${err.message}`);
      poolSummaries.push({ appId, poolName, apr: aprRate, userCount: 0, totalOwed: 0, note: `Error: ${err.message}` });
      await sleep(200);
      continue;
    }

    console.log(`  Boxes found: ${boxes.length}`);
    let poolTotalOwed = 0;
    let poolUserCount = 0;

    for (const box of boxes) {
      await sleep(200); // Rate limit

      // Read box value
      const nameB64 = box.name;
      let boxData;
      try {
        const boxResp = await fetchJson(`${INDEXER_BASE}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(nameB64)}`);
        if (!boxResp || !boxResp.value) continue;
        boxData = Buffer.from(boxResp.value, 'base64');
      } catch (err) {
        console.log(`    [error] Box read failed: ${err.message}`);
        continue;
      }

      if (boxData.length < 32) continue;

      // Decode box fields
      const stakedAmount = decodeUint64(boxData, 0);
      const stakeTime = decodeUint64(boxData, 8);
      const pendingReward = decodeUint64(boxData, 16);
      const cumulativeClaimed = decodeUint64(boxData, 24);

      // Decode wallet address from box name (32-byte public key)
      const nameBytes = Buffer.from(nameB64, 'base64');
      let wallet = '';
      try {
        // algosdk-compatible address encoding
        const algosdk = require('algosdk');
        wallet = algosdk.encodeAddress(nameBytes);
      } catch {
        wallet = nameBytes.toString('hex').slice(0, 16) + '...';
      }

      if (stakedAmount === 0) continue; // No stake, no reward owed

      // Calculate correct reward (no truncation)
      const now = Math.floor(Date.now() / 1000);
      const duration = now - stakeTime;
      const correctReward = Math.floor(stakedAmount * (aprRate / 100) * duration / SECONDS_PER_YEAR);

      // What the V1 contract would have calculated (with truncation)
      const v1Intermediate = Math.floor((duration * 100) / SECONDS_PER_YEAR);
      const v1Reward = Math.floor((stakedAmount * Math.floor(aprRate * 100) * v1Intermediate) / 1000000);

      // Amount owed = correct reward - already claimed - phantom refunds
      const phantomKey = `${wallet}|${appId}`;
      const alreadyRefunded = phantomRefunds[phantomKey] || 0;
      const amountOwed = Math.max(0, correctReward - cumulativeClaimed - alreadyRefunded);

      if (amountOwed > 0) {
        poolTotalOwed += amountOwed;
        poolUserCount++;
      }

      allUsers.push({
        wallet,
        poolAppId: appId,
        poolName,
        stakedAmount,
        stakeTime,
        durationDays: Math.round(duration / 86400 * 10) / 10,
        correctReward,
        v1Reward,
        cumulativeClaimed,
        pendingReward,
        alreadyRefunded,
        amountOwed,
      });
    }

    console.log(`  Users with stake: ${boxes.length}, Users owed: ${poolUserCount}, Total owed: ${(poolTotalOwed / 1e6).toFixed(3)} FRY`);
    poolSummaries.push({ appId, poolName, apr: aprRate, userCount: poolUserCount, totalOwed: poolTotalOwed });
  }

  // Summary
  const usersOwed = allUsers.filter(u => u.amountOwed > 0);
  const totalOwedMicro = usersOwed.reduce((sum, u) => sum + u.amountOwed, 0);
  const totalOwedFry = totalOwedMicro / 1e6;

  console.log('\n============================================================');
  console.log('  AUDIT SUMMARY');
  console.log('============================================================');
  console.log(`  Total users checked: ${allUsers.length}`);
  console.log(`  Users owed rewards:  ${usersOwed.length}`);
  console.log(`  Total FRY owed:      ${totalOwedFry.toFixed(6)} FRY (${totalOwedMicro} micro)`);
  console.log('\n  Per-pool breakdown:');
  for (const p of poolSummaries) {
    console.log(`    ${p.appId} (${p.poolName}): ${p.userCount} users, ${(p.totalOwed / 1e6).toFixed(3)} FRY${p.note ? ` [${p.note}]` : ''}`);
  }

  if (usersOwed.length > 0) {
    console.log('\n  Top 10 largest amounts owed:');
    const top10 = [...usersOwed].sort((a, b) => b.amountOwed - a.amountOwed).slice(0, 10);
    for (const u of top10) {
      console.log(`    ${u.wallet.slice(0, 12)}... → ${(u.amountOwed / 1e6).toFixed(6)} FRY (pool ${u.poolAppId})`);
    }
  }

  // Sanity check
  if (totalOwedFry > 50000) {
    console.log('\n  ⚠️  WARNING: Total owed exceeds 50,000 FRY — manual review required!');
  }

  // Write output
  const output = {
    generatedAt: new Date().toISOString(),
    totalUsers: allUsers.length,
    usersOwed: usersOwed.length,
    totalOwedMicro,
    totalOwedFry: Math.round(totalOwedFry * 1e6) / 1e6,
    currency: 'FRY',
    asaId: 2485314946,
    pools: poolSummaries,
    users: allUsers,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n  Output written to: ${OUTPUT_PATH}`);

  await mongoose.disconnect();
  console.log('  Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
