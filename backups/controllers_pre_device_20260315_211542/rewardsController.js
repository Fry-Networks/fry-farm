const logger = require("../config/logger");
const algosdk = require('algosdk');
const crypto = require('crypto');
const axios = require('axios');
const RewardsConfig = require('../models/rewardsConfigSchema');
const WalletStreak = require('../models/walletStreakSchema');
const DailyClaim = require('../models/dailyClaimSchema');
const antiSybil = require('../services/antiSybilService');
const circuitBreaker = require('../services/circuitBreakerService');
const FeeConfig = require('../models/feeConfigSchema');
const GasFee = require('../models/gasFeeSchema');

// Rekeyed wallet signing setup (deferred — rewards endpoints will fail gracefully if mnemonics are missing)
let ogAccount, rekeyAccount, treasuryAddr, signingKey;
try {
  ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  treasuryAddr = ogAccount.addr;
  signingKey = rekeyAccount.sk;
} catch (err) {
  logger.warn('REWARD_MNEMONIC/REWARD_REKEY not configured — reward claiming will be unavailable:', err.message);
}
const { withFallback, getAlgodClient } = require('../services/algodService');

/**
 * Verify Cloudflare Turnstile CAPTCHA token.
 * Graceful: skips if no secret key configured; fail-open if Cloudflare unreachable.
 */
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: true, skipped: true };
  if (!token) return { success: false, error: 'No turnstile token provided' };
  try {
    const { data } = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({ secret, response: token, remoteip: ip }),
      { timeout: 5000 }
    );
    return { success: data.success, codes: data['error-codes'] };
  } catch (err) {
    logger.error('Turnstile verification error (fail-open):', err.message);
    return { success: true, failOpen: true };
  }
}

/**
 * GET /rewards/status?wallet=<addr>
 * Returns wallet streak, eligibility dry run, next reward
 */
