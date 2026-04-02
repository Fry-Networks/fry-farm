#!/usr/bin/env node
/**
 * V1 Original APR Recovery + Final Audit — READ-ONLY
 *
 * Recovers the original APR for each V1 pool by finding the first
 * stakeTokens() transaction on-chain. The init_staking() method sets
 * apr = 0; the first stakeTokens call is where APR is first written.
 *
 * Then recalculates the reward audit using:
 *   - correctReward: V2 formula with ORIGINAL APR (first-stake value)
 *   - v1WouldPay:    V1 truncating formula with CURRENT on-chain APR
 *   - deltaOwed:     correctReward - v1WouldPay - claimed - refunded
 *
 * Usage:
 *   MONGODB_URI=$(docker exec fry-farm-backend printenv MONGODB_URI) \
 *   NODE_PATH=./backend/node_modules \
 *   node scripts/v1OriginalAprRecovery.js
 *
 * Output:
 *   scripts/v1_reward_audit_final.json
 *   docs/v1_original_apr_report.md
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const algosdk = require('algosdk');
const mongoose = require('mongoose');

const modelsDir = fs.existsSync(path.join(__dirname, '..', 'models'))
  ? path.join(__dirname, '..', 'models')
  : path.join(__dirname, '..', 'backend', 'models');
const Staking = require(path.join(modelsDir, 'stakingSchema'));

// ── Constants ────────────────────────────────────────────────────────────────

const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const SECONDS_PER_YEAR = 31104000; // 360 * 86400

const V1_POOL_APP_IDS = [
  3465579498, 3468848937, 3469720617, 3470020844, 3473560676,
  3473562061, 3473563847, 3473565258, 3473566323, 3473573376, 3473574550,
];

const CORRECTED_AUDIT_PATH = path.join(__dirname, 'v1_reward_audit_corrected.json');
const MANIFEST_PATH = path.join(__dirname, 'phantom_claims_manifest.json');
const OUTPUT_PATH = path.join(__dirname, 'v1_reward_audit_final.json');
const REPORT_PATH = path.join(__dirname, '..', 'docs', 'v1_original_apr_report.md');

// Compute stakeTokens method selector once
const STAKE_METHOD = algosdk.ABIMethod.fromSignature('stakeTokens(uint64,uint64,axfer,pay)void');
const STAKE_SELECTOR_B64 = Buffer.from(STAKE_METHOD.getSelector()).toString('base64');

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

async function* paginateIndexer(baseUrl, limit = 500) {
  let url = `${baseUrl}&limit=${limit}`;
  while (url) {
    const data = await fetchJson(url);
    if (!data || !data.transactions || data.transactions.length === 0) break;
    yield data.transactions;
    if (data['next-token']) {
      url = `${baseUrl}&limit=${limit}&next=${encodeURIComponent(data['next-token'])}`;
    } else {
      break;
    }
    await sleep(200);
  }
}

function decodeUint64FromB64(b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 8) {
    // Left-pad to 8 bytes
    const padded = Buffer.alloc(8, 0);
    buf.copy(padded, 8 - buf.length);
    return padded.readBigUInt64BE();
  }
  return buf.readBigUInt64BE();
}

function aprToPercent(onChainApr) {
  return Number(onChainApr) / 100;
}

/**
 * Correct reward (V2 formula, no truncation). BigInt math.
 * APR is in on-chain units (percentage * 100, e.g. 50% = 5000).
 */
function calcCorrectReward(staked, apr, duration) {
  if (!apr || !duration || !staked) return 0;
  const s = BigInt(staked);
  const a = BigInt(apr);
  const d = BigInt(duration);
  const divisor = BigInt(10000) * BigInt(SECONDS_PER_YEAR);
  return Number((s * a * d) / divisor);
}

/**
 * V1 buggy formula (truncating intermediate division).
 * Formula: (staked * apr * floor((duration * 100) / SECONDS_PER_YEAR)) / 1000000
 */
