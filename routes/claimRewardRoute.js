const express = require('express');
const router = express.Router();
const { validate, claimRewardSchema } = require('../middleware/validate');
const { chainAwareAuth } = require('../middleware/auth');
const { requireFeePayment } = require('../middleware/requireFeePayment');

const {
  addClaimReward,
  getAllClaimRewards,
  getClaimRewardsByWallet,
  getClaimRewardsByPool,
} = require('../controllers/claimRewardController');

router.post('/add', chainAwareAuth, requireFeePayment('stakingClaim', (req) => req.body.rewardClaimed || 0), validate(claimRewardSchema), addClaimReward);
router.get('/all', getAllClaimRewards);
router.get('/wallet/:walletId', getClaimRewardsByWallet);
router.get('/pool/:poolId', getClaimRewardsByPool);

module.exports = router;
