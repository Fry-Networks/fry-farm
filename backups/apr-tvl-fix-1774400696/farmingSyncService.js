const logger = require('../config/logger');
const Farming = require('../models/farmingSchema');
const { readFarmingPoolGlobalState } = require('./stakingClaimService');

/**
 * Sync a single farming pool's on-chain global state to MongoDB.
 * Returns { updated: boolean, inSync?: boolean, error?: string }
 */
async function syncFarmingPool(pool) {
  const appId = Number(pool.appId);
  const chainId = pool.chainId || 'algorand-mainnet';

  if (!appId || isNaN(appId)) {
    return { updated: false, error: `Invalid appId: ${pool.appId}` };
  }

  try {
    const onChain = await readFarmingPoolGlobalState(appId, chainId);

    // On-chain total_staked is in micro-units; MongoDB stores in standard units
    const onChainTotalStaked = onChain.totalStaked / 1_000_000;
    const onChainTotalFarmers = onChain.totalFarmers || onChain.totalStakers;
    const onChainRewardsDistributed = onChain.rewardsDistributed / 1_000_000;
    const onChainApr = onChain.apr;

    const stakedDiffers = Math.abs((pool.totalStaked || 0) - onChainTotalStaked) > 0.000001;
    const farmersDiffers = (pool.totalFarmers || 0) !== onChainTotalFarmers;
    const rewardsDiffers = Math.abs((pool.rewardsDistributed || 0) - onChainRewardsDistributed) > 0.000001;
    const aprDiffers = (pool.aprRate || 0) !== onChainApr;

    if (!stakedDiffers && !farmersDiffers && !rewardsDiffers && !aprDiffers) {
      await Farming.updateOne(
        { _id: pool._id },
        { $set: { lastOnChainSync: new Date() } }
      );
      return { updated: false, inSync: true };
    }

    const update = {
      totalStaked: onChainTotalStaked,
      totalFarmers: onChainTotalFarmers,
      rewardsDistributed: onChainRewardsDistributed,
      aprRate: onChainApr,
      lastOnChainSync: new Date(),
    };

    await Farming.updateOne({ _id: pool._id }, { $set: update });

    logger.info(
      `Farming sync: ${appId} (${chainId}) ` +
      `staked: ${pool.totalStaked} -> ${onChainTotalStaked}, ` +
      `farmers: ${pool.totalFarmers} -> ${onChainTotalFarmers}`
    );

    return { updated: true };
  } catch (err) {
    logger.warn(`Farming sync failed for ${appId} (${chainId}): ${err.message}`);
    return { updated: false, error: err.message };
  }
}

/**
 * Sync all farming pools from on-chain state.
 * Processes sequentially with a small delay to avoid algod rate limiting.
 */
async function syncAllFarmingPools() {
  const pools = await Farming.find({}).lean();

  const stats = { total: pools.length, synced: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < pools.length; i++) {
    const result = await syncFarmingPool(pools[i]);
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

module.exports = { syncFarmingPool, syncAllFarmingPools };
