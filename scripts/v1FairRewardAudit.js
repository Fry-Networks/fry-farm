#!/usr/bin/env node
/**
 * V1 Fair Reward Audit — Epoch-Based Proportional Share — READ-ONLY
 *
 * Calculates fair V1 legacy rewards using time-weighted proportional share
 * of each pool's funded reward tokens. No APR needed.
 *
 * Each pool was funded with X reward tokens for Y duration. Each user gets
 * their proportional share based on their stake size and actual time in pool.
 * Epoch boundaries are created at each stake/unstake event.
 *
 * Usage:
 *   MONGODB_URI=$(docker exec fry-farm-backend printenv MONGODB_URI) \
 *   NODE_PATH=./backend/node_modules \
 *   node scripts/v1FairRewardAudit.js
 *
 * Output:
 *   scripts/v1_reward_audit_final.json
 *   docs/v1_fair_reward_report.md
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const algosdk = require('algosdk');

// ── Constants ────────────────────────────────────────────────────────────────

const INDEXER_BASE = 'https://mainnet-idx.4160.nodely.dev';
const SECONDS_PER_YEAR = 31104000; // 360 * 86400

const V1_POOL_APP_IDS = [
  3465579498, 3468848937, 3469720617, 3470020844, 3473560676,
  3473562061, 3473563847, 3473565258, 3473566323, 3473573376, 3473574550,
];

// Pool parameters from on-chain global state (from v1_pool_investigation_report)
const POOL_PARAMS = {
  3465579498: { rewardTokenAmount: 199048784, stakeStartTime: 1772431200, stakeEndTime: 1772863200 },
  3468848937: { rewardTokenAmount: 4137066438, stakeStartTime: 1772838000, stakeEndTime: 1773442800 },
  3469720617: { rewardTokenAmount: 15937199060000, stakeStartTime: 1772863200, stakeEndTime: 1804399200 },
  3470020844: { rewardTokenAmount: 4638411400, stakeStartTime: 1772838000, stakeEndTime: 1774047600 },
  3473560676: { rewardTokenAmount: 7022700760000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
  3473562061: { rewardTokenAmount: 127394850000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
  3473563847: { rewardTokenAmount: 6221249420000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
  3473565258: { rewardTokenAmount: 3514401980000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
  3473566323: { rewardTokenAmount: 63693580000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
  3473573376: { rewardTokenAmount: 3113835420000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
  3473574550: { rewardTokenAmount: 1757501600000, stakeStartTime: 1773118800, stakeEndTime: 1804654800 },
};

const CORRECTED_AUDIT_PATH = path.join(__dirname, 'v1_reward_audit_corrected.json');
const MANIFEST_PATH = path.join(__dirname, 'phantom_claims_manifest.json');
const OUTPUT_PATH = path.join(__dirname, 'v1_reward_audit_final.json');
const REPORT_PATH = path.join(__dirname, '..', 'docs', 'v1_fair_reward_report.md');

// Method selectors
const STAKE_SELECTOR_B64 = Buffer.from(
  algosdk.ABIMethod.fromSignature('stakeTokens(uint64,uint64,axfer,pay)void').getSelector()
).toString('base64');

const UNSTAKE_SELECTOR_B64 = Buffer.from(
  algosdk.ABIMethod.fromSignature('unstakeTokens(uint64,uint64)void').getSelector()
).toString('base64');

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
    const padded = Buffer.alloc(8, 0);
    buf.copy(padded, 8 - buf.length);
    return Number(padded.readBigUInt64BE());
  }
  return Number(buf.readBigUInt64BE());
}

/**
 * V1 buggy reward formula (truncating intermediate division).
 * Used to estimate what V1 will pay current stakers at unstake time.
 */
function calcV1Reward(staked, apr, duration) {
  if (!apr || !duration || !staked) return 0;
  const intermediate = Math.floor((duration * 100) / SECONDS_PER_YEAR);
  return Math.floor((staked * apr * intermediate) / 1000000);
}

// ── Phase 1: Gather historical events ───────────────────────────────────────

