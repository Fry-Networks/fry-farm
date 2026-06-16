const express = require("express");
const router = express.Router();
const { chainAwareAuth } = require("../middleware/auth");
const {
  getPrices,
  analyzePool,
  analyzePortfolio,
  analyzeSwap,
} = require("../controllers/aiController");

router.get("/prices", getPrices);
router.post("/analyze-pool", chainAwareAuth, analyzePool);
router.post("/analyze-portfolio", chainAwareAuth, analyzePortfolio);
router.post("/analyze-swap", chainAwareAuth, analyzeSwap);

module.exports = router;
