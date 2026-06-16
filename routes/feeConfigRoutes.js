const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validate, feeConfigUpdateSchema } = require('../middleware/validate');
const {
  getFeeConfig,
  updateFeeConfig,
  calculatePoolCreationFee,
} = require('../controllers/feeConfigController');

const router = express.Router();

router.get('/', getFeeConfig);
router.put('/', requireAuth, requireAdmin, validate(feeConfigUpdateSchema), updateFeeConfig);
router.get('/calculate-pool-creation-fee', calculatePoolCreationFee);

module.exports = router;
