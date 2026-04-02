const express = require('express');
const router = express.Router();
const { validate, claimFarmRewardSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
  addClaimFarmReward,
  getAllClaimFarmRewards,
  getClaimFarmRewardsByWallet,
  getClaimFarmRewardsByPool,
} = require('../controllers/claimFarmRewardController');

router.post('/add', requireAuth, validate(claimFarmRewardSchema), addClaimFarmReward);
router.get('/all', getAllClaimFarmRewards);
router.get('/wallet/:walletId', getClaimFarmRewardsByWallet);
router.get('/pool/:poolId', getClaimFarmRewardsByPool);

module.exports = router;
