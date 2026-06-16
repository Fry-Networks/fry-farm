const express = require("express");
const router = express.Router();
const { validate, withdrawSchema } = require('../middleware/validate');
const { chainAwareAuth } = require('../middleware/auth');
const { requireFeePayment } = require('../middleware/requireFeePayment');

const {
  addWithdrawLog,
  getAllWithdrawals,
  getWithdrawalsByWallet,
  getWithdrawalsByPool
} = require("../controllers/withdrawController");

router.post("/add", chainAwareAuth, requireFeePayment('stakingWithdraw', (req) => Math.floor((req.body.tokens || 0) * 1_000_000)), validate(withdrawSchema), addWithdrawLog);
router.get("/all", getAllWithdrawals);
router.get("/wallet/:wallet", getWithdrawalsByWallet);
router.get("/pool/:poolId", getWithdrawalsByPool);

module.exports = router;
