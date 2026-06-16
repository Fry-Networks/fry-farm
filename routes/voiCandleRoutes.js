const express = require('express');
const router = express.Router();
const { getCandles } = require('../controllers/voiCandleController');

router.get('/', getCandles);

module.exports = router;
