const logger = require('../config/logger');
const P2POffer = require('../models/p2pOfferSchema');
const { readOfferBox, STATUS_OPEN, STATUS_FILLED, STATUS_CANCELLED } = require('./p2pVerificationService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sweep expired offers: find open offers past their expiry and mark them expired.
 * Pure MongoDB operation — no on-chain reads.
 *
 * @returns {Promise<{expired: number}>}
 */
async function sweepExpiredOffers() {
  const result = await P2POffer.updateMany(
    {
      status: 'open',
      expiresAt: { $ne: null, $lt: new Date() },
    },
    { $set: { status: 'expired' } }
  );

  return { expired: result.modifiedCount };
}

/**
 * Verify a sample of the oldest open offers against on-chain state.
 * If the on-chain box shows filled or cancelled but our DB still says open,
 * update MongoDB to match.
 *
 * @param {number} [sampleSize=20] - Max offers to check per run
 * @returns {Promise<{total: number, synced: number, skipped: number, errors: number}>}
 */
async function verifyOpenOffers(sampleSize = 20) {
  const offers = await P2POffer.find({ status: 'open' })
    .sort({ createdAt: 1 })
    .limit(sampleSize)
    .lean();

  const stats = { total: offers.length, synced: 0, skipped: 0, errors: 0 };

  for (const offer of offers) {
    try {
      const onChain = await readOfferBox(offer.chainId, offer.marketAppId, offer.offerId);

      if (onChain.status === STATUS_FILLED) {
        await P2POffer.updateOne(
          { _id: offer._id, status: 'open' },
          { $set: { status: 'filled', settledAt: new Date() } }
        );
        stats.synced++;
        logger.info(
          `P2P sync: offer ${offer.offerId} in market ${offer.marketAppId} marked filled (on-chain mismatch)`
        );
      } else if (onChain.status === STATUS_CANCELLED) {
        await P2POffer.updateOne(
          { _id: offer._id, status: 'open' },
          { $set: { status: 'cancelled', cancelledAt: new Date() } }
        );
        stats.synced++;
        logger.info(
          `P2P sync: offer ${offer.offerId} in market ${offer.marketAppId} marked cancelled (on-chain mismatch)`
        );
      } else {
        stats.skipped++;
      }

      // Throttle to avoid hammering algod
      await sleep(200);
    } catch (err) {
      // Box not found could mean offer was deleted on-chain (cancelled/filled and box cleared)
      if (err.message && err.message.includes('box not found')) {
        await P2POffer.updateOne(
          { _id: offer._id, status: 'open' },
          { $set: { status: 'cancelled', cancelledAt: new Date() } }
        );
        stats.synced++;
        logger.info(
          `P2P sync: offer ${offer.offerId} in market ${offer.marketAppId} box deleted — marked cancelled`
        );
      } else {
        stats.errors++;
        logger.warn(
          `P2P sync: failed to verify offer ${offer.offerId} in market ${offer.marketAppId}: ${err.message}`
        );
      }
    }
  }

  return stats;
}

/**
 * Run all P2P sync tasks: expire sweep + open offer verification.
 *
 * @returns {Promise<{total: number, synced: number, skipped: number, errors: number, expired: number}>}
 */
async function syncAllP2POffers() {
  const expireResult = await sweepExpiredOffers();
  const verifyResult = await verifyOpenOffers();

  return {
    ...verifyResult,
    expired: expireResult.expired,
  };
}

module.exports = { sweepExpiredOffers, verifyOpenOffers, syncAllP2POffers };