async function gatherEvents(appIds) {
  console.log('PHASE 1: Gathering historical stake/unstake events...');
  console.log(`  stakeTokens selector: ${STAKE_SELECTOR_B64}`);
  console.log(`  unstakeTokens selector: ${UNSTAKE_SELECTOR_B64}\n`);

  const allPoolEvents = {};

  for (const appId of appIds) {
    const events = [];
    let txCount = 0;

    const baseUrl = `${INDEXER_BASE}/v2/transactions?application-id=${appId}&tx-type=appl`;

    for await (const txns of paginateIndexer(baseUrl)) {
      for (const txn of txns) {
        txCount++;
        const args = txn['application-transaction']?.['application-args'] || [];
        if (args.length < 2) continue;

        const selector = args[0];
        const timestamp = txn['round-time'];
        const sender = txn.sender;

        if (selector === STAKE_SELECTOR_B64) {
          const amount = decodeUint64FromB64(args[1]);
          events.push({ type: 'stake', user: sender, amount, time: timestamp, txId: txn.id });
        } else if (selector === UNSTAKE_SELECTOR_B64) {
          const amount = decodeUint64FromB64(args[1]);
          events.push({ type: 'unstake', user: sender, amount, time: timestamp, txId: txn.id });
        }
      }
    }

    // Sort chronologically
    events.sort((a, b) => a.time - b.time);
    allPoolEvents[appId] = events;

    const stakes = events.filter(e => e.type === 'stake').length;
    const unstakes = events.filter(e => e.type === 'unstake').length;
    const uniqueUsers = new Set(events.map(e => e.user)).size;
    console.log(`  [${appId}] ${txCount} txs scanned, ${stakes} stakes, ${unstakes} unstakes, ${uniqueUsers} unique users`);
  }

  return allPoolEvents;
}

// ── Phase 2: Epoch-based reward calculation ─────────────────────────────────

function calculateFairRewards(appId, events, poolParams) {
  const { rewardTokenAmount, stakeStartTime, stakeEndTime } = poolParams;
  const poolDuration = stakeEndTime - stakeStartTime;
  if (poolDuration <= 0) return { userRewards: {}, epochs: [], totalDistributed: 0 };

  const now = Math.floor(Date.now() / 1000);
  const effectiveEnd = Math.min(now, stakeEndTime);

  // Track user balances and rewards
  const userBalances = {}; // wallet -> current stake amount
  const userRewards = {};  // wallet -> cumulative fair reward (micro-units)
  let totalStaked = 0;

  // Build epoch boundaries from events
  // Only consider events within the pool's active period
  const relevantEvents = events.filter(e => e.time <= effectiveEnd);

  const epochs = [];
  let epochStart = stakeStartTime;

  for (const event of relevantEvents) {
    // Close current epoch
    const epochEnd = Math.max(epochStart, Math.min(event.time, effectiveEnd));
    const epochDuration = epochEnd - epochStart;

    if (epochDuration > 0 && totalStaked > 0) {
      const epochReward = (rewardTokenAmount * epochDuration) / poolDuration;

      // Distribute proportionally
      for (const [wallet, balance] of Object.entries(userBalances)) {
        if (balance > 0) {
          const share = (epochReward * balance) / totalStaked;
          userRewards[wallet] = (userRewards[wallet] || 0) + share;
        }
      }

      epochs.push({ start: epochStart, end: epochEnd, duration: epochDuration, totalStaked, stakerCount: Object.values(userBalances).filter(b => b > 0).length });
    }

    // Apply event
    if (event.type === 'stake') {
      userBalances[event.user] = (userBalances[event.user] || 0) + event.amount;
      totalStaked += event.amount;
    } else if (event.type === 'unstake') {
      userBalances[event.user] = (userBalances[event.user] || 0) - event.amount;
      if (userBalances[event.user] < 0) userBalances[event.user] = 0;
      totalStaked -= event.amount;
      if (totalStaked < 0) totalStaked = 0;
    }

    epochStart = epochEnd;
  }

  // Final epoch: from last event to effective end
  if (epochStart < effectiveEnd && totalStaked > 0) {
    const epochDuration = effectiveEnd - epochStart;
    const epochReward = (rewardTokenAmount * epochDuration) / poolDuration;

    for (const [wallet, balance] of Object.entries(userBalances)) {
      if (balance > 0) {
        const share = (epochReward * balance) / totalStaked;
        userRewards[wallet] = (userRewards[wallet] || 0) + share;
      }
    }

    epochs.push({ start: epochStart, end: effectiveEnd, duration: epochDuration, totalStaked, stakerCount: Object.values(userBalances).filter(b => b > 0).length });
  }

  // Floor all rewards to micro-units
  const flooredRewards = {};
  let totalDistributed = 0;
  for (const [wallet, reward] of Object.entries(userRewards)) {
    const floored = Math.floor(reward);
    if (floored > 0) {
      flooredRewards[wallet] = floored;
      totalDistributed += floored;
    }
  }

  return { userRewards: flooredRewards, epochs, totalDistributed, userBalances };
}