function calcV1Reward(staked, apr, duration) {
  if (!apr || !duration || !staked) return 0;
  const intermediate = Math.floor((duration * 100) / SECONDS_PER_YEAR);
  return Math.floor((staked * apr * intermediate) / 1000000);
}

// ── Phase 1+2: Find creation tx + first stakeTokens tx ─────────────────────

async function findOriginalAprs(appIds) {
  console.log('PHASE 1+2: Scanning transaction history for each pool...');
  console.log(`  stakeTokens selector (b64): ${STAKE_SELECTOR_B64}\n`);

  const results = {};

  for (const appId of appIds) {
    console.log(`  [${appId}] Scanning transactions...`);

    let creationTx = null;
    let firstStakeTx = null;
    let txCount = 0;

    const baseUrl = `${INDEXER_BASE}/v2/transactions?application-id=${appId}&tx-type=appl`;

    for await (const txns of paginateIndexer(baseUrl)) {
      for (const txn of txns) {
        txCount++;

        // Check if this is the creation transaction
        if (txn['created-application-index'] === appId) {
          creationTx = txn;
        }

        // Check if this is a stakeTokens call (and the first one)
        if (!firstStakeTx) {
          const args = txn['application-transaction']?.['application-args'] || [];
          if (args.length >= 3 && args[0] === STAKE_SELECTOR_B64) {
            firstStakeTx = txn;
          }
        }

        // Stop once we have both
        if (creationTx && firstStakeTx) break;
      }
      if (creationTx && firstStakeTx) break;
    }

    // Decode creation tx
    let creationParams = null;
    if (creationTx) {
      const args = creationTx['application-transaction']?.['application-args'] || [];
      if (args.length >= 9) {
        creationParams = {
          txId: creationTx.id,
          roundTime: creationTx['round-time'],
          stakeToken: Number(decodeUint64FromB64(args[2])),
          rewardToken: Number(decodeUint64FromB64(args[3])),
          rewardTokenAmount: Number(decodeUint64FromB64(args[4])),
          stakeStartTime: Number(decodeUint64FromB64(args[5])),
          stakeEndTime: Number(decodeUint64FromB64(args[6])),
          lockPeriod: Number(decodeUint64FromB64(args[7])),
          poolTime: Number(decodeUint64FromB64(args[8])),
        };
      }
    }

    // Decode first stakeTokens tx
    let originalApr = null;
    let firstStakeInfo = null;
    if (firstStakeTx) {
      const args = firstStakeTx['application-transaction']?.['application-args'] || [];
      const stakeAmount = Number(decodeUint64FromB64(args[1]));
      const updatedApr = Number(decodeUint64FromB64(args[2]));
      originalApr = updatedApr;
      firstStakeInfo = {
        txId: firstStakeTx.id,
        roundTime: firstStakeTx['round-time'],
        sender: firstStakeTx.sender,
        stakeAmount,
        updatedApr,
      };
    }

    results[appId] = { creationParams, firstStakeInfo, originalApr, txCount };

    const aprStr = originalApr !== null
      ? `${originalApr} (${aprToPercent(originalApr).toFixed(2)}%)`
      : 'NOT FOUND';
    console.log(`    Creation tx: ${creationTx ? 'found' : 'NOT FOUND'}`);
    console.log(`    First stakeTokens: ${firstStakeTx ? 'found' : 'NOT FOUND'}`);
    console.log(`    Original APR: ${aprStr}`);
    console.log(`    Transactions scanned: ${txCount}`);
  }

  return results;
}

// ── Phase 3: Report original APRs ──────────────────────────────────────────

