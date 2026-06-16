const logger = require("../config/logger");
const algosdk = require('algosdk');
const crypto = require('crypto');
const axios = require('axios');
const RewardsConfig = require('../models/rewardsConfigSchema');
const WalletStreak = require('../models/walletStreakSchema');
const DailyClaim = require('../models/dailyClaimSchema');
const DailyBudget = require('../models/dailyBudgetSchema');
const RewardVault = require('../models/rewardVaultSchema');
const antiSybil = require('../services/antiSybilService');
const circuitBreaker = require('../services/circuitBreakerService');
const FeeConfig = require('../models/feeConfigSchema');
const GasFee = require('../models/gasFeeSchema');

// Rekeyed wallet signing setup (deferred — rewards endpoints will fail gracefully if mnemonics are missing)
let ogAccount = null, rekeyAccount = null, treasuryAddr = null, signingKey = null;
try {
  ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  treasuryAddr = ogAccount.addr;
  signingKey = rekeyAccount.sk;
} catch (err) {
  logger.critical('REWARD_MNEMONIC/REWARD_REKEY not configured — reward claiming will be unavailable:', err.message);
  ogAccount = null;
  rekeyAccount = null;
  treasuryAddr = null;
  signingKey = null;
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

// ─────────────────────────────────────────────────────────────
// Capped-hybrid helpers
// ─────────────────────────────────────────────────────────────

function getWeekWindow(date, weekStartDay) {
  const d = new Date(date);
  const currentDay = d.getUTCDay();
  const daysSinceStart = (currentDay - weekStartDay + 7) % 7;
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - daysSinceStart);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

async function reserveBudget(walletAddress, config, todayStr) {
  const MAX_CAS_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    let budget = await DailyBudget.findOne({ date: todayStr });
    if (!budget) {
      try {
        budget = await DailyBudget.create({
          date: todayStr, totalGrossIssued: 0, totalLiquidIssued: 0,
          totalVaultIssued: 0, claimCount: 0,
          budgetLimit: config.dailyGlobalBudget, maxPerUser: config.maxGrossPerUser,
          reservations: [],
        });
      } catch (e) {
        if (e.code === 11000) budget = await DailyBudget.findOne({ date: todayStr });
        else throw e;
      }
    }
    const remaining = budget.budgetLimit - budget.totalGrossIssued;
    if (remaining <= 0) return null;
    const grossReward = Math.min(config.maxGrossPerUser, remaining);
    const liquidReward = Math.floor(grossReward * config.liquidBps / 10000);
    const vaultReward = grossReward - liquidReward;

    const result = await DailyBudget.findOneAndUpdate(
      { date: todayStr, totalGrossIssued: budget.totalGrossIssued },
      {
        $inc: { totalGrossIssued: grossReward, totalLiquidIssued: liquidReward,
                totalVaultIssued: vaultReward, claimCount: 1 },
        $push: { reservations: {
          walletAddress, grossAmount: grossReward, liquidAmount: liquidReward,
          vaultAmount: vaultReward, status: 'reserved', reservedAt: new Date(),
        }},
      },
      { returnDocument: 'after' }
    );
    if (result) {
      const reservationId = result.reservations[result.reservations.length - 1]._id;
      return { grossReward, liquidReward, vaultReward, budgetDoc: result, reservationId };
    }
    // CAS lost — retry
  }
  throw new Error('Budget reservation failed after CAS retries — high contention');
}

async function rollbackReservation(todayStr, reservationId, grossReward, liquidReward, vaultReward) {
  await DailyBudget.updateOne(
    { date: todayStr },
    { $inc: { totalGrossIssued: -grossReward, totalLiquidIssued: -liquidReward,
              totalVaultIssued: -vaultReward, claimCount: -1 } }
  );
  await DailyBudget.updateOne(
    { date: todayStr, 'reservations._id': reservationId },
    { $set: { 'reservations.$.status': 'failed', 'reservations.$.failedAt': new Date(),
              'reservations.$.failureReason': 'Rolled back' } }
  );
}

