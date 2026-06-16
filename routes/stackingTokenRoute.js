const express = require('express');
const router = express.Router();
const { requireAuth, chainAwareAuth } = require('../middleware/auth');
const { requireFeePayment } = require('../middleware/requireFeePayment');

const {
  addStakingToken,
  getAllStakingTokens,
  deleteStakingToken,
  getStakingTokensByPoolId,
  getPoolTokensAndWithdrawn,
  getStakingRecordsByAppId,
  getUserStakingStats,
  getStakingTokensById,
  getStakingTokensByWallet
} = require('../controllers/stackingTokenController');

router.post('/add', chainAwareAuth, requireFeePayment('stakingDeposit', (req) => req.body.totalStaked || 0), addStakingToken);
router.get('/all', getAllStakingTokens);
router.get("/pool/:poolId", getStakingTokensByPoolId);
router.get('/tokens/:poolId', getPoolTokensAndWithdrawn);
router.get('/appId/:appId', getStakingRecordsByAppId);
router.get('/user-staking-stats/:wallet', getUserStakingStats);
router.get('/wallet/:wallet', getStakingTokensByWallet);
router.get('/:poolId', getStakingTokensById);
router.delete('/delete/:id', requireAuth, deleteStakingToken);

module.exports = router;
