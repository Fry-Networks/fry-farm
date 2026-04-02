const cron = require('node-cron');
const logger = require('../config/logger');
const { syncAllPools } = require('../services/poolSyncService');

// Sync on-chain pool stats to MongoDB every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  const start = Date.now();
  logger.info('Pool sync cron: starting');

  try {
    const stats = await syncAllPools({ includeEnded: false });
    logger.info(
      `Pool sync cron: completed in ${Date.now() - start}ms — ` +
      `total=${stats.total} synced=${stats.synced} skipped=${stats.skipped} errors=${stats.errors}`
    );
  } catch (error) {
    logger.error('Pool sync cron: error:', error);
  }
});

logger.info('Pool sync cron: registered (every 5 minutes)');
