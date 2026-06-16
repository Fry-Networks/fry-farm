/**
 * Event Vesting Routes
 *
 * GET  /events/:id/vesting/status?wallet=ADDRESS  (public)
 * POST /events/:id/vesting/claim                  (auth required)
 *
 * Mounted at /events alongside the existing eventRoutes; Express's router
 * fall-through means /events/:id, /events/:id/leaderboard, etc. continue to
 * be handled by the original router, while /events/:id/vesting/* falls
 * through to this one.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { algorandOnly } = require('../middleware/chainMiddleware');
const { getVestingStatus, claimVesting } = require('../controllers/vestingController');

// FRY is Algorand-only — block voi-mainnet requests
router.use(algorandOnly);

router.get('/:id/vesting/status', getVestingStatus);
router.post('/:id/vesting/claim', requireAuth, claimVesting);

module.exports = router;