async function finalizeCappedClaim(todayStr, reservationId, claimId, wallet, txId,
    grossReward, liquidReward, vaultReward, currentStreak, config, eligibility) {
  // Mark db_finalizing
  await DailyBudget.updateOne(
    { date: todayStr, 'reservations._id': reservationId },
    { $set: { 'reservations.$.status': 'db_finalizing' } }
  );

  // Update dailyclaims with real txId (idempotent on unique doc)
  await DailyClaim.updateOne(
    { _id: claimId },
    { $set: { txId, grossReward, liquidReward, vaultReward } }
  );

  // Upsert vault entry (atomic $ne guard prevents duplicate push)
  if (vaultReward > 0) {
    const { weekStart, weekEnd } = getWeekWindow(new Date(), config.vaultWeekStartDay);
    await RewardVault.updateOne(
      { walletAddress: wallet, 'entries.claimDate': { $ne: todayStr } },
      {
        $push: { entries: {
          weekStart, weekEnd, amount: vaultReward, claimDate: todayStr, status: 'locked',
        }},
        $inc: { totalLocked: vaultReward },
      },
      { upsert: true }
    );
  }

  // Update streak (guard: only if lastClaimAt < today, prevents double-increment on replay)
  const todayStart = new Date(todayStr + 'T00:00:00Z');
  await WalletStreak.updateOne(
    { walletAddress: wallet, $or: [
      { lastClaimAt: { $lt: todayStart } }, { lastClaimAt: null }, { lastClaimAt: { $exists: false } },
    ]},
    {
      $set: {
        currentStreak: currentStreak + 1, lastClaimAt: new Date(),
        trustScore: eligibility.trustScore, trustTier: eligibility.trustTier,
        suspicionFlags: eligibility.suspicionFlags,
      },
      $inc: { totalClaimed: liquidReward, totalClaims: 1 },
    },
    { upsert: true }
  );

  // Mark finalized (terminal)
  await DailyBudget.updateOne(
    { date: todayStr, 'reservations._id': reservationId },
    { $set: { 'reservations.$.status': 'finalized', 'reservations.$.finalizedAt': new Date(),
              'reservations.$.txId': txId } }
  );
}

