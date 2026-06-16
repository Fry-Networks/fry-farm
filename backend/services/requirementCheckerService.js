const logger = require("../config/logger");
const DevicePosition = require("../models/devicePositionSchema");
const Staking = require("../models/stakingSchema");
const StakingToken = require("../models/stakingTokenSchema");
const Farming = require("../models/farmingSchema");
const StakingFarmingToken = require("../models/stakingFarmingTokenSchema");

// In-memory cache with TTL
const requirementCache = new Map();
const REQUIREMENT_TTL = 5 * 60 * 1000; // 5 minutes

const { getIndexerUrl } = require('./algodService');
const blockTimestampCache = new Map(); // permanent — block timestamps never change

// Cleanup expired cache entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requirementCache) {
    if (now > entry.expires) requirementCache.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Fetch block timestamp from indexer (permanently cached)
 */
async function getBlockTimestamp(round) {
  if (blockTimestampCache.has(round)) return blockTimestampCache.get(round);
  const res = await fetch(`${getIndexerUrl()}/v2/blocks/${round}`);
  if (!res.ok) return null;
  const data = await res.json();
  const timestamp = data.timestamp || null;
  if (timestamp) blockTimestampCache.set(round, timestamp);
  return timestamp;
}

/**
 * Check a single requirement against a wallet
 */
async function checkSingleRequirement(wallet, requirement) {
  const { type, params } = requirement;

  try {
    switch (type) {
      case 'token_balance': {
        const res = await fetch(`${getIndexerUrl()}/v2/accounts/${wallet}`);
        if (!res.ok) return { met: false, details: 'Indexer unavailable' };
        const data = await res.json();
        const assets = data.account?.assets || [];
        const asset = assets.find(a => a['asset-id'] === params.asaId);
        const balance = asset ? asset.amount : 0;
        const met = balance >= (params.minBalance || 0);
        return { met, details: `Balance: ${balance}, required: ${params.minBalance || 0}` };
      }

      case 'staking_position': {
        // Check if wallet has active staking position in specified pool
        const hasStake = await StakingToken.exists({
          wallet,
          poolId: params.poolId,
          totalStaked: { $gt: 0 },
        });
        if (hasStake) return { met: true, details: 'Active staking position found' };

        const hasFarm = await StakingFarmingToken.exists({
          wallet,
          poolId: params.poolId,
          stakedAmount: { $gt: 0 },
        });
        return { met: !!hasFarm, details: hasFarm ? 'Active farming position found' : 'No active position' };
      }

      case 'nft_holding': {
        if (params.asaId) {
          const res = await fetch(`${getIndexerUrl()}/v2/accounts/${wallet}/assets?asset-id=${params.asaId}`);
          if (!res.ok) return { met: false, details: 'Indexer unavailable' };
          const data = await res.json();
          const asset = data.assets?.[0];
          const met = asset && asset.amount > 0;
          return { met: !!met, details: met ? 'NFT held' : 'NFT not held' };
        }
        if (params.creatorAddress) {
          const res = await fetch(`${getIndexerUrl()}/v2/accounts/${wallet}/assets?limit=500`);
          if (!res.ok) return { met: false, details: 'Indexer unavailable' };
          const data = await res.json();
          const assets = data.assets || [];
          // Need to check creator for each held asset - check if any asset by creator is held
          let found = false;
          for (const asset of assets) {
            if (asset.amount > 0) {
              try {
                const assetRes = await fetch(`${getIndexerUrl()}/v2/assets/${asset['asset-id']}`);
                if (assetRes.ok) {
                  const assetData = await assetRes.json();
                  if (assetData.asset?.params?.creator === params.creatorAddress) {
                    found = true;
                    break;
                  }
                }
              } catch {
                // continue checking other assets
              }
            }
          }
          return { met: found, details: found ? 'NFT by creator held' : 'No NFT by creator found' };
        }
        return { met: false, details: 'No asaId or creatorAddress specified' };
      }

      case 'multi_device': {
        const count = await DevicePosition.countDocuments({ wallet, status: { $in: ['active', 'escrow_locked'] } });
        const met = count >= (params.minDevices || 1);
        return { met, details: `Active devices: ${count}, required: ${params.minDevices || 1}` };
      }

      case 'wallet_age': {
        const res = await fetch(`${getIndexerUrl()}/v2/accounts/${wallet}`);
        if (!res.ok) return { met: false, details: 'Indexer unavailable' };
        const data = await res.json();
        const createdAtRound = data.account?.['created-at-round'];
        if (!createdAtRound) return { met: false, details: 'Cannot determine wallet age' };
        const createdTimestamp = await getBlockTimestamp(createdAtRound);
        if (!createdTimestamp) return { met: false, details: 'Cannot fetch block timestamp' };
        const ageDays = (Date.now() / 1000 - createdTimestamp) / 86400;
        const met = ageDays >= (params.minAgeDays || 0);
        return { met, details: `Wallet age: ${ageDays.toFixed(0)} days, required: ${params.minAgeDays || 0}` };
      }

      default:
        return { met: false, details: `Unknown requirement type: ${type}` };
    }
  } catch (err) {
    logger.error(`checkSingleRequirement error (${type}):`, err.message);
    return null;
  }
}

