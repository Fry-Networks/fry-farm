const express = require('express');
const router = express.Router();
const { requireAuth, requireRewardsAdmin } = require('../middleware/auth');
const { validate, dailyRewardClaimSchema, rewardsConfigUpdateSchema, adminBanSchema } = require('../middleware/validate');
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
} = require('../controllers/rewardsController');

// Public routes
router.get('/status', getRewardsStatus);
router.get('/config', getRewardsConfig);
router.get('/leaderboard', getLeaderboard);
router.post('/claim', requireAuth, validate(dailyRewardClaimSchema), claimReward);

// Admin routes
router.put('/config', requireAuth, requireRewardsAdmin, validate(rewardsConfigUpdateSchema), updateRewardsConfig);
router.post('/admin/pause', requireAuth, requireRewardsAdmin, adminPause);
router.post('/admin/resume', requireAuth, requireRewardsAdmin, adminResume);
router.post('/admin/ban', requireAuth, requireRewardsAdmin, validate(adminBanSchema), adminBanWallet);
router.post('/admin/unban', requireAuth, requireRewardsAdmin, validate(adminBanSchema), adminUnbanWallet);

module.exports = router;
