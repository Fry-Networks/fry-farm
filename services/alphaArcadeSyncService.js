const logger = require('../config/logger');
const AlphaArcadePool = require('../models/alphaArcadePoolSchema');
const { getAlgodClient } = require('./algodService');
const { getMarketGlobalState } = require('@alpha-arcade/sdk');

/**
 * Sync a single Alpha Arcade pool's on-chain global state + reward data to MongoDB.
 * @param {Object} pool - Pool document from MongoDB
 * @param {Object|null} rewardMarketData - Reward market data from API (null if not a reward market)
 * Returns { updated: boolean, inSync?: boolean, error?: string }
 */
async function syncAlphaArcadePool(pool, rewardMarketData) {
  const appId = Number(pool.marketAppId);

  if (!appId || isNaN(appId)) {
    return { updated: false, error: `Invalid marketAppId: ${pool.marketAppId}` };
  }

  try {
    const algodClient = getAlgodClient();
    const globalState = await getMarketGlobalState(algodClient, appId);

    const onChainResolved = globalState.is_resolved === 1;
    let onChainOutcome = null;
    if (onChainResolved) {
      onChainOutcome = globalState.outcome === 1 ? 'yes' : 'no';
    }

    const resolvedDiffers = onChainResolved !== (pool.isResolved || false);
    const outcomeDiffers = onChainOutcome !== (pool.resolutionOutcome || null);

    // Check if reward data changed
    const isRewardMarket = !!(rewardMarketData?.rewardsSpreadDistance > 0);
    const rewardDiffers = isRewardMarket !== (pool.isRewardMarket || false)
      || (rewardMarketData?.lastRewardAmount || 0) !== (pool.rewardData?.lastRewardAmount || 0)
      || (rewardMarketData?.lastRewardTs || 0) !== (pool.rewardData?.lastRewardTs || 0);

    if (!resolvedDiffers && !outcomeDiffers && !rewardDiffers) {
      await AlphaArcadePool.updateOne(
        { _id: pool._id },
        { $set: { lastOnChainSync: new Date() } }
      );
      return { updated: false, inSync: true };
    }

    const update = { lastOnChainSync: new Date() };

    if (onChainResolved && !pool.isResolved) {
      update.isResolved = true;
      update.resolutionOutcome = onChainOutcome;
      update.isActive = false;
    }

    // Sync reward data
    update.isRewardMarket = isRewardMarket;
    if (rewardMarketData) {
      update.rewardData = {
        spreadDistance: rewardMarketData.rewardsSpreadDistance || 0,
        fees: rewardMarketData.fees || 0,
        lastRewardAmount: rewardMarketData.lastRewardAmount || 0,
        lastRewardTs: rewardMarketData.lastRewardTs || 0,
        minContracts: rewardMarketData.rewardsMinContracts || 0,
        lpCount: rewardMarketData.lpRewardCompetitionWalletCount || 0,
      };
    }

    await AlphaArcadePool.updateOne({ _id: pool._id }, { $set: update });

    logger.info(
      `Alpha Arcade sync: ${appId} — ` +
      `isResolved: ${pool.isResolved} -> ${onChainResolved}, ` +
      `outcome: ${pool.resolutionOutcome || 'null'} -> ${onChainOutcome || 'null'}, ` +
      `isRewardMarket: ${pool.isRewardMarket || false} -> ${isRewardMarket}`
    );

    return { updated: true };
  } catch (err) {
    logger.warn(`Alpha Arcade sync failed for ${appId}: ${err.message}`);
    return { updated: false, error: err.message };
  }
}

/**
 * Sync all active/unresolved Alpha Arcade pools from on-chain state + reward data.
 * Fetches reward markets ONCE, then processes pools sequentially with a small delay.
 */
async function syncAllAlphaArcadePools() {
  const pools = await AlphaArcadePool.find({
    $or: [{ isActive: true }, { isResolved: false }],
  }).lean();

  // Fetch reward markets once for the entire sync cycle
  let rewardMarketMap = new Map();
  try {
    const { getRewardMarkets } = require('./alphaArcadeService');
    const rewardMarkets = await getRewardMarkets();
    for (const rm of rewardMarkets) {
      rewardMarketMap.set(rm.marketAppId, rm);
    }
    logger.info(`Alpha Arcade sync: loaded ${rewardMarketMap.size} reward markets`);
  } catch (err) {
    logger.warn(`Alpha Arcade sync: failed to fetch reward markets: ${err.message}`);
  }

  const stats = { total: pools.length, synced: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < pools.length; i++) {
    const rewardData = rewardMarketMap.get(pools[i].marketAppId) || null;
    const result = await syncAlphaArcadePool(pools[i], rewardData);
    if (result.error) {
      stats.errors++;
    } else if (result.updated) {
      stats.synced++;
    } else {
      stats.skipped++;
    }

    // 200ms delay between pools to avoid burst-loading algod
    if (i < pools.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return stats;
}

module.exports = { syncAlphaArcadePool, syncAllAlphaArcadePools };