const getRewardsStatus = async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ success: false, message: 'wallet query parameter required' });
    }

    const config = await RewardsConfig.getConfig();
    if (!config.isEnabled) {
      return res.status(200).json({ success: true, data: { enabled: false, message: 'Daily rewards are currently disabled' } });
    }

    const streak = await WalletStreak.findOne({ walletAddress: wallet });
    const currentStreak = streak ? streak.currentStreak : 0;
    const lastClaimAt = streak ? streak.lastClaimAt : null;
    const totalClaimed = streak ? streak.totalClaimed : 0;
    const totalClaims = streak ? streak.totalClaims : 0;

    // Check if streak would reset
    let effectiveStreak = currentStreak;
    if (lastClaimAt) {
      const hoursSinceClaim = (Date.now() - lastClaimAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceClaim >= config.streakResetHours) {
        effectiveStreak = 0;
      }
    }

    // Next reward calculation
    const scheduleIndex = effectiveStreak % config.rewardSchedule.length;
    const nextReward = config.rewardSchedule[scheduleIndex];

    // Trust tier (don't expose score)
    const trustTier = streak ? streak.trustTier : 0;
    const multiplier = config.trustTierMultipliers[Math.min(trustTier, config.trustTierMultipliers.length - 1)];
    const estimatedReward = Math.floor(nextReward * multiplier);

    // Fee info
    const feeConfig = await FeeConfig.getFeeConfig();
    const dailyFeePercent = feeConfig ? (feeConfig.dailyClaimFeePercent || 0) : 0;
    const estimatedRewardAfterFee = Math.floor(estimatedReward * (100 - dailyFeePercent) / 100);

    // Cooldown info
    let canClaim = true;
    let cooldownRemaining = 0;
    if (lastClaimAt) {
      const hoursSinceClaim = (Date.now() - lastClaimAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceClaim < config.claimCooldownHours) {
        canClaim = false;
        cooldownRemaining = Math.ceil((config.claimCooldownHours - hoursSinceClaim) * 60);
      }
    }

    // Active position check (must stake or farm in a live pool)
    let hasPosition = true;
    try {
      hasPosition = await antiSybil.hasActivePosition(wallet);
      if (!hasPosition) canClaim = false;
    } catch (err) {
      logger.warn('hasActivePosition check failed:', err.message);
    }

    // Circuit breaker level
    const cbState = await circuitBreaker.checkCircuitBreaker(config);

    return res.status(200).json({
      success: true,
      data: {
        enabled: true,
        wallet,
        currentStreak: effectiveStreak,
        maxStreak: config.rewardSchedule.length,
        nextReward,
        estimatedReward,
        estimatedRewardAfterFee,
        feePercent: dailyFeePercent,
        trustTier,
        multiplier,
        canClaim,
        cooldownMinutes: cooldownRemaining,
        lastClaimAt,
        totalClaimed,
        totalClaims,
        rewardSchedule: config.rewardSchedule,
        circuitBreakerLevel: cbState.level,
        hasActivePosition: hasPosition,
      },
    });
  } catch (err) {
    logger.error('getRewardsStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /rewards/claim
 * Full anti-sybil -> circuit breaker -> streak calc -> sign+submit ASA transfer -> record
 */
const claimReward = async (req, res) => {
  try {
    // Temporary diagnostic logging to identify which header Bunny CDN sends with real client IP
    console.log('[Claim IP Debug]', JSON.stringify({
      reqIp: req.ip,
      xForwardedFor: req.headers['x-forwarded-for'],
      xRealIp: req.headers['x-real-ip'],
      cfConnectingIp: req.headers['cf-connecting-ip'],
      trueClientIp: req.headers['true-client-ip'],
      xClientIp: req.headers['x-client-ip'],
      forwardedFor: req.headers['forwarded'],
      remoteAddress: req.connection?.remoteAddress || req.socket?.remoteAddress,
      allHeaders: Object.keys(req.headers).filter(h => h.includes('ip') || h.includes('forward') || h.includes('client') || h.includes('real') || h.includes('bunny') || h.includes('cdn'))
    }));

    const { fingerprint, turnstileToken } = req.body;
    const wallet = req.user.wallet;
    const ip = req.ip || req.connection.remoteAddress;
    const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

    const config = await RewardsConfig.getConfig();
    if (!config.isEnabled) {
      return res.status(400).json({ success: false, message: 'Daily rewards are currently disabled' });
    }

    // Turnstile CAPTCHA verification
    const turnstileResult = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileResult.success) {
      return res.status(403).json({ success: false, message: 'CAPTCHA verification failed' });
    }

    // Anti-sybil eligibility check
    const eligibility = await antiSybil.checkEligibility(wallet, ip, fingerprintHash, config);
    if (!eligibility.eligible) {
      return res.status(403).json({
        success: false,
        message: eligibility.reasons[0] || 'Not eligible for daily reward',
        reasons: eligibility.reasons,
      });
    }

    // Circuit breaker check
    const cbResult = await circuitBreaker.checkCircuitBreaker(config);
    if (!cbResult.allowed) {
      return res.status(503).json({ success: false, message: cbResult.reason || 'Claims temporarily paused' });
    }

    // Check trust tier vs circuit breaker level
    const tierCheck = circuitBreaker.checkLevelRestriction(cbResult.level, eligibility.trustTier);
    if (!tierCheck.allowed) {
      return res.status(503).json({ success: false, message: tierCheck.reason });
    }

    // Calculate streak and reward
    let streak = await WalletStreak.findOne({ walletAddress: wallet });
    if (!streak) {
      streak = new WalletStreak({ walletAddress: wallet });
    }

    // Check streak reset
    let currentStreak = streak.currentStreak;
    if (streak.lastClaimAt) {
      const hoursSinceClaim = (Date.now() - streak.lastClaimAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceClaim >= config.streakResetHours) {
        currentStreak = 0;
      }
    }

    const streakDay = currentStreak % config.rewardSchedule.length;
    const baseReward = config.rewardSchedule[streakDay];
    const trustMultiplier = config.trustTierMultipliers[Math.min(eligibility.trustTier, config.trustTierMultipliers.length - 1)];
    const actualReward = Math.floor(baseReward * trustMultiplier);

    // Fetch daily claim fee percentage
    const feeConfig = await FeeConfig.getFeeConfig();
    const dailyFeePercent = feeConfig ? (feeConfig.dailyClaimFeePercent || 0) : 0;
    const feeAmount = Math.floor(actualReward * dailyFeePercent / 100);
    const netReward = actualReward - feeAmount;

    if (netReward <= 0) {
      return res.status(403).json({ success: false, message: 'Reward amount is zero after fee deduction' });
    }

    // Convert to microFRY (6 decimals)
    const microAmount = netReward * 1e6;

    // Sign and submit ASA transfer (with node fallback)
    const { txId } = await withFallback(async (client) => {
      const params = await client.getTransactionParams().do();
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: wallet,
        amount: microAmount,
        assetIndex: config.fryAsaId,
        suggestedParams: params,
      });

      const signedTxn = txn.signTxn(signingKey);
      const { txid } = await client.sendRawTransaction(signedTxn).do();

      // Wait for confirmation (up to 4 rounds)
      await algosdk.waitForConfirmation(client, txid, 4);
      return { txId: txid };
    });

    // Log daily claim fee (fire-and-forget)
    if (feeAmount > 0) {
      GasFee.create({
        appId: 0,
        userId: wallet,
        gasAmount: feeAmount,
        gasType: 'dailyClaim',
        feeType: 'percentage',
        feePercent: dailyFeePercent,
        baseAmount: actualReward,
        txId,
      }).catch(err => logger.error('Failed to log daily claim fee:', err.message));
    }

    // Record claim in DB (unique index catches race conditions)
    const today = new Date();
    const claimDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    try {
      await DailyClaim.create({
        walletAddress: wallet,
        claimDate,
        streakDay: streakDay + 1,
        baseReward,
        trustMultiplier,
        actualReward,
        txId,
        ipAddress: ip,
        fingerprintHash,
        trustScore: eligibility.trustScore,
        trustTier: eligibility.trustTier,
        onChainScore: eligibility.onChainScore || 0,
      });
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        return res.status(409).json({ success: false, message: 'Already claimed today' });
      }
      throw dupErr;
    }

    // Update streak
    streak.currentStreak = currentStreak + 1;
    streak.lastClaimAt = new Date();
    streak.totalClaimed += netReward;
    streak.totalClaims += 1;
    streak.trustScore = eligibility.trustScore;
    streak.trustTier = eligibility.trustTier;
    streak.suspicionFlags = eligibility.suspicionFlags;
    await streak.save();

    // Record in circuit breaker
    const isSuspicious = eligibility.suspicionFlags.length > 0;
    await circuitBreaker.recordClaim(isSuspicious, config);

    return res.status(200).json({
      success: true,
      message: `Claimed ${netReward} FRY!`,
      data: {
        txId,
        actualReward: netReward,
        baseReward,
        feeAmount,
        feePercent: dailyFeePercent,
        trustTier: eligibility.trustTier,
        multiplier: trustMultiplier,
        streakDay: streakDay + 1,
        currentStreak: currentStreak + 1,
      },
    });
  } catch (err) {
    logger.error('claimReward error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to process claim' });
  }
};