async function cappedHybridClaim(wallet, ip, fingerprintHash, config, eligibility, req, res) {
  // Streak info (tracked for vault qualification, not reward amount)
  let streak = await WalletStreak.findOne({ walletAddress: wallet });
  if (!streak) streak = new WalletStreak({ walletAddress: wallet });
  let currentStreak = streak.currentStreak;
  if (streak.lastClaimAt) {
    const hoursSinceClaim = (Date.now() - streak.lastClaimAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceClaim >= config.streakResetHours) currentStreak = 0;
  }

  // PHASE 1: Reserve budget atomically
  const todayStr = new Date().toISOString().slice(0, 10);
  let reservation;
  try {
    reservation = await reserveBudget(wallet, config, todayStr);
  } catch (casErr) {
    logger.error('Budget reservation CAS failure:', casErr.message);
    return res.status(503).json({ success: false, message: 'High contention — try again in a moment' });
  }
  if (!reservation) {
    return res.status(503).json({ success: false, message: 'Daily reward pool exhausted — try again tomorrow' });
  }
  const { grossReward, liquidReward, vaultReward, reservationId } = reservation;

  // Record claim (unique index prevents double-claim)
  const today = new Date();
  const claimDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let claimRecord;
  try {
    claimRecord = await DailyClaim.create({
      walletAddress: wallet, claimDate,
      streakDay: (currentStreak % config.rewardSchedule.length) + 1,
      baseReward: grossReward, trustMultiplier: 1.0,
      actualReward: liquidReward,
      txId: liquidReward > 0 ? 'pending' : 'vault-only',
      ipAddress: ip, fingerprintHash,
      trustScore: eligibility.trustScore, trustTier: eligibility.trustTier,
      onChainScore: eligibility.onChainScore || 0,
      grossReward, liquidReward, vaultReward, rewardMode: 'capped-hybrid',
    });
  } catch (dupErr) {
    if (dupErr.code === 11000) {
      await rollbackReservation(todayStr, reservationId, grossReward, liquidReward, vaultReward);
      return res.status(409).json({ success: false, message: 'Already claimed today' });
    }
    throw dupErr;
  }

  // Update reservation: reserved -> chain_pending
  await DailyBudget.updateOne(
    { date: todayStr, 'reservations._id': reservationId },
    { $set: { 'reservations.$.status': 'chain_pending',
              'reservations.$.chainSubmitStartedAt': new Date() } }
  );

  // PHASE 2: Execute on-chain (only if liquidReward > 0)
  let txId = liquidReward > 0 ? null : 'vault-only';
  if (liquidReward > 0) {
    const microAmount = liquidReward * 1e6;
    try {
      const result = await withFallback(async (client) => {
        const params = await client.getTransactionParams().do();
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: treasuryAddr, receiver: wallet, amount: microAmount,
          assetIndex: config.fryAsaId, suggestedParams: params,
        });
        const signedTxn = txn.signTxn(signingKey);
        const { txid } = await client.sendRawTransaction(signedTxn).do();
        // Store txId immediately (crash recovery needs this BEFORE confirmation)
        await DailyBudget.updateOne(
          { date: todayStr, 'reservations._id': reservationId },
          { $set: { 'reservations.$.txId': txid } }
        );
        await algosdk.waitForConfirmation(client, txid, 4);
        return { txId: txid };
      });
      txId = result.txId;
      await DailyBudget.updateOne(
        { date: todayStr, 'reservations._id': reservationId },
        { $set: { 'reservations.$.chainConfirmedAt': new Date() } }
      );
    } catch (sendErr) {
      // Check if txId was stored before the error
      const budget = await DailyBudget.findOne({ date: todayStr });
      const resEntry = budget?.reservations.id(reservationId);
      if (!resEntry?.txId) {
        // No txId — safe to rollback
        await DailyClaim.deleteOne({ _id: claimRecord._id });
        await rollbackReservation(todayStr, reservationId, grossReward, liquidReward, vaultReward);
        throw sendErr;
      }
      // txId exists but confirmation failed — DO NOT rollback
      return res.status(500).json({
        success: false,
        message: 'Transaction sent but confirmation timed out. Check allo.info.',
        txId: resEntry.txId,
      });
    }
  }

  // PHASE 3: Finalize (idempotent)
  await finalizeCappedClaim(todayStr, reservationId, claimRecord._id, wallet, txId,
    grossReward, liquidReward, vaultReward, currentStreak, config, eligibility);

  // Record in circuit breaker
  const isSuspicious = eligibility.suspicionFlags.length > 0;
  await circuitBreaker.recordClaim(isSuspicious, config);

  return res.status(200).json({
    success: true,
    message: `Claimed ${grossReward} FRY (${liquidReward} liquid + ${vaultReward} vault)!`,
    data: {
      txId, grossReward, liquidReward, vaultReward,
      actualReward: liquidReward, feeAmount: 0, feePercent: 0,
      rewardMode: 'capped-hybrid',
      streakDay: (currentStreak % config.rewardSchedule.length) + 1,
      currentStreak: currentStreak + 1,
    },
  });
}

async function checkTransactionConfirmed(txId) {
  try {
    const config = await RewardsConfig.getConfig();
    const resp = await axios.get(`${config.indexerUrl}/v2/transactions/${txId}`, { timeout: 10000 });
    return resp.data?.transaction?.['confirmed-round'] > 0;
  } catch (err) {
    if (err.response?.status === 404) return false;
    throw err;
  }
}

