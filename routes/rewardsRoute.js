const express = require('express');
const router = express.Router();
const { requireAuth, requireRewardsAdmin } = require('../middleware/auth');
const { algorandOnly } = require('../middleware/chainMiddleware');
const { validate, dailyRewardClaimSchema, rewardsConfigUpdateSchema, adminBanSchema, vaultClaimSchema } = require('../middleware/validate');
const {
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
} = require('../controllers/rewardsController');

// All reward routes are Algorand-only (FRY token)
router.use(algorandOnly);

// Public routes
router.get('/status', getRewardsStatus);
router.get('/config', getRewardsConfig);
router.get('/leaderboard', getLeaderboard);
router.post('/claim', requireAuth, validate(dailyRewardClaimSchema), claimReward);

// Capped-hybrid routes
router.get('/vault-status', getVaultStatus);
router.post('/vault-claim', requireAuth, validate(vaultClaimSchema), claimVault);
router.get('/daily-budget', getDailyBudgetStatus);

// Admin routes
router.put('/config', requireAuth, requireRewardsAdmin, validate(rewardsConfigUpdateSchema), updateRewardsConfig);
router.post('/admin/pause', requireAuth, requireRewardsAdmin, adminPause);
router.post('/admin/resume', requireAuth, requireRewardsAdmin, adminResume);
router.post('/admin/ban', requireAuth, requireRewardsAdmin, validate(adminBanSchema), adminBanWallet);
router.post('/admin/unban', requireAuth, requireRewardsAdmin, validate(adminBanSchema), adminUnbanWallet);

module.exports = router;
