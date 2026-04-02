const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  validate,
  alphaArcadePoolSchema,
  alphaArcadePoolUpdateSchema,
  alphaArcadeBuildDepositSchema,
  alphaArcadeBuildWithdrawSchema,
  alphaArcadeRecordDepositSchema,
  alphaArcadeRecordWithdrawSchema,
} = require('../middleware/validate');

const {
  getMarkets,
  getRewardMarkets,
  getMarketDetail,
  getOrderbook,
  getAllPools,
  getPoolById,
  createPool,
  updatePool,
  buildDeposit,
  buildWithdraw,
  recordDeposit,
  recordWithdraw,
  getPositionsByWallet,
  getPositionByWalletAndPool,
  adminCheckResolutions,
  getStats,
  getPlatformStats,
} = require('../controllers/alphaArcadeController');

// Stats routes
router.get('/stats', getStats);

// Market data routes (public)
router.get('/markets/rewards', getRewardMarkets);
router.get('/markets/:marketAppId', getMarketDetail);
router.get('/markets', getMarkets);
router.get('/orderbook/:marketAppId', getOrderbook);

// Pool routes
router.get('/pools', getAllPools);
router.get('/pool/:poolId', getPoolById);
router.post('/pool/create', requireAuth, requireAdmin, validate(alphaArcadePoolSchema), createPool);
router.put('/pool/update/:poolId', requireAuth, requireAdmin, validate(alphaArcadePoolUpdateSchema), updatePool);

// Transaction build routes (authenticated)
router.post('/build-deposit', requireAuth, validate(alphaArcadeBuildDepositSchema), buildDeposit);
router.post('/build-withdraw', requireAuth, validate(alphaArcadeBuildWithdrawSchema), buildWithdraw);

// Record routes (authenticated)
router.post('/record-deposit', requireAuth, validate(alphaArcadeRecordDepositSchema), recordDeposit);
router.post('/record-withdraw', requireAuth, validate(alphaArcadeRecordWithdrawSchema), recordWithdraw);

// Admin routes
router.get('/admin/platform-stats', requireAuth, requireAdmin, getPlatformStats);
router.post('/admin/check-resolutions', requireAuth, requireAdmin, adminCheckResolutions);

// Position routes (public)
router.get('/positions/:wallet', getPositionsByWallet);
router.get('/position/:wallet/:poolId', getPositionByWalletAndPool);

module.exports = router;
