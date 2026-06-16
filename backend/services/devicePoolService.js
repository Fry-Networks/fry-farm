const logger = require("../config/logger");
const DevicePool = require("../models/devicePoolSchema");
const DevicePosition = require("../models/devicePositionSchema");
const FeeConfig = require("../models/feeConfigSchema");
const { getAsaUsdPrice } = require("./priceService");
const { checkRequirements, computeMultiplier } = require("./requirementCheckerService");

const { getIndexerUrl } = require('./algodService');

/**
 * Create a new device staking pool
 */
async function createPool(poolData) {
  // Validate reward token exists via Indexer
  const assetRes = await fetch(`${getIndexerUrl()}/v2/assets/${poolData.rewardTokenId}`);
  if (!assetRes.ok) {
    throw new Error(`Reward token ${poolData.rewardTokenId} not found on chain`);
  }

  // Validate collection creator if provided
  if (poolData.collectionCreator) {
    const creatorRes = await fetch(`${getIndexerUrl()}/v2/accounts/${poolData.collectionCreator}`);
    if (!creatorRes.ok) {
      throw new Error(`Collection creator address ${poolData.collectionCreator} not found`);
    }
  }

  // Calculate creation fee
  let feeInfo = null;
  try {
    const config = await FeeConfig.getFeeConfig();
    const tokenPrice = await getAsaUsdPrice(poolData.rewardTokenId);
    const percentFee = (poolData.rewardAmount || 0) * (config.poolCreationFeePercent || 0.5) / 100;
    const usdFee = tokenPrice > 0 ? (config.poolCreationFeeUsd || 1.0) / tokenPrice : 0;
    const feeAmount = Math.max(percentFee, usdFee);
    feeInfo = { feeAmount, feeTokenId: poolData.rewardTokenId, feeRecipient: config.feeRecipient };
  } catch (err) {
    logger.error("Error calculating pool creation fee:", err.message);
  }

  const pool = new DevicePool(poolData);
  const savedPool = await pool.save();

  return { pool: savedPool, feeInfo };
}

/**
 * Get a single pool by appId
 */
async function getPool(appId) {
  return DevicePool.findOne({ appId });
}

/**
 * Get all pools with optional filters
 */
async function getAllPools(filters) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.chainId) query.chainId = filters.chainId;
  return DevicePool.find(query).sort({ createdAt: -1 });
}

/**
 * Get pools by creator wallet
 */
async function getPoolsByCreator(wallet) {
  return DevicePool.find({ creator: wallet }).sort({ createdAt: -1 });
}

/**
 * Update pool settings (creator only)
 */
async function updatePool(appId, wallet, updates) {
  const pool = await DevicePool.findOne({ appId });
  if (!pool) throw new Error(`Pool ${appId} not found`);
  if (pool.creator !== wallet) throw new Error('Only the pool creator can update this pool');

  return DevicePool.findOneAndUpdate(
    { appId },
    { $set: updates },
    { new: true, runValidators: true }
  );
}

/**
 * Stake a device NFT into a pool
 */
