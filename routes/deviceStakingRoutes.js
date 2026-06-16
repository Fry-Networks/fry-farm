const express = require('express');
const router = express.Router();
const { validate, createDevicePoolSchema, stakeDeviceSchema, createAnnouncementSchema, linkWalletSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  createPool,
  getAllPools,
  getPool,
  getPoolsByCreator,
  updatePool,
  stakeDevice,
  unstakeDevice,
  claimRewards,
  getPositionsByWallet,
  getPositionsByPool,
  checkRequirementsEndpoint,
  createAnnouncement,
  getAnnouncements,
  markAnnouncementRead,
  getCreatorAnalytics,
  linkWallet,
  getLinkedWallets,
} = require('../controllers/devicePoolController');

// Pool routes
router.get('/all', getAllPools);
router.get('/pool/:appId', getPool);
router.get('/creator/:wallet', getPoolsByCreator);
router.post('/add', requireAuth, validate(createDevicePoolSchema), createPool);
router.put('/update/:appId', requireAuth, updatePool);

// Stake routes
router.post('/stake', requireAuth, validate(stakeDeviceSchema), stakeDevice);
router.post('/unstake', requireAuth, unstakeDevice);
router.post('/claim', requireAuth, claimRewards);
router.get('/stakes/wallet/:wallet', getPositionsByWallet);
router.get('/stakes/pool/:appId', getPositionsByPool);

// Requirements check
router.get('/pool/:appId/check/:wallet', checkRequirementsEndpoint);

// Announcements
router.post('/pool/:appId/announcements', requireAuth, validate(createAnnouncementSchema), createAnnouncement);
router.get('/pool/:appId/announcements', getAnnouncements);
router.post('/announcements/:id/read', requireAuth, markAnnouncementRead);

// Analytics
router.get('/pool/:appId/analytics', requireAuth, getCreatorAnalytics);

// Wallet links
router.post('/wallet-links', requireAuth, validate(linkWalletSchema), linkWallet);
router.get('/wallet-links/:wallet', getLinkedWallets);

module.exports = router;
