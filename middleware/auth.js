const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * requireAuth — Verifies Authorization: Bearer <token> header.
 * Attaches req.user = { wallet } on success.
 */
const requireAuth = (req, res, next) => {
  // Read JWT from HttpOnly cookie (primary) or Authorization header (fallback)
  let token = req.cookies?.fry_token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    logger.warn(`Auth missing: ${req.method} ${req.path} — cookie=${!!req.cookies?.fry_token}, authHeader=${!!req.headers.authorization}`);
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { wallet: decoded.wallet };
    next();
  } catch (err) {
    // Clear stale cookie
    res.clearCookie('fry_token', { domain: 'fry.farm', path: '/' });
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/**
 * checkIsAdmin — Returns true if the given wallet is in the admin list.
 * Checks ADMIN_WALLETS env var AND rewardsConfig.adminWallets from DB.
 */
async function checkIsAdmin(wallet) {
  const adminWallets = (process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  if (adminWallets.includes(wallet)) return true;

  try {
    const RewardsConfig = require('../models/rewardsConfigSchema');
    const config = await RewardsConfig.getConfig();
    if (config.adminWallets && config.adminWallets.includes(wallet)) return true;
  } catch (_err) {
    // DB check failed, fall through
  }

  return false;
}

/**
 * requireAdmin — Must be used AFTER requireAuth.
 * Checks req.user.wallet against ADMIN_WALLETS env var AND rewardsConfig.adminWallets from DB.
 */
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  if (await checkIsAdmin(req.user.wallet)) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Admin access required' });
};

/**
 * requireRewardsAdmin — Must be used AFTER requireAuth.
 * Checks req.user.wallet against ADMIN_WALLETS env var AND rewardsConfig.adminWallets from DB.
 */
const requireRewardsAdmin = async (req, res, next) => {
  const envAdmins = (process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Check env-based admin list first
  if (envAdmins.includes(req.user.wallet)) {
    return next();
  }

  // Check DB-based rewards admin list
  try {
    const RewardsConfig = require('../models/rewardsConfigSchema');
    const config = await RewardsConfig.getConfig();
    if (config.adminWallets && config.adminWallets.includes(req.user.wallet)) {
      return next();
    }
  } catch (err) {
    logger.error('Error checking rewards admin:', err.message);
  }

  return res.status(403).json({ success: false, message: 'Rewards admin access required' });
};

/**
 * chainAwareAuth — For Algorand: requires JWT. For Voi: passes through
 * (payment transaction serves as authentication on Voi).
 */
const chainAwareAuth = (req, res, next) => {
  // All chains use JWT auth — Voi and Algorand both go through nonce/verify flow
  return requireAuth(req, res, next);
};

module.exports = { requireAuth, requireAdmin, requireRewardsAdmin, checkIsAdmin, chainAwareAuth };
