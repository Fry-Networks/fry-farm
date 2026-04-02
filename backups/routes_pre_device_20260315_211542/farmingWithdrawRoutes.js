const express = require("express");
const router = express.Router();
const { validate, farmingWithdrawSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
  addFarmingWithdrawLog,
  getAllFarmingWithdrawals,
  getFarmingWithdrawalsByWallet,
  getFarmingWithdrawalsByPool
} = require("../controllers/farmingWithdrawController");

router.post("/add", requireAuth, validate(farmingWithdrawSchema), addFarmingWithdrawLog);
router.get("/all", getAllFarmingWithdrawals);
router.get("/wallet/:wallet", getFarmingWithdrawalsByWallet);
router.get("/pool/:poolId", getFarmingWithdrawalsByPool);

module.exports = router;
