const express = require('express');
const router = express.Router();
const {
  lookupAsaById,
  searchTokensByName,
  discoverLpTokens,
  getTokenPrice,
  verifyNftOwnership,
  lookupNftCollection,
} = require('../controllers/tokenDiscoveryController');

// All endpoints are public (read-only discovery)
router.get('/asa/:asaId', lookupAsaById);
router.get('/search', searchTokensByName);
router.get('/lp-discover', discoverLpTokens);
router.get('/price/:asaId', getTokenPrice);
router.get('/verify-nft', verifyNftOwnership);
router.get('/nft-collection', lookupNftCollection);

module.exports = router;
