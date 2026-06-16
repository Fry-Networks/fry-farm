const express = require('express');
const router = express.Router();
const { validate, nftStakingPoolSchema, nftStakeSchema, nftUnstakeSchema, nftClaimSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
  getAllPools,
  getPoolByAppId,
  getPoolsByCreator,
  addPool,
  updatePool,
  getNftPrice,
} = require('../controllers/nftStakingController');

const {
  addStakedNft,
  getStakedNftsByWallet,
  getStakedNftsByPool,
  unstakeNft,
} = require('../controllers/nftStakingTokenController');

const {
  addClaim,
  getClaimsByWallet,
} = require('../controllers/nftStakingClaimController');

// Pool routes
router.get('/all', getAllPools);
router.get('/pool/:appId', getPoolByAppId);
router.get('/creator/:wallet', getPoolsByCreator);
router.post('/add', requireAuth, validate(nftStakingPoolSchema), addPool);
router.put('/update/:appId', requireAuth, updatePool);

// Stake routes
router.post('/stake', requireAuth, validate(nftStakeSchema), addStakedNft);
router.get('/stakes/wallet/:wallet', getStakedNftsByWallet);
router.get('/stakes/pool/:appId', getStakedNftsByPool);
router.post('/unstake', requireAuth, validate(nftUnstakeSchema), unstakeNft);

// Claim routes
router.post('/claim', requireAuth, validate(nftClaimSchema), addClaim);
router.get('/claims/:wallet', getClaimsByWallet);

// Oracle route
router.get('/nftprice/:asaId', getNftPrice);

module.exports = router;