function reportOriginalAprs(recoveryResults, correctedAudit) {
  console.log('\nPHASE 3: Original APR comparison table\n');
  console.log('  App ID       | Pool Name               | Original APR    | Current On-Chain | MongoDB        | Notes');
  console.log('  -------------|-------------------------|-----------------|------------------|----------------|------');

  for (const pool of correctedAudit.pools) {
    const recovery = recoveryResults[pool.appId];
    const origApr = recovery?.originalApr;
    const origStr = origApr !== null && origApr !== undefined
      ? `${origApr} (${aprToPercent(origApr).toFixed(2)}%)`
      : 'N/A';
    const onChainStr = `${pool.onChainApr} (${pool.onChainAprPercent.toFixed(2)}%)`;
    const mongoStr = `${pool.mongoAprAsOnChain} (${pool.mongoApr}%)`;

    let notes = '';
    if (origApr === null || origApr === undefined) {
      notes = 'No stakeTokens tx found';
    } else if (origApr === pool.onChainApr) {
      notes = 'Matches current';
    } else if (origApr < pool.onChainApr) {
      notes = 'Current INFLATED (V1 will overpay)';
    } else {
      notes = 'Current DEFLATED (V1 will underpay)';
    }

    console.log(`  ${String(pool.appId).padEnd(13)}| ${pool.poolName.padEnd(24)}| ${origStr.padEnd(16)}| ${onChainStr.padEnd(17)}| ${mongoStr.padEnd(15)}| ${notes}`);
  }
}

// ── Phase 4: Recalculate audit ──────────────────────────────────────────────

function recalculateAudit(correctedAudit, recoveryResults, phantomRefunds) {
  console.log('\nPHASE 4: Recalculating audit with original APRs...\n');
  const now = Math.floor(Date.now() / 1000);

  const allUsers = [];
  const poolSummaries = [];

  for (const pool of correctedAudit.pools) {
    const recovery = recoveryResults[pool.appId];
    const originalApr = recovery?.originalApr ?? 0;
    const currentOnChainApr = pool.onChainApr;

    const poolUsers = correctedAudit.users.filter(u => u.poolAppId === pool.appId);

    let totalCorrectReward = 0;
    let totalV1WouldPay = 0;
    let totalDelta = 0;
    let usersOwedPositive = 0;
    let usersOverpaid = 0;

    for (const u of poolUsers) {
      // Recompute duration from current time (audit data has stakeTime)
      const duration = now - u.stakeTime;

      // Correct reward: what user SHOULD earn (original APR, V2 formula)
      const correctReward = calcCorrectReward(u.stakedAmount, originalApr, duration);

      // V1 would pay: what contract WILL pay at unstake (current corrupted APR, V1 formula)
      const v1WouldPay = calcV1Reward(u.stakedAmount, currentOnChainApr, duration);

      // Phantom refund deduction
      const phantomKey = `${u.wallet}|${u.poolAppId}`;
      const alreadyRefunded = phantomRefunds[phantomKey] || 0;

      // Delta: positive = treasury owes user, negative = V1 overpays
      const delta = correctReward - v1WouldPay - u.cumulativeClaimed - alreadyRefunded;

      totalCorrectReward += correctReward;
      totalV1WouldPay += v1WouldPay;
      totalDelta += delta;
      if (delta > 0) usersOwedPositive++;
      if (delta < 0) usersOverpaid++;

      allUsers.push({
        wallet: u.wallet,
        poolAppId: u.poolAppId,
        poolName: u.poolName,
        stakedAmount: u.stakedAmount,
        stakeTime: u.stakeTime,
        stakeTimeISO: u.stakeTimeISO,
        durationDays: Math.round(duration / 86400 * 10) / 10,
        originalApr,
        originalAprPercent: aprToPercent(originalApr),
        currentOnChainApr,
        currentOnChainAprPercent: aprToPercent(currentOnChainApr),
        correctReward,
        v1WouldPay,
        cumulativeClaimed: u.cumulativeClaimed,
        pendingReward: u.pendingReward,
        alreadyRefunded,
        delta,
      });
    }

    console.log(`  [${pool.appId}] ${pool.poolName}: origAPR=${originalApr}(${aprToPercent(originalApr).toFixed(1)}%) ` +
      `correct=${(totalCorrectReward / 1e6).toFixed(3)} v1pays=${(totalV1WouldPay / 1e6).toFixed(3)} ` +
      `delta=${(totalDelta / 1e6).toFixed(3)} (+${usersOwedPositive}/-${usersOverpaid})`);

    poolSummaries.push({
      appId: pool.appId,
      poolName: pool.poolName,
      originalApr,
      originalAprPercent: aprToPercent(originalApr),
      currentOnChainApr,
      currentOnChainAprPercent: aprToPercent(currentOnChainApr),
      mongoApr: pool.mongoApr,
      rewardTokenId: pool.rewardTokenId,
      poolBalance: pool.poolBalance,
      poolAddress: pool.poolAddress,
      userCount: poolUsers.length,
      usersOwedPositive,
      usersOverpaid,
      totalCorrectReward,
      totalV1WouldPay,
      totalDelta,
      canCoverV1Payouts: pool.poolBalance >= totalV1WouldPay,
      creationTxId: recovery?.creationParams?.txId ?? null,
      firstStakeTxId: recovery?.firstStakeInfo?.txId ?? null,
      firstStaker: recovery?.firstStakeInfo?.sender ?? null,
    });
  }

  return { allUsers, poolSummaries };
}

