const express = require("express");
const router = express.Router();
const { validate, farmingWithdrawSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireFeePayment } = require('../middleware/requireFeePayment');

const {
  addFarmingWithdrawLog,
  getAllFarmingWithdrawals,
  getFarmingWithdrawalsByWallet,
  getFarmingWithdrawalsByPool
} = require("../controllers/farmingWithdrawController");

router.post("/add", requireAuth, requireFeePayment('farmingWithdraw', (req) => Math.floor((req.body.amount || 0) * 1_000_000)), validate(farmingWithdrawSchema), addFarmingWithdrawLog);
router.get("/all", getAllFarmingWithdrawals);
router.get("/wallet/:wallet", getFarmingWithdrawalsByWallet);
router.get("/pool/:poolId", getFarmingWithdrawalsByPool);

module.exports = router;
