const logger = require('../config/logger');
const Staking = require('../models/stakingSchema');
const { readPoolGlobalState } = require('./stakingClaimService');

/**
 * Sync a single pool's on-chain global state to MongoDB.
 * Returns { updated: boolean, inSync?: boolean, error?: string }
 */
async function syncPool(pool) {
  const appId = Number(pool.stakingContractId);
  const chainId = pool.chainId || 'algorand-mainnet';

  if (!appId || isNaN(appId)) {
    return { updated: false, error: `Invalid appId: ${pool.stakingContractId}` };
  }

  try {
    const onChain = await readPoolGlobalState(appId, chainId);

    // On-chain total_staked is in micro-units; MongoDB stores in standard units
    const onChainTotalStaked = onChain.totalStaked / 1_000_000;
    const onChainTotalStakers = onChain.totalStakers;

    const stakedDiffers = Math.abs((pool.totalAmountStaked || 0) - onChainTotalStaked) > 0.000001;
    const stakersDiffers = (pool.totalStakers || 0) !== onChainTotalStakers;

    if (!stakedDiffers && !stakersDiffers) {
      await Staking.updateOne(
        { _id: pool._id },
        { $set: { lastOnChainSync: new Date() } }
      );
      return { updated: false, inSync: true };
    }

    const update = {
      totalAmountStaked: onChainTotalStaked,
      totalStakers: onChainTotalStakers,
      lastOnChainSync: new Date(),
    };

    if (onChain.rewardsDistributed !== undefined) {
      update.rewardsDistributed = onChain.rewardsDistributed / 1_000_000;
    }

    await Staking.updateOne({ _id: pool._id }, { $set: update });

    logger.info(
      `Pool sync: ${pool.stakingContractId} (${chainId}) ` +
      `staked: ${pool.totalAmountStaked} -> ${onChainTotalStaked}, ` +
      `stakers: ${pool.totalStakers} -> ${onChainTotalStakers}`
    );

    return { updated: true };
  } catch (err) {
    logger.warn(`Pool sync failed for ${pool.stakingContractId} (${chainId}): ${err.message}`);
    return { updated: false, error: err.message };
  }
}

/**
 * Sync all pools from on-chain state.
 * By default only syncs active pools (stakingEndTime > now).
 * Processes sequentially with a small delay to avoid algod rate limiting.
 */
async function syncAllPools({ includeEnded = false } = {}) {
  const now = Math.floor(Date.now() / 1000);

  const query = includeEnded ? {} : { stakingEndTime: { $gt: now } };
  const pools = await Staking.find(query).lean();

  const stats = { total: pools.length, synced: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < pools.length; i++) {
    const result = await syncPool(pools[i]);
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

module.exports = { syncPool, syncAllPools };