// ── Phase 5: Write outputs ──────────────────────────────────────────────────

function writeOutputs(allUsers, poolSummaries, recoveryResults) {
  console.log('\nPHASE 5: Writing final audit and report...\n');

  const positiveDeltas = allUsers.filter(u => u.delta > 0);
  const negativeDeltas = allUsers.filter(u => u.delta < 0);
  const netTreasuryObligation = positiveDeltas.reduce((sum, u) => sum + u.delta, 0);
  const totalOverpayment = negativeDeltas.reduce((sum, u) => sum + Math.abs(u.delta), 0);
  const totalCorrectReward = allUsers.reduce((sum, u) => sum + u.correctReward, 0);
  const totalV1WouldPay = allUsers.reduce((sum, u) => sum + u.v1WouldPay, 0);
  const netDelta = allUsers.reduce((sum, u) => sum + u.delta, 0);

  // ── JSON output ──
  const auditOutput = {
    generatedAt: new Date().toISOString(),
    note: 'Final audit using ORIGINAL APRs from first stakeTokens tx (not corrupted on-chain or MongoDB values)',
    totalUsers: allUsers.length,
    usersOwedPositive: positiveDeltas.length,
    usersOverpaid: negativeDeltas.length,
    totalCorrectRewardMicro: totalCorrectReward,
    totalV1WouldPayMicro: totalV1WouldPay,
    netDeltaMicro: netDelta,
    netTreasuryObligationMicro: netTreasuryObligation,
    netTreasuryObligationHuman: Math.round(netTreasuryObligation / 1e6 * 1e6) / 1e6,
    totalOverpaymentMicro: totalOverpayment,
    totalOverpaymentHuman: Math.round(totalOverpayment / 1e6 * 1e6) / 1e6,
    pools: poolSummaries,
    users: allUsers,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(auditOutput, null, 2));
  console.log(`  Final audit written to: ${OUTPUT_PATH}`);

  // ── Markdown report ──
  const lines = [];
  lines.push('# V1 Original APR Recovery Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## How Original APRs Were Recovered');
  lines.push('');
  lines.push('`init_staking()` does NOT accept APR — it initializes `apr = 0`. APR is first');
  lines.push('set by the `updated_apr` argument of the first `stakeTokens()` call for each pool.');
  lines.push('The frontend dynamically recalculates `updated_apr` on every stake/unstake/claim,');
  lines.push('corrupting the on-chain value. This script finds the first stakeTokens transaction');
  lines.push('per pool and extracts its `updated_apr` as the original APR.');
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total pools | ${poolSummaries.length} |`);
  lines.push(`| Total active stakers | ${allUsers.length} |`);
  lines.push(`| Users owed (positive delta) | ${positiveDeltas.length} |`);
  lines.push(`| Users overpaid (negative delta) | ${negativeDeltas.length} |`);
  lines.push(`| Total correct reward (original APR) | ${(totalCorrectReward / 1e6).toFixed(6)} tokens |`);
  lines.push(`| Total V1 would pay (current APR) | ${(totalV1WouldPay / 1e6).toFixed(6)} tokens |`);
  lines.push(`| Net delta (all users) | ${(netDelta / 1e6).toFixed(6)} tokens |`);
  lines.push(`| **Net treasury obligation** | **${(netTreasuryObligation / 1e6).toFixed(6)} tokens** |`);
  lines.push(`| Total V1 overpayment | ${(totalOverpayment / 1e6).toFixed(6)} tokens |`);
  lines.push('');

  // Original APR table
  lines.push('## Original APR Table');
  lines.push('');
  lines.push('| App ID | Pool | Original APR | Current On-Chain | MongoDB | Status |');
  lines.push('|--------|------|-------------|-----------------|---------|--------|');
  for (const p of poolSummaries) {
    const origStr = p.originalApr ? `${p.originalApr} (${p.originalAprPercent.toFixed(2)}%)` : 'N/A';
    const onChainStr = `${p.currentOnChainApr} (${p.currentOnChainAprPercent.toFixed(2)}%)`;
    const mongoStr = `${Math.round(p.mongoApr * 100)} (${p.mongoApr}%)`;
    let status;
    if (!p.originalApr) status = 'No stakes';
    else if (p.originalApr === p.currentOnChainApr) status = 'Unchanged';
    else if (p.originalApr < p.currentOnChainApr) status = 'INFLATED';
    else status = 'DEFLATED';
    lines.push(`| ${p.appId} | ${p.poolName} | ${origStr} | ${onChainStr} | ${mongoStr} | ${status} |`);
  }
  lines.push('');

  // Creation transaction details
  lines.push('## Creation Transaction Details');
  lines.push('');
  for (const p of poolSummaries) {
    const r = recoveryResults[p.appId];
    lines.push(`### Pool ${p.appId} — ${p.poolName}`);
    lines.push('');
    if (r?.creationParams) {
      const cp = r.creationParams;
      lines.push(`- Creation TX: \`${cp.txId}\``);
      lines.push(`- Created: ${new Date(cp.roundTime * 1000).toISOString()}`);
      lines.push(`- Reward token amount (creation): ${cp.rewardTokenAmount} (${(cp.rewardTokenAmount / 1e6).toFixed(3)} tokens)`);
      lines.push(`- Pool time: ${cp.poolTime}s (${Math.round(cp.poolTime / 86400)}d)`);
      lines.push(`- Lock period: ${cp.lockPeriod}s (${Math.round(cp.lockPeriod / 86400)}d)`);
    } else {
      lines.push('- Creation transaction not found');
    }
    if (r?.firstStakeInfo) {
      const fs = r.firstStakeInfo;
      lines.push(`- First stake TX: \`${fs.txId}\``);
      lines.push(`- First staker: ${fs.sender}`);
      lines.push(`- First stake time: ${new Date(fs.roundTime * 1000).toISOString()}`);
      lines.push(`- First stake amount: ${fs.stakeAmount} (${(fs.stakeAmount / 1e6).toFixed(3)} tokens)`);
      lines.push(`- Original APR set: ${fs.updatedApr} (${aprToPercent(fs.updatedApr).toFixed(2)}%)`);
    } else {
      lines.push('- No stakeTokens transaction found (pool never had stakers)');
    }
    lines.push('');
  }

  // Per-pool audit breakdown
  lines.push('## Per-Pool Audit Breakdown');
  lines.push('');
  for (const p of poolSummaries) {
    lines.push(`### Pool ${p.appId} — ${p.poolName}`);
    lines.push('');
    lines.push(`- Original APR: ${p.originalApr} (${p.originalAprPercent.toFixed(2)}%)`);
    lines.push(`- Current on-chain APR: ${p.currentOnChainApr} (${p.currentOnChainAprPercent.toFixed(2)}%)`);
    lines.push(`- Active stakers: ${p.userCount}`);
    lines.push(`- Users owed: ${p.usersOwedPositive}, Users overpaid: ${p.usersOverpaid}`);
    lines.push(`- Total correct reward: ${(p.totalCorrectReward / 1e6).toFixed(6)} tokens`);
    lines.push(`- Total V1 would pay: ${(p.totalV1WouldPay / 1e6).toFixed(6)} tokens`);
    lines.push(`- Pool delta: ${(p.totalDelta / 1e6).toFixed(6)} tokens`);
    lines.push(`- Pool balance: ${(p.poolBalance / 1e6).toFixed(3)} | Can cover V1: ${p.canCoverV1Payouts ? 'YES' : 'NO'}`);
    lines.push('');

    const poolUsers = allUsers.filter(u => u.poolAppId === p.appId);
    if (poolUsers.length > 0) {
      lines.push('| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |');
      lines.push('|--------|--------|------|---------|---------|---------|----------|-------|');
      for (const u of poolUsers) {
        const deltaStr = u.delta >= 0 ? (u.delta / 1e6).toFixed(3) : `-${(Math.abs(u.delta) / 1e6).toFixed(3)}`;
        lines.push(`| ${u.wallet.slice(0, 8)}... | ${(u.stakedAmount / 1e6).toFixed(3)} | ${u.durationDays} | ${(u.correctReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(u.cumulativeClaimed / 1e6).toFixed(3)} | ${(u.alreadyRefunded / 1e6).toFixed(3)} | ${deltaStr} |`);
      }
    } else {
      lines.push('*No active stakers.*');
    }
    lines.push('');
  }

  // Top 20 positive deltas
  if (positiveDeltas.length > 0) {
    lines.push('## Top 20 Largest Treasury Obligations (Positive Deltas)');
    lines.push('');
    lines.push('| Wallet | Pool | Correct Reward | V1 Pays | Delta Owed |');
    lines.push('|--------|------|---------------|---------|-----------|');
    const top20 = [...positiveDeltas].sort((a, b) => b.delta - a.delta).slice(0, 20);
    for (const u of top20) {
      lines.push(`| ${u.wallet.slice(0, 12)}... | ${u.poolAppId} (${u.poolName}) | ${(u.correctReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(u.delta / 1e6).toFixed(6)} |`);
    }
    lines.push('');
  }

  // Overpayment summary
  if (negativeDeltas.length > 0) {
    lines.push('## Overpayment Summary (Negative Deltas — V1 Pays More Than Owed)');
    lines.push('');
    lines.push('These users will receive MORE from V1 unstake than they are owed under the original APR.');
    lines.push('No airdrop needed for these users.');
    lines.push('');
    lines.push('| Wallet | Pool | Correct Reward | V1 Pays | Overpayment |');
    lines.push('|--------|------|---------------|---------|-------------|');
    const overpaid = [...negativeDeltas].sort((a, b) => a.delta - b.delta).slice(0, 20);
    for (const u of overpaid) {
      lines.push(`| ${u.wallet.slice(0, 12)}... | ${u.poolAppId} (${u.poolName}) | ${(u.correctReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(Math.abs(u.delta) / 1e6).toFixed(6)} |`);
    }
    lines.push('');
  }

  // Comparison with previous audits
  lines.push('## Comparison Across Audit Iterations');
  lines.push('');
  lines.push('| Audit | APR Source | Total Owed |');
  lines.push('|-------|-----------|-----------|');
  lines.push('| v1RewardAudit (original) | MongoDB | ~416,874 FRY |');
  lines.push(`| v1OnChainInvestigation | Current on-chain | ${(202830.137415).toFixed(3)} tokens |`);
  lines.push(`| **v1OriginalAprRecovery** | **First stakeTokens tx** | **${(netTreasuryObligation / 1e6).toFixed(6)} tokens** |`);
  lines.push('');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
  console.log(`  Report written to: ${REPORT_PATH}`);

  return { netTreasuryObligation, totalOverpayment, totalCorrectReward, totalV1WouldPay, netDelta, positiveDeltas, negativeDeltas };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================================');
  console.log('  V1 Original APR Recovery + Final Audit — READ-ONLY');
  console.log('  Pools:', V1_POOL_APP_IDS.length);
  console.log('============================================================\n');

  // Load corrected audit (for existing box data)
  if (!fs.existsSync(CORRECTED_AUDIT_PATH)) {
    console.error(`FATAL: Corrected audit not found at ${CORRECTED_AUDIT_PATH}`);
    console.error('Run v1OnChainInvestigation.js first.');
    process.exit(1);
  }
  const correctedAudit = JSON.parse(fs.readFileSync(CORRECTED_AUDIT_PATH, 'utf8'));
  console.log(`Loaded corrected audit: ${correctedAudit.totalUsers} users across ${correctedAudit.pools.length} pools\n`);

  // Load phantom refunds
  let phantomRefunds = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    for (const claim of manifest.phantomClaims || []) {
      const key = `${claim.wallet}|${claim.poolAppId}`;
      phantomRefunds[key] = (phantomRefunds[key] || 0) + (claim.feeAmountMicro || 0);
    }
    console.log(`Loaded ${manifest.phantomClaims?.length || 0} phantom claim refunds\n`);
  }

  // Connect to MongoDB (for pool name lookup only)
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB\n');
  }

  // Phase 1+2: Find original APRs from first stakeTokens transactions
  const recoveryResults = await findOriginalAprs(V1_POOL_APP_IDS);

  // Phase 3: Report
  reportOriginalAprs(recoveryResults, correctedAudit);

  // Phase 4: Recalculate
  const { allUsers, poolSummaries } = recalculateAudit(correctedAudit, recoveryResults, phantomRefunds);

  // Phase 5: Write
  const summary = writeOutputs(allUsers, poolSummaries, recoveryResults);

  // Console summary
  console.log('\n============================================================');
  console.log('  FINAL AUDIT SUMMARY');
  console.log('============================================================');
  console.log(`  Total users:              ${allUsers.length}`);
  console.log(`  Users owed (delta > 0):   ${summary.positiveDeltas.length}`);
  console.log(`  Users overpaid (delta<0): ${summary.negativeDeltas.length}`);
  console.log(`  Total correct reward:     ${(summary.totalCorrectReward / 1e6).toFixed(6)} tokens`);
  console.log(`  Total V1 would pay:       ${(summary.totalV1WouldPay / 1e6).toFixed(6)} tokens`);
  console.log(`  Net delta (all):          ${(summary.netDelta / 1e6).toFixed(6)} tokens`);
  console.log(`  Net treasury obligation:  ${(summary.netTreasuryObligation / 1e6).toFixed(6)} tokens`);
  console.log(`  Total V1 overpayment:     ${(summary.totalOverpayment / 1e6).toFixed(6)} tokens`);

  console.log('\n  Per-pool:');
  for (const p of poolSummaries) {
    const deltaSign = p.totalDelta >= 0 ? '+' : '';
    console.log(`    ${p.appId} (${p.poolName}): origAPR=${p.originalApr}(${p.originalAprPercent.toFixed(1)}%) ` +
      `delta=${deltaSign}${(p.totalDelta / 1e6).toFixed(3)} owed=${p.usersOwedPositive} overpaid=${p.usersOverpaid}`);
  }

  if (summary.positiveDeltas.length > 0) {
    console.log('\n  Top 5 treasury obligations:');
    const top5 = [...summary.positiveDeltas].sort((a, b) => b.delta - a.delta).slice(0, 5);
    for (const u of top5) {
      console.log(`    ${u.wallet.slice(0, 12)}... -> ${(u.delta / 1e6).toFixed(6)} tokens (pool ${u.poolAppId})`);
    }
  }

  console.log('\n  Audit progression:');
  console.log('    MongoDB APR audit:     ~416,874 FRY');
  console.log('    On-chain APR audit:     202,830 tokens');
  console.log(`    Original APR audit:     ${(summary.netTreasuryObligation / 1e6).toFixed(6)} tokens`);

  if (uri) await mongoose.disconnect();
  console.log('\n  Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