// ── Phase 3: Calculate deltas ───────────────────────────────────────────────

function calculateDeltas(allPoolRewards, allPoolEvents, correctedAudit, phantomRefunds) {
  console.log('\nPHASE 3: Calculating deltas...\n');
  const now = Math.floor(Date.now() / 1000);

  const allUsers = [];
  const poolSummaries = [];

  // Build set of current stakers (from corrected audit box data)
  const currentStakers = new Set();
  for (const u of correctedAudit.users) {
    currentStakers.add(`${u.wallet}|${u.poolAppId}`);
  }

  // Build map of current staker data
  const currentStakerData = {};
  for (const u of correctedAudit.users) {
    currentStakerData[`${u.wallet}|${u.poolAppId}`] = u;
  }

  for (const pool of correctedAudit.pools) {
    const appId = pool.appId;
    const { userRewards, epochs, totalDistributed, userBalances } = allPoolRewards[appId];
    const events = allPoolEvents[appId];
    const poolParams = POOL_PARAMS[appId];

    // Identify all users who ever participated
    const allWallets = new Set([
      ...Object.keys(userRewards),
      ...events.map(e => e.user),
    ]);

    let poolTotalFairReward = 0;
    let poolTotalV1WouldPay = 0;
    let poolTotalDelta = 0;
    let poolPositiveDeltas = 0;
    let poolNegativeDeltas = 0;
    let poolCurrentStakers = 0;
    let poolMigratedUsers = 0;

    for (const wallet of allWallets) {
      const fairReward = userRewards[wallet] || 0;
      if (fairReward === 0) continue;

      const key = `${wallet}|${appId}`;
      const isCurrentStaker = currentStakers.has(key);
      const phantomKey = key;
      const alreadyRefunded = phantomRefunds[phantomKey] || 0;

      let v1WouldPay = 0;
      let stakedAmount = 0;
      let stakeTime = 0;
      let status = 'migrated';

      if (isCurrentStaker) {
        // Current staker: V1 will pay at unstake using corrupted APR
        const data = currentStakerData[key];
        stakedAmount = data.stakedAmount;
        stakeTime = data.stakeTime;
        const duration = now - stakeTime;
        v1WouldPay = calcV1Reward(stakedAmount, pool.onChainApr, duration);
        status = 'current_staker';
        poolCurrentStakers++;
      } else {
        // Migrated: V1 paid 0 at unstake (rewards_distributed = 0)
        v1WouldPay = 0;
        // Find their last known stake amount from events
        let runningBalance = 0;
        for (const ev of events) {
          if (ev.user !== wallet) continue;
          if (ev.type === 'stake') runningBalance += ev.amount;
          else if (ev.type === 'unstake') runningBalance -= ev.amount;
        }
        stakedAmount = Math.max(0, runningBalance); // should be 0 for fully unstaked
        poolMigratedUsers++;
      }

      // Delta: positive = treasury owes, negative = V1 overpays
      const delta = fairReward - v1WouldPay - alreadyRefunded;

      poolTotalFairReward += fairReward;
      poolTotalV1WouldPay += v1WouldPay;
      poolTotalDelta += delta;
      if (delta > 0) poolPositiveDeltas++;
      if (delta < 0) poolNegativeDeltas++;

      allUsers.push({
        wallet,
        poolAppId: appId,
        poolName: pool.poolName,
        stakedAmount,
        stakeTime,
        fairReward,
        v1WouldPay,
        alreadyRefunded,
        delta,
        status,
      });
    }

    // Sanity check
    const rewardTokenAmount = poolParams.rewardTokenAmount;
    const overBudget = poolTotalFairReward > rewardTokenAmount;

    console.log(`  [${appId}] ${pool.poolName}: epochs=${epochs.length} users=${allWallets.size} ` +
      `current=${poolCurrentStakers} migrated=${poolMigratedUsers} ` +
      `fair=${(poolTotalFairReward / 1e6).toFixed(3)} v1pays=${(poolTotalV1WouldPay / 1e6).toFixed(3)} ` +
      `delta=${(poolTotalDelta / 1e6).toFixed(3)} (+${poolPositiveDeltas}/-${poolNegativeDeltas})` +
      (overBudget ? ' OVER BUDGET!' : ''));

    poolSummaries.push({
      appId,
      poolName: pool.poolName,
      rewardTokenId: pool.rewardTokenId,
      rewardTokenAmount,
      poolBalance: pool.poolBalance,
      poolAddress: pool.poolAddress,
      onChainApr: pool.onChainApr,
      stakeStartTime: poolParams.stakeStartTime,
      stakeEndTime: poolParams.stakeEndTime,
      epochCount: epochs.length,
      totalUsers: allWallets.size,
      currentStakers: poolCurrentStakers,
      migratedUsers: poolMigratedUsers,
      totalFairReward: poolTotalFairReward,
      totalV1WouldPay: poolTotalV1WouldPay,
      totalDelta: poolTotalDelta,
      positiveDeltas: poolPositiveDeltas,
      negativeDeltas: poolNegativeDeltas,
      overBudget,
      canCoverV1Payouts: pool.poolBalance >= poolTotalV1WouldPay,
    });
  }

  return { allUsers, poolSummaries };
}

