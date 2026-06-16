const express = require('express');
const router = express.Router();
const { chainAwareAuth } = require('../middleware/auth');
const {
  validate,
  p2pMarketCreateSchema,
  p2pOfferCreateSchema,
  p2pOfferAcceptSchema,
  p2pOfferCancelSchema,
} = require('../middleware/validate');
const { requireFeePayment } = require('../middleware/requireFeePayment');
const {
  getMarkets,
  getMarketDetail,
  getMarketStats,
  getMarketTrades,
  getOffers,
  getOffer,
  getMyOffers,
  getHistory,
  getReputation,
  createMarket,
  createOffer,
  acceptOffer,
  cancelOffer,
} = require('../controllers/p2pController');

// Public read routes
router.get('/markets', getMarkets);
router.get('/markets/:appId', getMarketDetail);
router.get('/markets/:appId/stats', getMarketStats);
router.get('/markets/:appId/trades', getMarketTrades);
router.get('/offers', getOffers);
router.get('/offers/:chainId/:marketAppId/:offerId', getOffer);
router.get('/reputation/:walletAddress', getReputation);

// Authenticated read routes (must come before parameterized routes)
router.get('/my-offers', chainAwareAuth, getMyOffers);
router.get('/history', chainAwareAuth, getHistory);

// Authenticated write routes
router.post('/markets', chainAwareAuth, validate(p2pMarketCreateSchema), createMarket);

router.post('/offers',
  chainAwareAuth,
  validate(p2pOfferCreateSchema),
  requireFeePayment('p2pCreate', (req) => Number(req.body.offerAmount)),
  createOffer
);

router.post('/offers/:offerId/accept',
  chainAwareAuth,
  validate(p2pOfferAcceptSchema),
  requireFeePayment('p2pAccept', (req) => req.body.requestAmount),
  acceptOffer
);

router.post('/offers/:offerId/cancel',
  chainAwareAuth,
  validate(p2pOfferCancelSchema),
  cancelOffer
);

module.exports = router;