async function stakeDevice(poolAppId, wallet, deviceNftId, deviceNftName) {
  const pool = await DevicePool.findOne({ appId: poolAppId });
  if (!pool) throw new Error(`Pool ${poolAppId} not found`);
  if (pool.status !== 'active') throw new Error('Pool is not active');

  // Verify NFT ownership via Indexer
  const nftRes = await fetch(`${getIndexerUrl()}/v2/accounts/${wallet}/assets?asset-id=${deviceNftId}`);
  if (!nftRes.ok) throw new Error('Failed to verify NFT ownership');
  const nftData = await nftRes.json();
  const heldAsset = nftData.assets?.[0];
  if (!heldAsset || heldAsset.amount <= 0) {
    throw new Error('Wallet does not hold this NFT');
  }

  // Verify collection membership
  if (pool.collectionMode === 'creator_address' || pool.collectionMode === 'both') {
    if (pool.collectionCreator) {
      const assetRes = await fetch(`${getIndexerUrl()}/v2/assets/${deviceNftId}`);
      if (assetRes.ok) {
        const assetData = await assetRes.json();
        const creator = assetData.asset?.params?.creator;
        if (creator !== pool.collectionCreator) {
          // Check accepted collections
          const inCollection = pool.acceptedCollections.some(
            c => c.identifiers?.creatorAddress === creator
          );
          if (!inCollection && pool.collectionMode === 'creator_address') {
            throw new Error('NFT is not from the accepted collection');
          }
        }
      }
    }
  }
  if (pool.collectionMode === 'whitelist' || pool.collectionMode === 'both') {
    if (pool.whitelist.length > 0 && !pool.whitelist.includes(deviceNftId)) {
      throw new Error('NFT is not in the whitelist');
    }
  }

  // Check requirements
  let requirementStatus = [];
  let allRequiredMet = true;
  if (pool.requirements && pool.requirements.length > 0) {
    const reqResult = await checkRequirements(wallet, pool.requirements);
    if (reqResult) {
      requirementStatus = reqResult.statuses;
      allRequiredMet = reqResult.allRequiredMet;
      if (!allRequiredMet) {
        const hasRequired = pool.requirements.some(r => r.enforcement === 'required');
        if (hasRequired) {
          throw new Error('Wallet does not meet required staking requirements');
        }
      }
    }
  }

  // Compute initial multiplier
  const { effectiveMultiplier, activeMultipliers } = await computeMultiplier(wallet, pool, null);

  // Determine initial status
  const status = pool.stakingMode === 'escrow' ? 'escrow_locked' : 'active';

  // Calculate lock expiry
  const lockExpiry = pool.lockPeriod > 0
    ? new Date(Date.now() + pool.lockPeriod * 1000)
    : null;

  const position = new DevicePosition({
    poolAppId,
    wallet,
    deviceNftId,
    deviceNftName,
    stakingMode: pool.stakingMode,
    status,
    lockExpiry,
    requirementStatus,
    allRequiredMet,
    activeMultipliers,
    effectiveMultiplier,
  });

  const savedPosition = await position.save();

  // Update pool stats
  await DevicePool.findOneAndUpdate(
    { appId: poolAppId },
    { $inc: { totalStaked: 1, totalStakers: 1 } }
  );

  return savedPosition;
}

/**
 * Unstake a device NFT from a pool
 */
async function unstakeDevice(poolAppId, wallet, deviceNftId) {
  const position = await DevicePosition.findOne({ poolAppId, wallet, deviceNftId });
  if (!position) throw new Error('Position not found');
  if (position.wallet !== wallet) throw new Error('Wallet does not match position');
  if (position.status === 'unstaked') throw new Error('Already unstaked');

  // Check lock period
  if (position.lockExpiry && new Date() < position.lockExpiry) {
    throw new Error(`Lock period has not elapsed. Unlocks at ${position.lockExpiry.toISOString()}`);
  }

  position.status = 'unstaked';
  const updated = await position.save();

  // Update pool stats
  await DevicePool.findOneAndUpdate(
    { appId: poolAppId },
    { $inc: { totalStaked: -1, totalStakers: -1 } }
  );

  return updated;
}

/**
 * Record a reward claim
 */
async function claimRewards(poolAppId, wallet, rewardClaimed, txId, feeAmount) {
  const position = await DevicePosition.findOne({
    poolAppId,
    wallet,
    status: { $in: ['active', 'escrow_locked'] },
  });
  if (!position) throw new Error('No active position found');

  // Re-check requirements
  const pool = await DevicePool.findOne({ appId: poolAppId });
  if (pool && pool.requirements && pool.requirements.length > 0) {
    const reqResult = await checkRequirements(wallet, pool.requirements);
    if (reqResult && !reqResult.allRequiredMet) {
      position.status = 'requirements_not_met';
      position.requirementStatus = reqResult.statuses;
      position.allRequiredMet = false;
      await position.save();
      throw new Error('Requirements no longer met');
    }
    if (reqResult) {
      position.requirementStatus = reqResult.statuses;
      position.allRequiredMet = reqResult.allRequiredMet;
    }
  }

  // Re-compute multiplier
  if (pool) {
    const { effectiveMultiplier, activeMultipliers } = await computeMultiplier(wallet, pool, position);
    position.activeMultipliers = activeMultipliers;
    position.effectiveMultiplier = effectiveMultiplier;
  }

  position.totalClaimed += rewardClaimed;
  position.lastRewardsClaimed = rewardClaimed;
  position.lastClaimTime = new Date();

  return position.save();
}

module.exports = {
  createPool,
  getPool,
  getAllPools,
  getPoolsByCreator,
  updatePool,
  stakeDevice,
  unstakeDevice,
  claimRewards,
};
