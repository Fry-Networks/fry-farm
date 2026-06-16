const express = require('express');
const router = express.Router();
const { algorandOnly } = require('../middleware/chainMiddleware');
const {
  proxyFolksQuote,
  proxyFolksPrepare,
  proxyVestigeQuote,
  proxyVestigeTransactions,
  proxyDeflexQuote,
  proxyHaystackQuote,
  proxyHaystackPrepare,
  proxyDeflexTransactions,
} = require('../controllers/swapProxyController');

// All swap proxy routes are Algorand-only (Folks, Vestige, Deflex)
router.use(algorandOnly);

// FolksRouter
router.get('/folks/quote', proxyFolksQuote);
router.post('/folks/prepare', proxyFolksPrepare);

// Vestige
router.get('/vestige/quote', proxyVestigeQuote);
router.post('/vestige/transactions', proxyVestigeTransactions);

// Deflex
// Haystack Router
router.get('/haystack/quote', proxyHaystackQuote);
router.post('/haystack/prepare', proxyHaystackPrepare);
router.post('/deflex/quote', proxyDeflexQuote);
router.post('/deflex/transactions', proxyDeflexTransactions);

module.exports = router;
