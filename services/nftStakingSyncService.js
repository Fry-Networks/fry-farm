const logger = require('../config/logger');
const NftStakingPool = require('../models/nftStakingPoolSchema');
const { readNftStakingPoolGlobalState } = require('./stakingClaimService');

/**
 * Sync a single NFT staking pool's on-chain global state to MongoDB.
 * Returns { updated: boolean, inSync?: boolean, error?: string }
 */
async function syncNftStakingPool(pool) {
  const appId = Number(pool.appId);
  const chainId = pool.chainId || 'algorand-mainnet';

  if (!appId || isNaN(appId)) {
    return { updated: false, error: `Invalid appId: ${pool.appId}` };
  }

  try {
    const onChain = await readNftStakingPoolGlobalState(appId, chainId);

    // totalNftsStaked is a plain count — NO division
    const onChainNftsStaked = onChain.totalNftsStaked;
    // Micro-unit values divided by 1e6
    const onChainRewardsClaimed = onChain.totalRewardsClaimed / 1_000_000;
    const onChainRewardPool = onChain.totalRewardPool / 1_000_000;
    const onChainRewardBalance = onChain.totalRewardBalance / 1_000_000;
    const onChainRatePerDay = onChain.ratePerDay / 1_000_000;
    const onChainIsActive = onChain.isActive === 1;

    const nftsDiffers = (pool.totalNftsStaked || 0) !== onChainNftsStaked;
    const claimedDiffers = Math.abs((pool.totalRewardsClaimed || 0) - onChainRewardsClaimed) > 0.000001;
    const poolDiffers = Math.abs((pool.totalRewardPool || 0) - onChainRewardPool) > 0.000001;
    const balanceDiffers = Math.abs((pool.totalRewardBalance || 0) - onChainRewardBalance) > 0.000001;
    const rateDiffers = Math.abs((pool.ratePerDay || 0) - onChainRatePerDay) > 0.000001;
    const activeDiffers = (pool.isActive || false) !== onChainIsActive;

    if (!nftsDiffers && !claimedDiffers && !poolDiffers && !balanceDiffers && !rateDiffers && !activeDiffers) {
      await NftStakingPool.updateOne(
        { _id: pool._id },
        { $set: { lastOnChainSync: new Date() } }
      );
      return { updated: false, inSync: true };
    }

    const update = {
      totalNftsStaked: onChainNftsStaked,
      totalRewardsClaimed: onChainRewardsClaimed,
      totalRewardPool: onChainRewardPool,
      totalRewardBalance: onChainRewardBalance,
      ratePerDay: onChainRatePerDay,
      isActive: onChainIsActive,
      lastOnChainSync: new Date(),
    };

    await NftStakingPool.updateOne({ _id: pool._id }, { $set: update });

    logger.info(
      `NFT staking sync: ${appId} (${chainId}) ` +
      `nfts: ${pool.totalNftsStaked} -> ${onChainNftsStaked}, ` +
      `active: ${pool.isActive} -> ${onChainIsActive}`
    );

    return { updated: true };
  } catch (err) {
    logger.warn(`NFT staking sync failed for ${appId} (${chainId}): ${err.message}`);
    return { updated: false, error: err.message };
  }
}

/**
 * Sync all NFT staking pools from on-chain state.
 * Processes sequentially with a small delay to avoid algod rate limiting.
 */
async function syncAllNftStakingPools() {
  const pools = await NftStakingPool.find({}).lean();

  const stats = { total: pools.length, synced: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < pools.length; i++) {
    const result = await syncNftStakingPool(pools[i]);
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

module.exports = { syncNftStakingPool, syncAllNftStakingPools };