/**
 * Check all requirements for a wallet
 * Returns { allRequiredMet, statuses } or null if Indexer is unreachable
 */
async function checkRequirements(wallet, requirements) {
  if (!requirements || requirements.length === 0) {
    return { allRequiredMet: true, statuses: [] };
  }

  const cacheKey = `${wallet}:${JSON.stringify(requirements.map(r => r.requirementId))}`;
  const cached = requirementCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  const statuses = [];
  let allRequiredMet = true;
  let indexerFailed = false;

  for (const req of requirements) {
    const result = await checkSingleRequirement(wallet, req);
    if (result === null) {
      indexerFailed = true;
      continue;
    }
    statuses.push({
      requirementId: req.requirementId,
      met: result.met,
      lastChecked: new Date(),
      details: result.details,
    });
    if (req.enforcement === 'required' && !result.met) {
      allRequiredMet = false;
    }
  }

  if (indexerFailed && statuses.length === 0) {
    return null;
  }

  const data = { allRequiredMet, statuses };
  requirementCache.set(cacheKey, { data, expires: Date.now() + REQUIREMENT_TTL });
  return data;
}

/**
 * Compute effective multiplier for a position
 * Returns { effectiveMultiplier, activeMultipliers }
 */
async function computeMultiplier(wallet, pool, position) {
  if (!pool.boostMultipliers || pool.boostMultipliers.length === 0) {
    return { effectiveMultiplier: 10000, activeMultipliers: [] };
  }

  const activeMultipliers = [];
  let stackableProduct = 10000; // basis points: 10000 = 1x
  let highestNonStackable = 10000;

  for (const boost of pool.boostMultipliers) {
    let currentMultiplier = 10000;
    let qualifyingDetails = '';

    try {
      switch (boost.type) {
        case 'stake_duration': {
          if (!position || !position.stakeTime) break;
          const stakeDays = (Date.now() - new Date(position.stakeTime).getTime()) / 86400000;
          const tiers = (boost.params.tiers || []).sort((a, b) => b.days - a.days);
          for (const tier of tiers) {
            if (stakeDays >= tier.days) {
              currentMultiplier = tier.multiplier;
              qualifyingDetails = `Staked ${stakeDays.toFixed(0)} days, tier: ${tier.days}d`;
              break;
            }
          }
          break;
        }

        case 'token_balance': {
          const res = await fetch(`${getIndexerUrl()}/v2/accounts/${wallet}`);
          if (!res.ok) break;
          const data = await res.json();
          const assets = data.account?.assets || [];
          const asset = assets.find(a => a['asset-id'] === boost.params.asaId);
          const balance = asset ? asset.amount : 0;
          const tiers = (boost.params.tiers || []).sort((a, b) => b.minBalance - a.minBalance);
          for (const tier of tiers) {
            if (balance >= tier.minBalance) {
              currentMultiplier = tier.multiplier;
              qualifyingDetails = `Balance: ${balance}, tier: ${tier.minBalance}`;
              break;
            }
          }
          break;
        }

        case 'device_count': {
          const count = await DevicePosition.countDocuments({ wallet, status: { $in: ['active', 'escrow_locked'] } });
          const tiers = (boost.params.tiers || []).sort((a, b) => b.minDevices - a.minDevices);
          for (const tier of tiers) {
            if (count >= tier.minDevices) {
              currentMultiplier = tier.multiplier;
              qualifyingDetails = `Devices: ${count}, tier: ${tier.minDevices}`;
              break;
            }
          }
          break;
        }

        case 'requirement_met': {
          if (position && position.requirementStatus) {
            const reqStatus = position.requirementStatus.find(
              r => r.requirementId === boost.params.requirementId
            );
            if (reqStatus && reqStatus.met) {
              currentMultiplier = boost.params.multiplier || 15000;
              qualifyingDetails = `Requirement ${boost.params.requirementId} met`;
            }
          }
          break;
        }
      }
    } catch (err) {
      logger.error(`computeMultiplier error (${boost.type}):`, err.message);
    }

    // Cap at maxMultiplier
    const cappedMultiplier = Math.min(currentMultiplier, boost.maxMultiplier || 100000);

    activeMultipliers.push({
      multiplierId: boost.multiplierId,
      currentMultiplier: cappedMultiplier,
      lastChecked: new Date(),
      qualifyingDetails,
    });

    if (boost.stackable !== false) {
      stackableProduct = Math.floor((stackableProduct * cappedMultiplier) / 10000);
    } else {
      highestNonStackable = Math.max(highestNonStackable, cappedMultiplier);
    }
  }

  // Combine: stackable product * highest non-stackable / 10000
  let effectiveMultiplier = Math.floor((stackableProduct * highestNonStackable) / 10000);

  // Global cap
  const globalMax = Math.max(...pool.boostMultipliers.map(b => b.maxMultiplier || 100000));
  effectiveMultiplier = Math.min(effectiveMultiplier, globalMax);

  return { effectiveMultiplier, activeMultipliers };
}

module.exports = { checkRequirements, computeMultiplier };
