const express = require('express');
const router = express.Router();
const { chainAwareAuth } = require('../middleware/auth');
const { getClaimStatus, claimReward, claimAndWithdraw } = require('../controllers/stakingClaimController');

// Read-only status check (no auth required)
router.get('/:appId/status', getClaimStatus);

// Claim rewards (auth required)
router.post('/:appId/claim', chainAwareAuth, claimReward);

// Claim + prepare withdraw (auth required)
router.post('/:appId/claim-and-withdraw', chainAwareAuth, claimAndWithdraw);

module.exports = router;
