const express = require("express");
const router = express.Router();
const { validate, withdrawSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
  addWithdrawLog,
  getAllWithdrawals,
  getWithdrawalsByWallet,
  getWithdrawalsByPool
} = require("../controllers/withdrawController");

router.post("/add", requireAuth, validate(withdrawSchema), addWithdrawLog);
router.get("/all", getAllWithdrawals);
router.get("/wallet/:wallet", getWithdrawalsByWallet);
router.get("/pool/:poolId", getWithdrawalsByPool);

module.exports = router;