async function reconcileStaleReservations() {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const staleBudgets = await DailyBudget.find({
    reservations: { $elemMatch: {
      status: { $in: ['reserved', 'chain_pending', 'db_finalizing'] },
      reservedAt: { $lt: fiveMinAgo },
    }},
  });
  const config = await RewardsConfig.getConfig();

  for (const budget of staleBudgets) {
    for (const r of budget.reservations) {
      if (['finalized', 'failed'].includes(r.status) || r.reservedAt >= fiveMinAgo) continue;
      const { _id: resId, status, txId, walletAddress, grossAmount, liquidAmount, vaultAmount } = r;
      const claimDate = new Date(budget.date + 'T00:00:00Z');

      if (status === 'reserved' || (status === 'chain_pending' && !txId)) {
        logger.info(`Reconcile: ${resId} status=${status} no txId — rollback`);
        await rollbackReservation(budget.date, resId, grossAmount, liquidAmount, vaultAmount);
        await DailyClaim.deleteOne({ walletAddress, claimDate });
        await DailyBudget.updateOne(
          { date: budget.date, 'reservations._id': resId },
          { $set: { 'reservations.$.failureReason': 'Stale — no chain submit' } }
        );
      } else if (status === 'chain_pending' && txId === 'vault-only') {
        logger.info(`Reconcile: ${resId} vault-only — resume finalization`);
        const claim = await DailyClaim.findOne({ walletAddress, claimDate });
        if (claim) {
          const streak = await WalletStreak.findOne({ walletAddress });
          await finalizeCappedClaim(budget.date, resId, claim._id, walletAddress, 'vault-only',
            grossAmount, liquidAmount, vaultAmount, streak?.currentStreak || 0,
            config, { trustScore: 0, trustTier: 0, suspicionFlags: [] });
        }
      } else if (status === 'chain_pending' && txId) {
        logger.info(`Reconcile: ${resId} chain_pending txId=${txId} — checking chain`);
        try {
          const confirmed = await checkTransactionConfirmed(txId);
          if (confirmed) {
            const claim = await DailyClaim.findOne({ walletAddress, claimDate });
            if (claim) {
              const streak = await WalletStreak.findOne({ walletAddress });
              await finalizeCappedClaim(budget.date, resId, claim._id, walletAddress, txId,
                grossAmount, liquidAmount, vaultAmount, streak?.currentStreak || 0,
                config, { trustScore: 0, trustTier: 0, suspicionFlags: [] });
            }
          } else {
            logger.info(`Reconcile: tx ${txId} not confirmed — rollback`);
            await rollbackReservation(budget.date, resId, grossAmount, liquidAmount, vaultAmount);
            await DailyClaim.deleteOne({ walletAddress, claimDate });
            await DailyBudget.updateOne(
              { date: budget.date, 'reservations._id': resId },
              { $set: { 'reservations.$.failureReason': `Chain tx ${txId} not confirmed` } }
            );
          }
        } catch (chainErr) {
          logger.warn(`Reconcile: chain query failed for ${txId}, skip: ${chainErr.message}`);
        }
      } else if (status === 'db_finalizing') {
        logger.info(`Reconcile: ${resId} db_finalizing — resume`);
        const claim = await DailyClaim.findOne({ walletAddress, claimDate });
        if (claim) {
          const streak = await WalletStreak.findOne({ walletAddress });
          await finalizeCappedClaim(budget.date, resId, claim._id, walletAddress, txId || 'vault-only',
            grossAmount, liquidAmount, vaultAmount, streak?.currentStreak || 0,
            config, { trustScore: 0, trustTier: 0, suspicionFlags: [] });
        }
      }
    }
  }
}

async function processVaultUnlocks(walletAddress, config) {
  const vault = await RewardVault.findOne({ walletAddress });
  if (!vault) return { locked: 0, unlockable: 0, expired: 0 };
  const now = new Date();
  let changed = false;

  for (const entry of vault.entries) {
    if (entry.status !== 'locked') continue;
    if (entry.weekEnd >= now) continue; // Window not closed yet
    const claimsInWindow = await DailyClaim.countDocuments({
      walletAddress, claimDate: { $gte: entry.weekStart, $lte: entry.weekEnd },
    });
    if (claimsInWindow >= config.weeklyUnlockRequiredDays && !config.requireMinStakeForVault) {
      entry.status = 'unlockable';
      entry.unlocked_at = now;
      vault.totalLocked -= entry.amount;
      vault.totalUnlockable += entry.amount;
      changed = true;
    } else {
      entry.status = 'expired';
      vault.totalLocked -= entry.amount;
      vault.totalExpired += entry.amount;
      changed = true;
    }
  }
  if (changed) await vault.save();
  return { locked: vault.totalLocked, unlockable: vault.totalUnlockable, expired: vault.totalExpired };
}

