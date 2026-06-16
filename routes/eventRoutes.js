const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  getActiveEvents, getAllEvents, getEventById, getLeaderboard, getUserEventPoints,
  createEvent, updateEvent, deleteEvent, activateEvent, endEvent, cancelEvent,
  addChallenge, updateChallenge, removeChallenge,
  triggerPointCalculation, triggerAirdrop, uploadBanner,
} = require('../controllers/eventController');

// Public
router.get('/active', getActiveEvents);
router.get('/', getAllEvents);

// Admin challenge routes (before /:id to avoid path conflict)
router.put('/challenges/:challengeId', requireAuth, requireAdmin, updateChallenge);
router.delete('/challenges/:challengeId', requireAuth, requireAdmin, removeChallenge);

// Public with :id
router.get('/:id', getEventById);
router.get('/:id/leaderboard', getLeaderboard);
router.get('/:id/points/:wallet', getUserEventPoints);

// Admin
router.post('/', requireAuth, requireAdmin, createEvent);
router.put('/:id', requireAuth, requireAdmin, updateEvent);
router.delete('/:id', requireAuth, requireAdmin, deleteEvent);
router.post('/:id/activate', requireAuth, requireAdmin, activateEvent);
router.post('/:id/end', requireAuth, requireAdmin, endEvent);
router.post('/:id/cancel', requireAuth, requireAdmin, cancelEvent);
router.post('/:id/challenges', requireAuth, requireAdmin, addChallenge);
router.post('/:id/calculate-points', requireAuth, requireAdmin, triggerPointCalculation);
router.post('/:id/airdrop', requireAuth, requireAdmin, triggerAirdrop);
router.post('/:id/banner', requireAuth, requireAdmin, uploadBanner);

module.exports = router;