/**
 * GET /rewards/config
 * Returns safe subset of config (no admin secrets)
 */
const getRewardsConfig = async (req, res) => {
  try {
    const config = await RewardsConfig.getConfig();
    const cbState = await circuitBreaker.checkCircuitBreaker(config);

    return res.status(200).json({
      success: true,
      data: {
        isEnabled: config.isEnabled,
        rewardSchedule: config.rewardSchedule,
        minAlgoBalance: config.minAlgoBalance,
        minFryBalance: config.minFryBalance,
        minWalletAgeDays: config.minWalletAgeDays,
        claimCooldownHours: config.claimCooldownHours,
        streakResetHours: config.streakResetHours,
        trustTierThresholds: config.trustTierThresholds,
        trustTierMultipliers: config.trustTierMultipliers,
        circuitBreakerLevel: cbState.level,
      },
    });
  } catch (err) {
    logger.error('getRewardsConfig error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /rewards/config (admin)
 * Partial update of rewards config
 */
const updateRewardsConfig = async (req, res) => {
  try {
    const config = await RewardsConfig.getConfig();
    const updates = req.body;

    Object.keys(updates).forEach(key => {
      if (config.schema.paths[key]) {
        config[key] = updates[key];
      }
    });

    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Rewards config updated',
      data: config,
    });
  } catch (err) {
    logger.error('updateRewardsConfig error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /rewards/leaderboard
 * Top 20 by totalClaimed, truncated addresses
 */
const getLeaderboard = async (req, res) => {
  try {
    const leaders = await WalletStreak.find({ isBanned: false, totalClaimed: { $gt: 0 } })
      .sort({ totalClaimed: -1 })
      .limit(20)
      .select('walletAddress totalClaimed totalClaims currentStreak trustTier')
      .lean();

    const data = leaders.map(l => ({
      wallet: l.walletAddress.slice(0, 6) + '...' + l.walletAddress.slice(-4),
      totalClaimed: l.totalClaimed,
      totalClaims: l.totalClaims,
      currentStreak: l.currentStreak,
      trustTier: l.trustTier,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getLeaderboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /rewards/admin/pause (admin)
 */
const adminPause = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const config = await RewardsConfig.getConfig();
    const state = await circuitBreaker.setPause(true, reason || 'Admin paused', config);

    return res.status(200).json({
      success: true,
      message: 'Rewards paused',
      data: { level: state.currentLevel, manualPause: state.manualPause },
    });
  } catch (err) {
    logger.error('adminPause error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /rewards/admin/resume (admin)
 */
const adminResume = async (req, res) => {
  try {
    const config = await RewardsConfig.getConfig();
    const state = await circuitBreaker.setPause(false, '', config);

    return res.status(200).json({
      success: true,
      message: 'Rewards resumed',
      data: { level: state.currentLevel, manualPause: state.manualPause },
    });
  } catch (err) {
    logger.error('adminResume error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /rewards/admin/ban (admin)
 */
const adminBanWallet = async (req, res) => {
  try {
    const { wallet, reason } = req.body;

    let streak = await WalletStreak.findOne({ walletAddress: wallet });
    if (!streak) {
      streak = new WalletStreak({ walletAddress: wallet });
    }

    streak.isBanned = true;
    streak.banReason = reason || 'Banned by admin';
    await streak.save();

    return res.status(200).json({
      success: true,
      message: `Wallet ${wallet.slice(0, 6)}...${wallet.slice(-4)} banned`,
    });
  } catch (err) {
    logger.error('adminBanWallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /rewards/admin/unban (admin)
 */
const adminUnbanWallet = async (req, res) => {
  try {
    const { wallet } = req.body;

    const streak = await WalletStreak.findOne({ walletAddress: wallet });
    if (!streak) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    streak.isBanned = false;
    streak.banReason = '';
    await streak.save();

    return res.status(200).json({
      success: true,
      message: `Wallet ${wallet.slice(0, 6)}...${wallet.slice(-4)} unbanned`,
    });
  } catch (err) {
    logger.error('adminUnbanWallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getRewardsStatus,
  claimReward,
  getRewardsConfig,
  updateRewardsConfig,
  getLeaderboard,
  adminPause,
  adminResume,
  adminBanWallet,
  adminUnbanWallet,
};