// ─────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────

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

    // Capped-hybrid: flat reward, no trust tier scaling
    let nextReward, estimatedReward, estimatedRewardAfterFee, dailyFeePercent, trustTier, multiplier;

    if (config.cappedHybridEnabled) {
      nextReward = config.maxGrossPerUser;
      estimatedReward = config.maxGrossPerUser;
      dailyFeePercent = 0;
      estimatedRewardAfterFee = Math.floor(config.maxGrossPerUser * config.liquidBps / 10000);
      trustTier = streak ? streak.trustTier : 0;
      multiplier = 1.0;
    } else {
      // Legacy streak-based
      const scheduleIndex = effectiveStreak % config.rewardSchedule.length;
      nextReward = config.rewardSchedule[scheduleIndex];
      trustTier = streak ? streak.trustTier : 0;
      multiplier = config.trustTierMultipliers[Math.min(trustTier, config.trustTierMultipliers.length - 1)];
      estimatedReward = Math.floor(nextReward * multiplier);
      const feeConfig = await FeeConfig.getFeeConfig();
      dailyFeePercent = feeConfig ? (feeConfig.dailyClaimFeePercent || 0) : 0;
      estimatedRewardAfterFee = Math.floor(estimatedReward * (100 - dailyFeePercent) / 100);
    }

    // Cooldown info (includes escalated cooldown for shared devices)
    let canClaim = true;
    let cooldownRemaining = 0;
    if (lastClaimAt) {
      const hoursSinceClaim = (Date.now() - lastClaimAt.getTime()) / (1000 * 60 * 60);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const latestClaim = await DailyClaim.findOne({ walletAddress: wallet }).sort({ claimDate: -1 });
      let effectiveCooldown = config.claimCooldownHours;

      if (latestClaim && latestClaim.fingerprintHash) {
        const fpDistinctWallets = await DailyClaim.distinct('walletAddress', {
          fingerprintHash: latestClaim.fingerprintHash,
          claimDate: { $gte: sevenDaysAgo },
        });
        if (fpDistinctWallets.length > 1) {
          effectiveCooldown = config.claimCooldownHours * Math.pow(2, fpDistinctWallets.length - 1);
        }
      }

      if (hoursSinceClaim < effectiveCooldown) {
        canClaim = false;
        cooldownRemaining = Math.ceil((effectiveCooldown - hoursSinceClaim) * 60);
      }
    }

    // Active position check
    let hasPosition = true;
    try {
      hasPosition = await antiSybil.hasActivePosition(wallet);
      if (!hasPosition) canClaim = false;
    } catch (err) {
      logger.warn('hasActivePosition check failed:', err.message);
    }

    const cbState = await circuitBreaker.checkCircuitBreaker(config);

    const responseData = {
      enabled: true, wallet,
      currentStreak: effectiveStreak,
      maxStreak: config.rewardSchedule.length,
      nextReward, estimatedReward, estimatedRewardAfterFee,
      feePercent: dailyFeePercent,
      trustTier, multiplier,
      canClaim, cooldownMinutes: cooldownRemaining,
      lastClaimAt, totalClaimed, totalClaims,
      rewardSchedule: config.rewardSchedule,
      circuitBreakerLevel: cbState.level,
      hasActivePosition: hasPosition,
    };

    // Add capped-hybrid fields
    if (config.cappedHybridEnabled) {
      responseData.rewardMode = 'capped-hybrid';
      responseData.liquidReward = Math.floor(config.maxGrossPerUser * config.liquidBps / 10000);
      responseData.vaultReward = config.maxGrossPerUser - responseData.liquidReward;
      const todayStr = new Date().toISOString().slice(0, 10);
      const budget = await DailyBudget.findOne({ date: todayStr });
      responseData.dailyBudget = {
        limit: config.dailyGlobalBudget,
        issued: budget?.totalGrossIssued || 0,
        remaining: config.dailyGlobalBudget - (budget?.totalGrossIssued || 0),
        claims: budget?.claimCount || 0,
      };
    }

    return res.status(200).json({ success: true, data: responseData });
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
    if (!ogAccount || !rekeyAccount) {
      logger.error('REWARD_KEYS_MISSING — claim attempt blocked');
      return res.status(503).json({ success: false, error: 'Reward service temporarily unavailable', code: 'REWARD_KEYS_MISSING' });
    }
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

    // ── CAPPED-HYBRID MODE ──────────────────────────────────
    if (config.cappedHybridEnabled) {
      return await cappedHybridClaim(wallet, ip, fingerprintHash, config, eligibility, req, res);
    }
    // ── LEGACY STREAK MODE (unchanged below) ────────────────

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

    // Record claim FIRST — unique index prevents concurrent double-claims
    const today = new Date();
    const claimDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    let claimRecord;
    try {
      claimRecord = await DailyClaim.create({
        walletAddress: wallet,
        claimDate,
        streakDay: streakDay + 1,
        baseReward,
        trustMultiplier,
        actualReward,
        txId: 'pending',
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

    // Sign and submit ASA transfer (with node fallback)
    let txId;
    try {
      const result = await withFallback(async (client) => {
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
      txId = result.txId;
    } catch (sendErr) {
      // On-chain send failed — delete the claim record so user can retry
      await DailyClaim.deleteOne({ _id: claimRecord._id });
      throw sendErr;
    }

    // Update record with real txId
    await DailyClaim.updateOne({ _id: claimRecord._id }, { $set: { txId } });

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

    // Update streak with retry
    let streakSaved = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          streak = await WalletStreak.findOne({ walletAddress: wallet });
          if (!streak) streak = new WalletStreak({ walletAddress: wallet });
        }
        streak.currentStreak = currentStreak + 1;
        streak.lastClaimAt = new Date();
        streak.totalClaimed += netReward;
        streak.totalClaims += 1;
        streak.trustScore = eligibility.trustScore;
        streak.trustTier = eligibility.trustTier;
        streak.suspicionFlags = eligibility.suspicionFlags;
        await streak.save();
        streakSaved = true;
        break;
      } catch (err) {
        logger.error(`Streak save attempt ${attempt} failed for wallet ${wallet}: ${err.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!streakSaved) {
      logger.critical(`STREAK_SAVE_FAILED permanently for wallet ${wallet} on claim date ${claimDate}`);
    }

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

    const data = {
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
      cappedHybridEnabled: config.cappedHybridEnabled,
    };

    if (config.cappedHybridEnabled) {
      data.maxGrossPerUser = config.maxGrossPerUser;
      data.liquidBps = config.liquidBps;
      data.vaultBps = config.vaultBps;
      data.dailyGlobalBudget = config.dailyGlobalBudget;
      data.weeklyUnlockRequiredDays = config.weeklyUnlockRequiredDays;
      const todayStr = new Date().toISOString().slice(0, 10);
      const budget = await DailyBudget.findOne({ date: todayStr });
      data.dailyBudget = {
        limit: config.dailyGlobalBudget,
        issued: budget?.totalGrossIssued || 0,
        remaining: config.dailyGlobalBudget - (budget?.totalGrossIssued || 0),
        claims: budget?.claimCount || 0,
      };
      const { weekStart, weekEnd } = getWeekWindow(new Date(), config.vaultWeekStartDay);
      data.currentWeekWindow = { start: weekStart, end: weekEnd };
    }

    return res.status(200).json({ success: true, data });
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

/**
 * GET /rewards/vault-status?wallet=<addr>
 */
const getVaultStatus = async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ success: false, message: 'wallet parameter required' });

    const config = await RewardsConfig.getConfig();
    if (!config.cappedHybridEnabled) {
      return res.status(200).json({ success: true, data: { enabled: false } });
    }

    await processVaultUnlocks(wallet, config);
    const vault = await RewardVault.findOne({ walletAddress: wallet });
    const { weekStart, weekEnd } = getWeekWindow(new Date(), config.vaultWeekStartDay);
    const weekCheckIns = await DailyClaim.countDocuments({
      walletAddress: wallet,
      claimDate: { $gte: weekStart, $lte: weekEnd },
      rewardMode: 'capped-hybrid',
    });

    const unlockableEntries = vault?.entries.filter(e => e.status === 'unlockable') || [];

    return res.status(200).json({
      success: true,
      data: {
        enabled: true,
        totalLocked: vault?.totalLocked || 0,
        totalUnlockable: vault?.totalUnlockable || 0,
        totalClaimed: vault?.totalClaimed || 0,
        totalExpired: vault?.totalExpired || 0,
        currentWeek: {
          start: weekStart, end: weekEnd,
          checkIns: weekCheckIns,
          requiredForUnlock: config.weeklyUnlockRequiredDays,
        },
        unlockableAmount: unlockableEntries.reduce((sum, e) => sum + e.amount, 0),
      },
    });
  } catch (err) {
    logger.error('getVaultStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /rewards/vault-claim
 */
const claimVault = async (req, res) => {
  try {
    if (!ogAccount || !rekeyAccount) {
      logger.error('REWARD_KEYS_MISSING — vault claim attempt blocked');
      return res.status(503).json({ success: false, error: 'Reward service temporarily unavailable', code: 'REWARD_KEYS_MISSING' });
    }
    const wallet = req.user.wallet;
    const { fingerprint, turnstileToken } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    const config = await RewardsConfig.getConfig();
    if (!config.cappedHybridEnabled) {
      return res.status(400).json({ success: false, message: 'Vault claims not available' });
    }

    const turnstileResult = await verifyTurnstile(turnstileToken, ip);
    if (!turnstileResult.success) {
      return res.status(403).json({ success: false, message: 'CAPTCHA verification failed' });
    }

    await processVaultUnlocks(wallet, config);
    const vault = await RewardVault.findOne({ walletAddress: wallet });
    if (!vault) return res.status(404).json({ success: false, message: 'No vault found' });

    const unlockableEntries = vault.entries.filter(e => e.status === 'unlockable');
    if (unlockableEntries.length === 0) {
      return res.status(400).json({ success: false, message: 'No unlockable vault entries' });
    }

    const totalAmount = unlockableEntries.reduce((sum, e) => sum + e.amount, 0);
    const microAmount = totalAmount * 1e6;

    let txId;
    try {
      const result = await withFallback(async (client) => {
        const params = await client.getTransactionParams().do();
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: treasuryAddr, receiver: wallet, amount: microAmount,
          assetIndex: config.fryAsaId, suggestedParams: params,
        });
        const signedTxn = txn.signTxn(signingKey);
        const { txid } = await client.sendRawTransaction(signedTxn).do();
        await algosdk.waitForConfirmation(client, txid, 4);
        return { txId: txid };
      });
      txId = result.txId;
    } catch (sendErr) {
      logger.error('Vault claim chain error:', sendErr.message);
      return res.status(500).json({ success: false, message: 'Failed to send vault claim transaction' });
    }

    for (const entry of unlockableEntries) {
      entry.status = 'claimed';
      entry.claimed_at = new Date();
      entry.tx_id = txId;
    }
    vault.totalUnlockable -= totalAmount;
    vault.totalClaimed += totalAmount;
    await vault.save();

    return res.status(200).json({
      success: true,
      message: `Claimed ${totalAmount} FRY from vault!`,
      data: { txId, amount: totalAmount, entriesClaimed: unlockableEntries.length },
    });
  } catch (err) {
    logger.error('claimVault error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to process vault claim' });
  }
};

/**
 * GET /rewards/daily-budget
 */
const getDailyBudgetStatus = async (req, res) => {
  try {
    const config = await RewardsConfig.getConfig();
    if (!config.cappedHybridEnabled) {
      return res.status(200).json({ success: true, data: { enabled: false } });
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const budget = await DailyBudget.findOne({ date: todayStr });

    return res.status(200).json({
      success: true,
      data: {
        enabled: true, date: todayStr,
        budgetLimit: config.dailyGlobalBudget,
        totalIssued: budget?.totalGrossIssued || 0,
        remaining: config.dailyGlobalBudget - (budget?.totalGrossIssued || 0),
        claimCount: budget?.claimCount || 0,
        maxPerUser: config.maxGrossPerUser,
      },
    });
  } catch (err) {
    logger.error('getDailyBudgetStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Reconciliation: run on startup (delayed) and every 5 minutes
setTimeout(async () => {
  try {
    const config = await RewardsConfig.getConfig();
    if (config.cappedHybridEnabled) {
      logger.info('Startup reconciliation: checking stale reservations');
      await reconcileStaleReservations();
    }
  } catch (err) {
    logger.error('Startup reconciliation error:', err.message);
  }
}, 10000);

setInterval(async () => {
  try {
    const config = await RewardsConfig.getConfig();
    if (config.cappedHybridEnabled) {
      await reconcileStaleReservations();
    }
  } catch (err) {
    logger.error('Reconciliation cycle error:', err.message);
  }
}, 5 * 60 * 1000);

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
  getVaultStatus,
  claimVault,
  getDailyBudgetStatus,
};
