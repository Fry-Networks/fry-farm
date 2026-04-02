const express = require("express");
const { validate, gasFeeSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  addGasFee,
  getAllGasFees,
  getGasFeesByUserId,
  getMonthlyGasFees,
  getWeeklyGasFees
} = require("../controllers/gasFeeController");

const router = express.Router();

router.post("/add", requireAuth, validate(gasFeeSchema), addGasFee);
router.get('/all', getAllGasFees);
router.get('/user/:userId', getGasFeesByUserId);
router.get('/weekly', getWeeklyGasFees);
router.get('/monthly', getMonthlyGasFees);

module.exports = router;
