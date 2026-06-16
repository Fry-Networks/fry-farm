/**
 * Vesting Controller
 *
 * GET  /events/:id/vesting/status?wallet=ADDRESS  (public)
 * POST /events/:id/vesting/claim                  (auth required)
 *
 * Concurrency: optimistic locking on EventPoints.vestingClaimed.
 * No MongoDB transactions (standalone Mongo, not a replica set).
 */

const mongoose = require('mongoose');
const Event = require('../models/eventSchema');
const EventPoints = require('../models/eventPointsSchema');
const vestingService = require('../services/vestingService');
const logger = require('../config/logger');

const ALGO_ADDR_RE = /^[A-Z2-7]{58}$/;

/**
 * GET /events/:id/vesting/status?wallet=ADDRESS
 */
const getVestingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, message: 'wallet query parameter required' });
    }
    if (!ALGO_ADDR_RE.test(wallet)) {
      return res.status(400).json({ success: false, message: 'Invalid wallet address format' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid event ID format' });
    }

    const eventId = new mongoose.Types.ObjectId(id);
    const event = await Event.findById(eventId).lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    if (!event.vesting || !event.vesting.enabled) {
      return res.status(200).json({
        success: true,
        data: { enabled: false, message: 'Vesting not enabled for this event' },
      });
    }

    const eventPoints = await EventPoints.findOne({ eventId, wallet }).lean();
    if (!eventPoints) {
      return res.status(200).json({
        success: true,
        data: { enabled: true, qualified: false, message: 'Wallet not found in event participants' },
      });
    }

    const status = vestingService.getVestingStatus({ event, eventPoints });
    return res.status(200).json({ success: true, data: status });
  } catch (err) {
    logger.error('getVestingStatus error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /events/:id/vesting/claim
 *
 * Concurrency: optimistic-lock pattern on the EventPoints document.
 * 1. Read current vestingClaimed (oldClaimed)
 * 2. Compute claimable based on oldClaimed
 * 3. findOneAndUpdate with filter { vestingClaimed: oldClaimed } — atomic CAS
 * 4. If update succeeded, send chain TX
 * 5. On chain failure, decrement back (best-effort rollback)
 * 6. On chain success, persist txId
 */
const claimVesting = async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = req.user.wallet;  // requireAuth guarantees this

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid event ID format' });
    }
    const eventId = new mongoose.Types.ObjectId(id);

    const event = await Event.findById(eventId).lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (!event.vesting || !event.vesting.enabled) {
      return res.status(400).json({ success: false, message: 'Vesting not enabled for this event' });
    }

    const eventPoints = await EventPoints.findOne({ eventId, wallet }).lean();
    if (!eventPoints) {
      return res.status(404).json({ success: false, message: 'Wallet not found in event participants' });
    }

    const totalAllocation = eventPoints.vestingAllocation || 0;
    const oldClaimed = eventPoints.vestingClaimed || 0;

    if (totalAllocation === 0) {
      return res.status(400).json({ success: false, message: 'No vesting allocation for this wallet' });
    }

    const { claimableAmount, vestedAmount } = vestingService.computeClaimable({
      totalAllocation,
      alreadyClaimed: oldClaimed,
      vestingStartDate: event.vesting.startDate,
      durationDays: event.vesting.durationDays,
    });

    if (claimableAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No tokens available to claim',
        data: { vestedAmount, claimedAmount: oldClaimed, claimableAmount: 0 },
      });
    }

    // Optimistic lock: atomic CAS on vestingClaimed
    const updated = await EventPoints.findOneAndUpdate(
      { _id: eventPoints._id, vestingClaimed: oldClaimed },
      {
        $inc: { vestingClaimed: claimableAmount, vestingClaimCount: 1 },
        $set: { vestingLastClaimAt: new Date() },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: 'Concurrent claim detected, please retry',
      });
    }

    // Send chain TX
    let txId;
    try {
      const sendResult = await vestingService.sendVestedTokens(
        wallet,
        claimableAmount,
        event.vesting.rewardAsaId
      );
      txId = sendResult.txId;
    } catch (chainErr) {
      // Best-effort rollback
      logger.error('Vesting chain send failed, rolling back increment:', chainErr.message);
      await EventPoints.updateOne(
        { _id: eventPoints._id },
        {
          $inc: { vestingClaimed: -claimableAmount, vestingClaimCount: -1 },
          $set: { vestingLastClaimAt: eventPoints.vestingLastClaimAt || null },
        }
      ).catch(rbErr => logger.error('Rollback failed:', rbErr.message));

      return res.status(500).json({
        success: false,
        message: 'Blockchain transaction failed',
        details: chainErr.message,
      });
    }

    // Persist txId
    await EventPoints.updateOne(
      { _id: eventPoints._id },
      { $set: { vestingLastClaimTxId: txId } }
    );

    const newClaimedTotal = oldClaimed + claimableAmount;
    const remainingAllocation = totalAllocation - newClaimedTotal;

    logger.info(`Vesting claim success: ${wallet} claimed ${claimableAmount} microFRY, txId: ${txId}`);

    return res.status(200).json({
      success: true,
      message: 'Claim successful',
      data: {
        txId,
        claimedAmount: claimableAmount,
        newClaimedTotal,
        remainingAllocation,
        isFullyVested: remainingAllocation === 0,
      },
    });
  } catch (err) {
    logger.error('claimVesting error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getVestingStatus, claimVesting };
