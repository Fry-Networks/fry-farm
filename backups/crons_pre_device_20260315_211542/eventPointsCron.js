const cron = require("node-cron");
const logger = require("../config/logger");
const Event = require("../models/eventSchema");
const { calculateAllActiveEvents } = require("../services/eventPointsService");
const { distributeAirdrop } = require("../services/airdropService");
const { checkAndCreateScheduledEvents } = require("../services/autoScheduleService");

cron.schedule('*/15 * * * *', async () => {
  const start = Date.now();
  logger.info('Event points cron: starting');

  try {
    // Auto-activate scheduled events whose start date has passed
    // Exclude unfunded community events from auto-activation
    const now = new Date();
    const activated = await Event.updateMany(
      {
        status: 'scheduled',
        startDate: { $lte: now },
        $or: [
          { eventType: { $ne: 'community' } },
          { eventType: 'community', fundingStatus: 'funded' },
        ],
      },
      { $set: { status: 'active' } }
    );
    if (activated.modifiedCount > 0) {
      logger.info(`Event points cron: activated ${activated.modifiedCount} scheduled events`);
    }

    // Auto-end active events whose end date has passed
    const expiredEvents = await Event.find({ status: 'active', endDate: { $lte: now } });
    for (const event of expiredEvents) {
      try {
        event.status = 'ended';
        await event.save();
        logger.info(`Event points cron: ended event "${event.name}"`);
        distributeAirdrop(event._id).catch(err => {
          logger.error(`Event points cron: airdrop error for "${event.name}":`, err);
        });
      } catch (err) {
        logger.error(`Event points cron: error ending event "${event.name}":`, err);
      }
    }

    // Calculate points for all active events
    await calculateAllActiveEvents();

    // Check for auto-scheduled events
    await checkAndCreateScheduledEvents();
  } catch (error) {
    logger.error('Event points cron: error:', error);
  }

  logger.info(`Event points cron: completed in ${Date.now() - start}ms`);
});

logger.info('Event points cron: registered (every 15 minutes)');
