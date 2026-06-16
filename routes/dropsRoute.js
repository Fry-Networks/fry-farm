const express = require('express');
const router = express.Router();
const { algorandOnly } = require('../middleware/chainMiddleware');
const { getStats, getDrops, getDropDetail, checkEligibility } = require('../controllers/dropsController');

router.use(algorandOnly);

router.get('/stats', getStats);
router.get('/drops', getDrops);
router.get('/:dropId', getDropDetail);
router.get('/:dropId/eligible', checkEligibility);

module.exports = router;
