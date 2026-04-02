const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validate, communityEventCreateSchema, communityEventUpdateSchema, communityEventConfirmSchema } = require('../middleware/validate');
const { getEventById, getLeaderboard, getUserEventPoints } = require('../controllers/eventController');
const {
  getCommunityEvents,
  createCommunityEvent,
  buildFunding,
  confirmFunding,
  updateCommunityEvent,
  cancelCommunityEvent,
  getMyCommunityEvents,
  uploadCommunityBanner,
  hideCommunityEvent,
  adminCancelCommunityEvent,
  addCommunityChallenge,
  updateCommunityChallenge,
  removeCommunityChallenge,
} = require('../controllers/communityEventController');

// Public
router.get('/', getCommunityEvents);

// Authenticated (before /:id to avoid param capture)
router.get('/mine', requireAuth, getMyCommunityEvents);
router.put('/challenges/:challengeId', requireAuth, updateCommunityChallenge);
router.delete('/challenges/:challengeId', requireAuth, removeCommunityChallenge);

// Public with :id (reuse from eventController)
router.get('/:id', getEventById);
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/points/:wallet', getUserEventPoints);

// Authenticated with :id
router.post('/', requireAuth, validate(communityEventCreateSchema), createCommunityEvent);
router.put('/:id', requireAuth, validate(communityEventUpdateSchema), updateCommunityEvent);
router.post('/:id/fund', requireAuth, buildFunding);
router.post('/:id/confirm-funding', requireAuth, validate(communityEventConfirmSchema), confirmFunding);
router.post('/:id/cancel', requireAuth, cancelCommunityEvent);
router.post('/:id/challenges', requireAuth, addCommunityChallenge);
router.post('/:id/banner', requireAuth, uploadCommunityBanner);

// Admin
router.put('/:id/hide', requireAuth, requireAdmin, hideCommunityEvent);
router.post('/:id/admin-cancel', requireAuth, requireAdmin, adminCancelCommunityEvent);

module.exports = router;
