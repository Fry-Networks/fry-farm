const express = require("express");
const { validate, gasFeeSchema } = require('../middleware/validate');
const { chainAwareAuth } = require('../middleware/auth');
const {
  addGasFee,
  getAllGasFees,
  getGasFeesByUserId,
  getMonthlyGasFees,
  getWeeklyGasFees
} = require("../controllers/gasFeeController");

const router = express.Router();

router.post("/add", chainAwareAuth, validate(gasFeeSchema), addGasFee);
router.get('/all', getAllGasFees);
router.get('/user/:userId', getGasFeesByUserId);
router.get('/weekly', getWeeklyGasFees);
router.get('/monthly', getMonthlyGasFees);

module.exports = router;
