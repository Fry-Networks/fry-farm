const Farming = require('../models/farmingSchema');
const StakingFarmingToken = require('../models/stakingFarmingTokenSchema');
const { readUserBoxState } = require('./stakingClaimService');

/**
 * Self-healing sync: verify on-chain farm positions for a wallet and backfill
 * missing StakingFarmingToken records. Never deletes existing records.
 */
async function syncWalletFarmPositions(wallet, chainId = 'algorand-mainnet') {
  try {
    const pools = await Farming.find({ chainId }).limit(50);
    if (!pools || pools.length === 0) return;

    for (const pool of pools) {
      const appId = pool.appId;
      if (!appId) continue;

      try {
        const box = await readUserBoxState(appId, wallet, chainId);
        if (!box || box.stakedAmount <= 0) continue;

        const poolId = String(appId);
        const existing = await StakingFarmingToken.find({ wallet, chainId, poolId }).sort({ createdAt: 1 });

        if (existing.length === 0) {
          await StakingFarmingToken.create({
            chainId,
            poolId,
            wallet,
            stakedAmount: box.stakedAmount,
            earnedReward: box.pendingReward || 0,
            lastStakedAt: box.stakeTime || null,
            claimedAt: null,
          });
        } else {
          // Update first record only; leave duplicates untouched
          await StakingFarmingToken.updateOne(
            { _id: existing[0]._id },
            {
              $set: {
                stakedAmount: box.stakedAmount,
                earnedReward: box.pendingReward || 0,
                lastStakedAt: box.stakeTime || null,
              },
            }
          );
        }
      } catch (innerErr) {
        // Box missing or algod error for this pool — skip silently
        continue;
      }
    }
  } catch (err) {
    // Non-fatal: log concise warning, no secrets
    console.warn(`[farmPositionSync] sync failed for wallet=${wallet} chain=${chainId}: ${err.message}`);
  }
}

module.exports = { syncWalletFarmPositions };
