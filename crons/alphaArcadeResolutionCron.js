const cron = require('node-cron');
const logger = require('../config/logger');
const AlphaArcadePosition = require('../models/alphaArcadePositionSchema');
const AlphaArcadePool = require('../models/alphaArcadePoolSchema');
const { getResolutionTime, getMarketOutcome } = require('../services/alphaArcadeService');
const {
  sendResolutionWarning,
  sendPositionResolved,
  sendCronSummary,
} = require('../services/discordAlphaArcadeNotifier');

const MAX_NOTIFICATIONS_PER_RUN = 10;

/**
 * Core resolution check logic — exported for admin endpoint.
 */
async function checkResolutions() {
  const start = Date.now();
  const stats = { checked: 0, warnings: 0, resolved: 0, errors: 0 };
  let notificationsSent = 0;

  try {
    const positions = await AlphaArcadePosition.find({
      status: { $in: ['active', 'pending_withdrawal'] },
    });

    stats.checked = positions.length;

    for (const position of positions) {
      try {
        const resolutionTime = await getResolutionTime(position.marketAppId);

        if (!resolutionTime || resolutionTime <= 0) {
          continue;
        }

        const hoursRemaining = (resolutionTime * 1000 - Date.now()) / 3600000;

        // Look up pool for context
        const pool = await AlphaArcadePool.findOne({ marketAppId: position.marketAppId });
        const walletShort = position.wallet.slice(-8);

        // Already passed — mark resolved
        if (hoursRemaining <= 0) {
          if (position.status !== 'resolved') {
            position.status = 'resolved';
            await position.save();
            stats.resolved++;
            logger.info(
              `Resolution cron: marked resolved — pos=${position._id} wallet=...${walletShort} market=${position.marketAppId}`
            );

            if (notificationsSent < MAX_NOTIFICATIONS_PER_RUN) {
              await sendPositionResolved(position, pool);
              notificationsSent++;
            }

            // Populate pool resolution state from on-chain outcome
            if (pool && !pool.isResolved) {
              try {
                const { isResolved, outcome } = await getMarketOutcome(pool.marketAppId);
                if (isResolved && outcome) {
                  await AlphaArcadePool.findByIdAndUpdate(pool._id, {
                    isResolved: true,
                    resolutionOutcome: outcome,
                  });
                  logger.info(
                    `Resolution cron: pool ${pool._id} (market ${pool.marketAppId}) resolved with outcome: ${outcome}`
                  );
                }
              } catch (err) {
                logger.error(`Resolution cron: failed to update pool resolution for ${pool._id}: ${err.message}`);
              }
            }
          }
          continue;
        }

        // Determine warning level
        let warningLevel = null;
        if (hoursRemaining < 6) {
          warningLevel = '6hr';
        } else if (hoursRemaining < 24) {
          warningLevel = '24hr';
        } else if (hoursRemaining < 48) {
          warningLevel = '48hr';
        }

        if (!warningLevel) continue;

        // Check if warning already sent
        const alreadySent = (position.warningsSent || []).some(w => w.type === warningLevel);
        if (alreadySent) continue;

        // Transition to pending_withdrawal for 6hr warning
        if (warningLevel === '6hr' && position.status === 'active') {
          position.status = 'pending_withdrawal';
          logger.info(
            `Resolution cron: status -> pending_withdrawal — pos=${position._id} wallet=...${walletShort} market=${position.marketAppId} hours=${hoursRemaining.toFixed(1)}`
          );
        }

        // Record warning
        position.warningsSent = position.warningsSent || [];
        position.warningsSent.push({ type: warningLevel, sentAt: new Date() });
        await position.save();
        stats.warnings++;

        logger.info(
          `Resolution cron: sent ${warningLevel} warning — pos=${position._id} wallet=...${walletShort} market=${position.marketAppId} hours=${hoursRemaining.toFixed(1)}`
        );

        if (notificationsSent < MAX_NOTIFICATIONS_PER_RUN) {
          await sendResolutionWarning(position, pool, hoursRemaining, warningLevel);
          notificationsSent++;
        }
      } catch (err) {
        stats.errors++;
        logger.error(`Resolution cron: error processing position ${position._id}:`, err.message);
      }
    }

    await sendCronSummary(stats).catch(err =>
      logger.error('Resolution cron: summary send error:', err.message)
    );
  } catch (err) {
    logger.error('Resolution cron: fatal error:', err.message);
    stats.errors++;
  }

  logger.info(`Resolution cron: completed in ${Date.now() - start}ms — ${JSON.stringify(stats)}`);
  return stats;
}

cron.schedule('*/15 * * * *', async () => {
  logger.info('Resolution cron: starting');
  await checkResolutions();
});

logger.info('Alpha Arcade resolution cron: registered (every 15 minutes)');

module.exports = { checkResolutions };
