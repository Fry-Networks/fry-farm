const logger = require("../config/logger");
const redis = require('../config/redis');
const CircuitBreakerState = require('../models/circuitBreakerStateSchema');

/**
 * Check and update circuit breaker state
 */
async function checkCircuitBreaker(config) {
  const state = await CircuitBreakerState.getState();
  const now = new Date();

  // Reset hourly counter if expired
  if (now >= state.hourResetAt) {
    state.claimsThisHour = 0;
    state.suspiciousClaimsThisHour = 0;
    state.hourResetAt = new Date(now.getTime() + 60 * 60 * 1000);
  }

  // Reset daily counter if expired
  if (now >= state.dayResetAt) {
    state.claimsToday = 0;
    state.dayResetAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  // Check manual pause
  if (state.manualPause) {
    await state.save();
    return { allowed: false, level: 'red', reason: `Manual pause: ${state.manualPauseReason || 'No reason'}`, state };
  }

  // Check daily auto-cap
  if (state.claimsToday >= config.maxDailyClaimsAutoCap) {
    state.currentLevel = 'red';
    await state.save();
    return { allowed: false, level: 'red', reason: 'Daily claims cap reached', state };
  }

  // Determine level from hourly claims vs baseline
  const baseline = config.baselineClaimsPerHour;
  let newLevel = 'green';

  if (state.claimsThisHour >= baseline * config.redMultiplier) {
    newLevel = 'red';
  } else if (state.claimsThisHour >= baseline * config.orangeMultiplier) {
    newLevel = 'orange';
  } else if (state.claimsThisHour >= baseline * config.yellowMultiplier) {
    newLevel = 'yellow';
  }

  // Escalate if suspicious claims are high
  if (state.suspiciousClaimsThisHour >= baseline * 0.5 && newLevel === 'green') {
    newLevel = 'yellow';
  }

  const previousLevel = state.currentLevel;
  state.currentLevel = newLevel;
  await state.save();

  // Send alert if level changed or escalated
  if (newLevel !== 'green' && newLevel !== previousLevel) {
    sendAlert(newLevel, {
      claimsThisHour: state.claimsThisHour,
      suspiciousThisHour: state.suspiciousClaimsThisHour,
      claimsToday: state.claimsToday,
      baseline,
    }, config).catch(err => logger.error('Alert send error:', err.message));
  }

  const allowed = newLevel !== 'red';
  return { allowed, level: newLevel, state };
}

/**
 * Record a claim in circuit breaker counters
 */
async function recordClaim(isSuspicious, config) {
  const state = await CircuitBreakerState.getState();
  state.claimsThisHour += 1;
  state.claimsToday += 1;
  if (isSuspicious) state.suspiciousClaimsThisHour += 1;
  await state.save();
}

/**
 * Check if a trust tier is allowed at a given circuit breaker level
 */
function checkLevelRestriction(level, trustTier) {
  switch (level) {
    case 'green':
      return { allowed: true };
    case 'yellow':
      // Tier 0 gets 10% pass rate
      if (trustTier === 0) {
        return { allowed: Math.random() < 0.1, reason: 'Yellow alert: low trust tier throttled' };
      }
      return { allowed: true };
    case 'orange':
      // Only tier 2 and 3
      if (trustTier < 2) {
        return { allowed: false, reason: 'Orange alert: only high trust wallets allowed' };
      }
      return { allowed: true };
    case 'red':
      return { allowed: false, reason: 'Red alert: all claims paused' };
    default:
      return { allowed: true };
  }
}

/**
 * Send alert to Discord webhook with cooldown
 */
async function sendAlert(level, details, config) {
  const webhookUrl = config.alertWebhookUrl || process.env.DISCORD_BUG_WEBHOOK_URL;
  if (!webhookUrl) return;

  // Cooldown: 5min yellow, 1min orange, immediate red
  const cooldownsSec = { yellow: 300, orange: 60, red: 0 };
  const cooldown = cooldownsSec[level] || 0;

  if (cooldown > 0) {
    const key = `cb:alert:${level}`;
    const exists = await redis.get(key);
    if (exists) return;
    await redis.set(key, '1', 'EX', cooldown);
  }

  const colors = { yellow: 0xFFFF00, orange: 0xFF8C00, red: 0xFF0000 };

  const embed = {
    embeds: [{
      title: `Circuit Breaker: ${level.toUpperCase()}`,
      color: colors[level] || 0,
      fields: [
        { name: 'Claims This Hour', value: String(details.claimsThisHour), inline: true },
        { name: 'Suspicious This Hour', value: String(details.suspiciousThisHour), inline: true },
        { name: 'Claims Today', value: String(details.claimsToday), inline: true },
        { name: 'Baseline/hr', value: String(details.baseline), inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });
  } catch (err) {
    logger.error('Discord webhook error:', err.message);
  }
}

/**
 * Manual pause control
 */
async function setPause(paused, reason, config) {
  const state = await CircuitBreakerState.getState();
  state.manualPause = paused;
  state.manualPauseReason = reason || '';
  if (paused) state.currentLevel = 'red';
  else state.currentLevel = 'green';
  await state.save();

  const webhookUrl = config.alertWebhookUrl || process.env.DISCORD_BUG_WEBHOOK_URL;
  if (webhookUrl) {
    const action = paused ? 'PAUSED' : 'RESUMED';
    sendAlert('red', {
      claimsThisHour: state.claimsThisHour,
      suspiciousThisHour: state.suspiciousClaimsThisHour,
      claimsToday: state.claimsToday,
      baseline: config.baselineClaimsPerHour,
      action,
      reason,
    }, config).catch(err => logger.error('Pause alert error:', err.message));
  }

  return state;
}

module.exports = { checkCircuitBreaker, recordClaim, checkLevelRestriction, sendAlert, setPause };
