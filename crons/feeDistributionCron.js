const cron = require('node-cron');
const logger = require('../config/logger');
const { runDistributionEpoch, processVoiFees } = require('../services/feeDistributionService');

// Fee distribution — daily at 00:30 UTC
cron.schedule('30 0 * * *', async () => {
  const start = Date.now();
  logger.info('Fee distribution cron: starting');

  try {
    // Step 1: Process Voi fees (bridge + swap, non-blocking)
    let voiResult = { skipped: true };
    try {
      voiResult = await processVoiFees();
      logger.info('Fee distribution cron: Voi result — ' + JSON.stringify(voiResult));
    } catch (voiErr) {
      logger.warn('Fee distribution cron: Voi failed (non-blocking):', voiErr.message);
      voiResult = { success: false, error: voiErr.message };
    }

    // Step 2: Run Algorand distribution epoch (include Voi FRY if available)
    const extraFry = voiResult.success ? (voiResult.fryReceived || 0) : 0;
    const result = await runDistributionEpoch('algorand-mainnet', extraFry);
    logger.info(
      'Fee distribution cron: completed in ' + (Date.now() - start) + 'ms — ' +
      JSON.stringify({ algorand: result, voi: voiResult })
    );
  } catch (error) {
    logger.error('Fee distribution cron: error:', error);
  }
});

logger.info('Fee distribution cron: registered (daily at 00:30 UTC)');
