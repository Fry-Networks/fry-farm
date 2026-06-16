const logger = require("../config/logger");
const WalletStreak = require('../models/walletStreakSchema');
const DailyClaim = require('../models/dailyClaimSchema');
const StakingToken = require('../models/stakingTokenSchema');
const StakingFarmingToken = require('../models/stakingFarmingTokenSchema');
const Staking = require('../models/stakingSchema');
const Farming = require('../models/farmingSchema');

// In-memory caches with TTL
const walletInfoCache = new Map();   // 10min TTL
const onChainScoreCache = new Map(); // 30min TTL

const WALLET_INFO_TTL = 10 * 60 * 1000;
const ON_CHAIN_SCORE_TTL = 30 * 60 * 1000;
const blockTimestampCache = new Map(); // permanent — block timestamps never change

// Cleanup expired cache entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of walletInfoCache) {
    if (now > entry.expires) walletInfoCache.delete(key);
  }
  for (const [key, entry] of onChainScoreCache) {
    if (now > entry.expires) onChainScoreCache.delete(key);
  }
}, 5 * 60 * 1000);

// Known DeFi app IDs (Tinyman, Folks, Pact, Humble)
const DEFI_APP_IDS = new Set([
  552635992, 552635992, // Tinyman v2
  686498781, 686505742, // Folks Finance
  620458486, 620458488, // Pact
  776707014, 776707104, // Humble
]);

/**
 * Fetch wallet info from indexer with caching
 */