// ── Phase 5: Write outputs ──────────────────────────────────────────────────

function writeOutputs(allUsers, poolSummaries) {
  console.log('\nPHASE 5: Writing outputs...\n');

  const positiveDeltas = allUsers.filter(u => u.delta > 0);
  const negativeDeltas = allUsers.filter(u => u.delta < 0);
  const netTreasuryObligation = positiveDeltas.reduce((sum, u) => sum + u.delta, 0);
  const totalOverpayment = negativeDeltas.reduce((sum, u) => sum + Math.abs(u.delta), 0);
  const totalFairRewards = allUsers.reduce((sum, u) => sum + u.fairReward, 0);
  const totalV1WouldPay = allUsers.reduce((sum, u) => sum + u.v1WouldPay, 0);
  const totalAlreadyRefunded = allUsers.reduce((sum, u) => sum + u.alreadyRefunded, 0);

  // ── JSON ──
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: 'Epoch-based proportional share of funded reward pool. No APR used.',
    totalUsers: allUsers.length,
    currentStakers: allUsers.filter(u => u.status === 'current_staker').length,
    migratedUsers: allUsers.filter(u => u.status === 'migrated').length,
    usersOwedPositive: positiveDeltas.length,
    usersOverpaid: negativeDeltas.length,
    totalFairRewardsMicro: totalFairRewards,
    totalFairRewardsHuman: Math.round(totalFairRewards / 1e6 * 1e6) / 1e6,
    totalV1WouldPayMicro: totalV1WouldPay,
    totalAlreadyRefundedMicro: totalAlreadyRefunded,
    netTreasuryObligationMicro: netTreasuryObligation,
    netTreasuryObligationHuman: Math.round(netTreasuryObligation / 1e6 * 1e6) / 1e6,
    totalOverpaymentMicro: totalOverpayment,
    pools: poolSummaries,
    users: allUsers,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`  JSON written to: ${OUTPUT_PATH}`);

  // ── Markdown report ──
  const lines = [];
  lines.push('# V1 Fair Reward Audit — Epoch-Based Proportional Share');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Methodology');
  lines.push('');
  lines.push('APR values are unrecoverable (corrupted by dynamic recalculation on every stake/unstake).');
  lines.push('Instead, fair rewards are calculated from first principles:');
  lines.push('');
  lines.push('1. Each pool was funded with X reward tokens for Y duration');
  lines.push('2. Reward rate = X / Y per second');
  lines.push('3. Each stake/unstake event creates an "epoch" boundary');
  lines.push('4. Within each epoch, rewards split proportionally by stake size');
  lines.push('5. Sum per-user rewards across all epochs = fair reward');
  lines.push('');
  lines.push('`rewards_distributed = 0` for all pools (V1 truncation bug = no rewards ever paid).');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total users | ${allUsers.length} |`);
  lines.push(`| Current stakers | ${allUsers.filter(u => u.status === 'current_staker').length} |`);
  lines.push(`| Migrated users | ${allUsers.filter(u => u.status === 'migrated').length} |`);
  lines.push(`| Users owed (delta > 0) | ${positiveDeltas.length} |`);
  lines.push(`| Users overpaid (delta < 0) | ${negativeDeltas.length} |`);
  lines.push(`| Total fair rewards | ${(totalFairRewards / 1e6).toFixed(6)} tokens |`);
  lines.push(`| Total V1 would pay | ${(totalV1WouldPay / 1e6).toFixed(6)} tokens |`);
  lines.push(`| Total already refunded | ${(totalAlreadyRefunded / 1e6).toFixed(6)} tokens |`);
  lines.push(`| **Net treasury obligation** | **${(netTreasuryObligation / 1e6).toFixed(6)} tokens** |`);
  lines.push(`| Total V1 overpayment | ${(totalOverpayment / 1e6).toFixed(6)} tokens |`);
  lines.push('');

  // Per-pool summary
  lines.push('## Per-Pool Summary');
  lines.push('');
  lines.push('| App ID | Pool | Funded | Epochs | Users | Fair Reward | V1 Pays | Delta | Over Budget? |');
  lines.push('|--------|------|--------|--------|-------|------------|---------|-------|--------------|');
  for (const p of poolSummaries) {
    lines.push(`| ${p.appId} | ${p.poolName} | ${(p.rewardTokenAmount / 1e6).toFixed(0)} | ${p.epochCount} | ${p.totalUsers} (${p.currentStakers}+${p.migratedUsers}) | ${(p.totalFairReward / 1e6).toFixed(3)} | ${(p.totalV1WouldPay / 1e6).toFixed(3)} | ${(p.totalDelta / 1e6).toFixed(3)} | ${p.overBudget ? 'YES' : 'no'} |`);
  }
  lines.push('');

  // Per-pool detailed breakdown
  for (const p of poolSummaries) {
    lines.push(`### Pool ${p.appId} — ${p.poolName}`);
    lines.push('');
    lines.push(`- Funded: ${(p.rewardTokenAmount / 1e6).toFixed(3)} tokens`);
    lines.push(`- Period: ${new Date(p.stakeStartTime * 1000).toISOString().slice(0, 10)} to ${new Date(p.stakeEndTime * 1000).toISOString().slice(0, 10)} (${Math.round((p.stakeEndTime - p.stakeStartTime) / 86400)}d)`);
    lines.push(`- Epochs: ${p.epochCount}`);
    lines.push(`- Users: ${p.totalUsers} (${p.currentStakers} current, ${p.migratedUsers} migrated)`);
    lines.push(`- Fair reward sum: ${(p.totalFairReward / 1e6).toFixed(6)} tokens${p.overBudget ? ' **OVER BUDGET**' : ''}`);
    lines.push(`- V1 would pay: ${(p.totalV1WouldPay / 1e6).toFixed(6)} tokens`);
    lines.push(`- Pool delta: ${(p.totalDelta / 1e6).toFixed(6)} tokens`);
    lines.push('');

    const poolUsers = allUsers.filter(u => u.poolAppId === p.appId);
    if (poolUsers.length > 0) {
      lines.push('| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |');
      lines.push('|--------|--------|------------|---------|----------|-------|');
      for (const u of poolUsers.sort((a, b) => b.fairReward - a.fairReward)) {
        const deltaStr = u.delta >= 0 ? (u.delta / 1e6).toFixed(3) : `-${(Math.abs(u.delta) / 1e6).toFixed(3)}`;
        lines.push(`| ${u.wallet.slice(0, 8)}... | ${u.status === 'current_staker' ? 'current' : 'migrated'} | ${(u.fairReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(u.alreadyRefunded / 1e6).toFixed(3)} | ${deltaStr} |`);
      }
    } else {
      lines.push('*No users.*');
    }
    lines.push('');
  }

  // Top 20
  if (positiveDeltas.length > 0) {
    lines.push('## Top 20 Treasury Obligations');
    lines.push('');
    lines.push('| Wallet | Pool | Status | Fair Reward | V1 Pays | Delta Owed |');
    lines.push('|--------|------|--------|------------|---------|-----------|');
    const top20 = [...positiveDeltas].sort((a, b) => b.delta - a.delta).slice(0, 20);
    for (const u of top20) {
      lines.push(`| ${u.wallet.slice(0, 12)}... | ${u.poolAppId} | ${u.status === 'current_staker' ? 'current' : 'migrated'} | ${(u.fairReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(u.delta / 1e6).toFixed(6)} |`);
    }
    lines.push('');
  }

  // Overpayment
  if (negativeDeltas.length > 0) {
    lines.push('## Overpayment Summary (V1 Pays More Than Fair — No Airdrop Needed)');
    lines.push('');
    lines.push('| Wallet | Pool | Fair Reward | V1 Pays | Overpayment |');
    lines.push('|--------|------|------------|---------|-------------|');
    const overpaid = [...negativeDeltas].sort((a, b) => a.delta - b.delta);
    for (const u of overpaid) {
      lines.push(`| ${u.wallet.slice(0, 12)}... | ${u.poolAppId} | ${(u.fairReward / 1e6).toFixed(3)} | ${(u.v1WouldPay / 1e6).toFixed(3)} | ${(Math.abs(u.delta) / 1e6).toFixed(6)} |`);
    }
    lines.push('');
  }

  // Comparison
  lines.push('## Comparison Across Audit Iterations');
  lines.push('');
  lines.push('| Audit | Method | Total Owed |');
  lines.push('|-------|--------|-----------|');
  lines.push('| v1RewardAudit | MongoDB APR | ~416,874 FRY |');
  lines.push('| v1OnChainInvestigation | Current on-chain APR | ~202,830 tokens |');
  lines.push('| v1OriginalAprRecovery | First-stake APR | ~98B tokens (broken — dynamic APR) |');
  lines.push(`| **v1FairRewardAudit** | **Epoch proportional share** | **${(netTreasuryObligation / 1e6).toFixed(6)} tokens** |`);
  lines.push('');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
  console.log(`  Report written to: ${REPORT_PATH}`);

  return { netTreasuryObligation, totalOverpayment, totalFairRewards, totalV1WouldPay, positiveDeltas, negativeDeltas };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================================');
  console.log('  V1 Fair Reward Audit — Epoch-Based Proportional Share');
  console.log('  READ-ONLY — no transactions, no state changes');
  console.log('============================================================\n');

  // Load corrected audit for pool metadata and current staker box data
  if (!fs.existsSync(CORRECTED_AUDIT_PATH)) {
    console.error(`FATAL: ${CORRECTED_AUDIT_PATH} not found. Run v1OnChainInvestigation.js first.`);
    process.exit(1);
  }
  const correctedAudit = JSON.parse(fs.readFileSync(CORRECTED_AUDIT_PATH, 'utf8'));
  console.log(`Loaded corrected audit: ${correctedAudit.totalUsers} current stakers\n`);

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

  // Phase 1: Gather events
  const allPoolEvents = await gatherEvents(V1_POOL_APP_IDS);

  // Phase 2: Calculate fair rewards
  console.log('\nPHASE 2: Calculating epoch-based fair rewards...\n');
  const allPoolRewards = {};
  for (const appId of V1_POOL_APP_IDS) {
    const result = calculateFairRewards(appId, allPoolEvents[appId], POOL_PARAMS[appId]);
    allPoolRewards[appId] = result;
    const userCount = Object.keys(result.userRewards).length;
    console.log(`  [${appId}] ${result.epochs.length} epochs, ${userCount} rewarded users, ` +
      `total distributed: ${(result.totalDistributed / 1e6).toFixed(3)} / ` +
      `${(POOL_PARAMS[appId].rewardTokenAmount / 1e6).toFixed(3)} funded`);
  }

  // Phase 3+4: Calculate deltas with sanity checks
  const { allUsers, poolSummaries } = calculateDeltas(allPoolRewards, allPoolEvents, correctedAudit, phantomRefunds);

  // Phase 5: Write
  const summary = writeOutputs(allUsers, poolSummaries);

  // Console summary
  console.log('\n============================================================');
  console.log('  FINAL AUDIT SUMMARY (Epoch-Based)');
  console.log('============================================================');
  console.log(`  Total users:              ${allUsers.length}`);
  console.log(`  Current stakers:          ${allUsers.filter(u => u.status === 'current_staker').length}`);
  console.log(`  Migrated users:           ${allUsers.filter(u => u.status === 'migrated').length}`);
  console.log(`  Users owed (delta > 0):   ${summary.positiveDeltas.length}`);
  console.log(`  Users overpaid (delta<0): ${summary.negativeDeltas.length}`);
  console.log(`  Total fair rewards:       ${(summary.totalFairRewards / 1e6).toFixed(6)} tokens`);
  console.log(`  Total V1 would pay:       ${(summary.totalV1WouldPay / 1e6).toFixed(6)} tokens`);
  console.log(`  Net treasury obligation:  ${(summary.netTreasuryObligation / 1e6).toFixed(6)} tokens`);
  console.log(`  Total V1 overpayment:     ${(summary.totalOverpayment / 1e6).toFixed(6)} tokens`);

  console.log('\n  Per-pool:');
  for (const p of poolSummaries) {
    const pct = p.rewardTokenAmount > 0 ? ((p.totalFairReward / p.rewardTokenAmount) * 100).toFixed(1) : '0';
    console.log(`    ${p.appId} (${p.poolName}): ` +
      `${p.epochCount} epochs, ${p.totalUsers} users, ` +
      `fair=${(p.totalFairReward / 1e6).toFixed(3)} (${pct}% of funded), ` +
      `delta=${(p.totalDelta / 1e6).toFixed(3)}${p.overBudget ? ' OVER BUDGET!' : ''}`);
  }

  if (summary.positiveDeltas.length > 0) {
    console.log('\n  Top 5 treasury obligations:');
    const top5 = [...summary.positiveDeltas].sort((a, b) => b.delta - a.delta).slice(0, 5);
    for (const u of top5) {
      console.log(`    ${u.wallet.slice(0, 12)}... -> ${(u.delta / 1e6).toFixed(6)} tokens (${u.poolAppId}, ${u.status})`);
    }
  }

  console.log('\n  Audit progression:');
  console.log('    MongoDB APR:       ~416,874 FRY');
  console.log('    On-chain APR:       202,830 tokens');
  console.log('    First-stake APR:    ~98B tokens (broken)');
  console.log(`    Epoch proportional: ${(summary.netTreasuryObligation / 1e6).toFixed(6)} tokens`);

  console.log('\n  Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
