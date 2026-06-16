const express = require('express');
const router = express.Router();
const { algorandOnly } = require('../middleware/chainMiddleware');
const { getStats, getTokens, getTokenDetail } = require('../controllers/launchesController');

router.use(algorandOnly);

router.get('/stats', getStats);
router.get('/tokens', getTokens);
router.get('/tokens/:asaId', getTokenDetail);

module.exports = router;