async function getWalletInfo(wallet, indexerUrl) {
  const cached = walletInfoCache.get(wallet);
  if (cached && Date.now() < cached.expires) return cached.data;

  const res = await fetch(`${indexerUrl}/v2/accounts/${wallet}`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  const data = await res.json();

  walletInfoCache.set(wallet, { data: data.account, expires: Date.now() + WALLET_INFO_TTL });
  return data.account;
}

/**
 * Get block timestamp from indexer (permanently cached)
 */
async function getBlockTimestamp(round, indexerUrl) {
  if (blockTimestampCache.has(round)) return blockTimestampCache.get(round);
  const res = await fetch(`${indexerUrl}/v2/blocks/${round}`);
  if (!res.ok) return null;
  const data = await res.json();
  const timestamp = data.timestamp || null;
  if (timestamp) blockTimestampCache.set(round, timestamp);
  return timestamp;
}

/**
 * Get transaction count and activity data for on-chain scoring
 */
async function getActivityData(wallet, indexerUrl) {
  // Get recent transactions (up to 500 for scoring)
  const res = await fetch(`${indexerUrl}/v2/accounts/${wallet}/transactions?limit=500`);
  if (!res.ok) throw new Error(`Indexer activity error: ${res.status}`);
  const data = await res.json();
  return data.transactions || [];
}

/**
 * Calculate on-chain activity score (hardcoded weights)
 */
async function calculateOnChainScore(wallet, accountInfo, indexerUrl) {
  const cached = onChainScoreCache.get(wallet);
  if (cached && Date.now() < cached.expires) return cached.data;

  let score = 0;
  const flags = [];

  try {
    const txns = await getActivityData(wallet, indexerUrl);
    const txCount = txns.length;
    const now = Date.now() / 1000;

    // Wallet age scoring (use account creation round, not earliest visible tx)
    let walletAgeDays = 0;
    const createdAtRound = accountInfo['created-at-round'];
    if (createdAtRound) {
      const createdTimestamp = await getBlockTimestamp(createdAtRound, indexerUrl);
      if (createdTimestamp) {
        walletAgeDays = (now - createdTimestamp) / 86400;
      }
    }

    if (walletAgeDays > 30) score += 1;
    if (walletAgeDays > 180) score += 1;

    // Transaction count
    if (txCount > 20) score += 1;
    if (txCount > 50) score += 1;

    // ASAs opted in
    const assets = accountInfo.assets || [];
    if (assets.length >= 5) score += 1;

    // App interactions
    const appLocalStates = accountInfo['apps-local-state'] || [];
    if (appLocalStates.length >= 3) score += 1;

    // Calendar months of activity
    const months = new Set();
    for (const tx of txns) {
      if (tx['round-time']) {
        const d = new Date(tx['round-time'] * 1000);
        months.add(`${d.getFullYear()}-${d.getMonth()}`);
      }
    }
    if (months.size >= 3) score += 1;

    // Known DeFi interactions
    const hasDefi = appLocalStates.some(app => DEFI_APP_IDS.has(app.id));
    if (hasDefi) score += 1;

    // Negative signals
    if (txns.length > 0) {
      const earliest = txns[txns.length - 1];
      const latest = txns[0];
      const activitySpan = (latest['round-time'] || 0) - (earliest['round-time'] || 0);
      if (activitySpan < 48 * 3600 && txCount > 1) {
        score -= 1;
        flags.push('all_activity_within_48h');
      }
    }

    const algoBalance = (accountInfo.amount || 0) / 1e6;
    if (algoBalance < 5 && appLocalStates.length <= 1) {
      score -= 1;
      flags.push('low_balance_low_apps');
    }
  } catch (err) {
    logger.error('On-chain score calculation error:', err.message);
  }

  score = Math.max(0, score);
  const result = { score, flags };
  onChainScoreCache.set(wallet, { data: result, expires: Date.now() + ON_CHAIN_SCORE_TTL });
  return result;
}

/**
 * Calculate trust score (composite 0.0-1.0, hardcoded weights)
 */
function calculateTrustScore(walletAgeDays, txCount, appCount, fingerprintUniqueWallets, cleanStreakDays, onChainScore, flags) {
  let score = 0;

  // Wallet age component (0-0.25)
  if (walletAgeDays > 365) score += 0.25;
  else if (walletAgeDays > 180) score += 0.2;
  else if (walletAgeDays > 30) score += 0.1;
  else if (walletAgeDays > 7) score += 0.05;

  // Transaction count component (0-0.2)
  if (txCount > 100) score += 0.2;
  else if (txCount > 50) score += 0.15;
  else if (txCount > 20) score += 0.1;
  else if (txCount > 5) score += 0.05;

  // DApp interactions (0-0.15)
  if (appCount >= 5) score += 0.15;
  else if (appCount >= 3) score += 0.1;
  else if (appCount >= 1) score += 0.05;

  // Fingerprint uniqueness (0-0.15)
  if (fingerprintUniqueWallets <= 1) score += 0.15;
  else if (fingerprintUniqueWallets <= 2) score += 0.05;
  // 3+ wallets on same fingerprint = no bonus

  // Clean streak days (0-0.1)
  if (cleanStreakDays >= 7) score += 0.1;
  else if (cleanStreakDays >= 3) score += 0.05;

  // On-chain score bonus (0-0.15)
  if (onChainScore >= 6) score += 0.15;
  else if (onChainScore >= 4) score += 0.1;
  else if (onChainScore >= 2) score += 0.05;

  // Deductions
  if (fingerprintUniqueWallets >= 3) score -= 0.15;
  if (flags.includes('all_activity_within_48h')) score -= 0.1;
  if (onChainScore <= 1) score -= 0.1;
  if (walletAgeDays < 7) score -= 0.1;

  return Math.max(0, Math.min(1, parseFloat(score.toFixed(3))));
}

/**
 * Determine trust tier from score and thresholds
 */
function getTrustTier(trustScore, thresholds) {
  if (trustScore >= thresholds[2]) return 3;
  if (trustScore >= thresholds[1]) return 2;
  if (trustScore >= thresholds[0]) return 1;
  return 0;
}

/**
 * Get start of today (UTC)
 */
function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Main eligibility check — runs 10 checks in order, fail-fast
 */
async function checkEligibility(wallet, ip, fingerprint, config) {
  const checks = [];
  const reasons = [];
  const suspicionFlags = [];

  const addCheck = (name, passed, detail) => {
    checks.push({ name, passed, detail });
    if (!passed) reasons.push(detail || name);
  };

  try {
    // 1. Ban check
    const streak = await WalletStreak.findOne({ walletAddress: wallet });
    if (streak && streak.isBanned) {
      addCheck('ban_check', false, `Wallet banned: ${streak.banReason || 'No reason given'}`);
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('ban_check', true);

    // 1b. Active position check (must stake or farm in a live pool)
    const hasPosition = await hasActivePosition(wallet);
    if (!hasPosition) {
      addCheck('active_position', false, 'Stake or farm any amount to unlock daily FRY rewards');
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('active_position', true);

    // 2. Claim cooldown
    if (streak && streak.lastClaimAt) {
      const hoursSinceClaim = (Date.now() - streak.lastClaimAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceClaim < config.claimCooldownHours) {
        const hoursLeft = (config.claimCooldownHours - hoursSinceClaim).toFixed(1);
        addCheck('claim_cooldown', false, `Cooldown active: ${hoursLeft}h remaining`);
        return { eligible: false, checks, trustScore: streak.trustScore || 0, trustTier: streak.trustTier || 0, reasons, suspicionFlags };
      }
    }
    addCheck('claim_cooldown', true);

    const today = startOfToday();

    // 3. IP rate limit
    const ipClaimsToday = await DailyClaim.countDocuments({ ipAddress: ip, claimDate: today });
    if (ipClaimsToday >= config.maxClaimsPerIpPerDay) {
      addCheck('ip_rate_limit', false, 'IP daily limit reached');
      suspicionFlags.push('ip_limit_hit');
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('ip_rate_limit', true);

    // 4. Fingerprint rate limit + distinct wallet count
    const fpClaimsToday = await DailyClaim.countDocuments({ fingerprintHash: fingerprint, claimDate: today });
    if (fpClaimsToday >= config.maxClaimsPerFingerprintPerDay) {
      addCheck('fingerprint_rate_limit', false, 'Fingerprint daily limit reached');
      suspicionFlags.push('fingerprint_limit_hit');
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fpDistinctWallets = await DailyClaim.distinct('walletAddress', {
      fingerprintHash: fingerprint,
      claimDate: { $gte: sevenDaysAgo },
    });
    const fingerprintUniqueWallets = fpDistinctWallets.length;

    if (fingerprintUniqueWallets >= 5) {
      addCheck('fingerprint_rate_limit', false, 'Too many wallets on this device');
      suspicionFlags.push('multi_wallet_fingerprint');
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('fingerprint_rate_limit', true);

    // 5. Cooldown escalation for shared IP+fingerprint
    if (fingerprintUniqueWallets > 1) {
      suspicionFlags.push('shared_fingerprint');
      const effectiveCooldown = config.claimCooldownHours * Math.pow(2, fingerprintUniqueWallets - 1);
      if (streak && streak.lastClaimAt) {
        const hoursSinceClaim = (Date.now() - streak.lastClaimAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceClaim < effectiveCooldown) {
          addCheck('cooldown_escalation', false, `Escalated cooldown: ${effectiveCooldown}h for shared device`);
          return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
        }
      }
    }
    addCheck('cooldown_escalation', true);

    // 6-8. On-chain checks (ALGO balance, FRY balance, wallet age)
    const accountInfo = await getWalletInfo(wallet, config.indexerUrl);

    // 6. Min ALGO balance
    const algoBalance = (accountInfo.amount || 0) / 1e6;
    if (algoBalance < config.minAlgoBalance) {
      addCheck('min_algo_balance', false, `ALGO balance ${algoBalance.toFixed(2)} below minimum ${config.minAlgoBalance}`);
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('min_algo_balance', true);

    // 7. Min FRY balance
    const assets = accountInfo.assets || [];
    const fryAsset = assets.find(a => a['asset-id'] === config.fryAsaId);
    const fryBalance = fryAsset ? fryAsset.amount / 1e6 : 0;
    if (fryBalance < config.minFryBalance) {
      addCheck('min_fry_balance', false, `FRY balance ${fryBalance.toFixed(2)} below minimum ${config.minFryBalance}`);
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('min_fry_balance', true);

    // 8. Wallet age (use account creation round, not earliest visible tx)
    let walletAgeDays = 0;
    const createdAtRound = accountInfo['created-at-round'];
    if (createdAtRound) {
      const createdTimestamp = await getBlockTimestamp(createdAtRound, config.indexerUrl);
      if (createdTimestamp) {
        walletAgeDays = (Date.now() / 1000 - createdTimestamp) / 86400;
      }
    }
    if (walletAgeDays < config.minWalletAgeDays) {
      addCheck('wallet_age', false, `Wallet age ${walletAgeDays.toFixed(0)}d below minimum ${config.minWalletAgeDays}d`);
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('wallet_age', true);

    // 9. On-chain activity score
    const { score: onChainScore, flags: onChainFlags } = await calculateOnChainScore(wallet, accountInfo, config.indexerUrl);
    suspicionFlags.push(...onChainFlags);
    if (onChainScore < config.minOnChainScore) {
      addCheck('on_chain_score', false, `On-chain score ${onChainScore} below minimum ${config.minOnChainScore}`);
      return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
    }
    addCheck('on_chain_score', true);

    // 10. Trust score
    const appCount = (accountInfo['apps-local-state'] || []).length;
    const txCount = (await getActivityData(wallet, config.indexerUrl)).length;
    const cleanStreakDays = streak ? streak.currentStreak : 0;

    const trustScore = calculateTrustScore(walletAgeDays, txCount, appCount, fingerprintUniqueWallets, cleanStreakDays, onChainScore, onChainFlags);
    const trustTier = getTrustTier(trustScore, config.trustTierThresholds);
    addCheck('trust_score', true, `Trust score: ${trustScore}, tier: ${trustTier}`);

    return { eligible: true, checks, trustScore, trustTier, onChainScore, reasons, suspicionFlags };
  } catch (err) {
    logger.error('Eligibility check error:', err.message);
    addCheck('system_error', false, 'Internal error during eligibility check');
    return { eligible: false, checks, trustScore: 0, trustTier: 0, reasons, suspicionFlags };
  }
}

/**
 * Check if wallet has any active stake/farm in a LIVE pool.
 * Live = stakingEndTime (or farmEndTime) > now (UNIX seconds).
 */
async function hasActivePosition(wallet) {
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. Check staking: find live pools, then check if wallet has a record in any
  const liveStakingPools = await Staking.find(
    { stakingEndTime: { $gt: nowSec } },
    { _id: 1 }
  ).lean();

  if (liveStakingPools.length > 0) {
    const livePoolIds = liveStakingPools.map(p => p._id.toString());
    const hasStake = await StakingToken.exists({
      wallet: wallet,
      poolId: { $in: livePoolIds },
      totalStaked: { $gt: 0 },
    });
    if (hasStake) return true;
  }

  // 2. Check farming: find live farms, then check if wallet has a record in any
  const liveFarmingPools = await Farming.find(
    { farmEndTime: { $gt: nowSec } },
    { _id: 1 }
  ).lean();

  if (liveFarmingPools.length > 0) {
    const liveFarmIds = liveFarmingPools.map(p => p._id.toString());
    const hasFarm = await StakingFarmingToken.exists({
      wallet: wallet,
      poolId: { $in: liveFarmIds },
      stakedAmount: { $gt: 0 },
    });
    if (hasFarm) return true;
  }

  // 3. Check Alpha Arcade positions
  const AlphaArcadePosition = require('../models/alphaArcadePositionSchema');
  const hasAAPosition = await AlphaArcadePosition.exists({
    wallet: wallet,
    status: 'active',
    usdcDeposited: { $gt: 0 },
  });
  if (hasAAPosition) return true;

  return false;
}

module.exports = { checkEligibility, hasActivePosition };
