const logger = require("../config/logger");
// controllers/stakingTokenController.js
const StakingToken = require("../models/stakingTokenSchema");
const withdrawToken = require("../models/withdrawSchema");
const staking = require("../models/stakingSchema");
const claimReward = require("../models/claimRewardSchema");
const StakerData = require("../models/stakerDataSchema");

// Create or update staking token (upsert by wallet + poolId)
const addStakingToken = async (req, res) => {
  try {
    const { wallet, poolId, totalStaked } = req.body;

    if (!wallet || !poolId) {
      return res.status(400).json({ success: false, message: 'wallet and poolId are required' });
    }
    if (!totalStaked || totalStaked <= 0) {
      return res.status(400).json({ success: false, message: 'totalStaked must be a positive number' });
    }

    const savedToken = await StakingToken.findOneAndUpdate(
      { wallet, poolId },
      {
        $inc: { totalStaked: totalStaked },
        $set: {
          apr: req.body.apr,
          lockPeriod: req.body.lockPeriod,
          poolStartTime: req.body.poolStartTime,
          poolEndTime: req.body.poolEndTime,
          poolTime: req.body.poolTime,
          rewardToken: req.body.rewardToken,
          stakeTokens: req.body.stakeTokens,
          appId: req.body.appId,
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, data: savedToken });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add staking token', error: error.message });
  }
};

// Get all staking tokens
const getAllStakingTokens = async (req, res) => {
  try {
    const tokens = await StakingToken.find();
    res.status(200).json({ success: true, data: tokens });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch staking tokens', error: error.message });
  }
};

// Delete staking token by ID
const deleteStakingToken = async (req, res) => {
  try {
    const deleted = await StakingToken.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Token not found' });
    }
    res.status(200).json({ success: true, message: 'Staking token deleted successfully', id: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete staking token', error: error.message });
  }
};

const getStakingTokensByPoolId = async (req, res) => {
  const { poolId } = req.params;

  if (!poolId) {
    return res.status(400).json({
      success: false,
      message: "Pool ID is required"
    });
  }

  try {
    const data = await StakingToken.find({ poolId }).sort({ timestamp: -1 });

    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No staking token records found for the given pool ID"
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error("Error fetching staking tokens by poolId:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch staking tokens",
      error: error.message
    });
  }
};

const getPoolTokensAndWithdrawn = async (req, res) => {
  const { poolId } = req.params;

  if (!poolId) {
    return res.status(400).json({
      success: false,
      message: "Pool ID is required"
    });
  }

  try {
    const records = await StakingToken.find({ appId: Number(poolId) });
    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: "No staking records found for this user in the given pool"
      });
    }

    const totalStaked = records.reduce((sum, rec) => sum + (rec.totalStaked || 0), 0);
    
    const withdrawalRecords = await withdrawToken.find({ appId: Number(poolId) });
    const totalWithdrawn = withdrawalRecords.reduce((sum, rec) => sum + (rec.tokens || 0), 0);
    const updatedAmount = totalStaked - totalWithdrawn;

    return res.status(200).json({
      success: true,
      totalBalance: updatedAmount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch staking records",
      error: error.message
    });
  }
};


const getStakingRecordsByAppId = async (req, res) => {
  const { appId } = req.params;

  if (!appId) {
    return res.status(400).json({
      success: false,
      message: "App ID is required"
    });
  }

  try {
    // Fetch farming records where the appId matches
    const records = await staking.find({ stakingContractId : appId }).sort({ createdAt: -1 });

    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: "No staking records found for the given appId"
      });
    }

    res.status(200).json({
      success: true,
      data: records
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch staking records by appId",
      error: error.message
    });
  }
};

const getUserStakingStats = async (req, res) => {
  const { wallet } = req.params;

  if (!wallet) {
    return res.status(400).json({
      success: false,
      message: "Wallet address is required"
    });
  }

  try {
    // 1. TVL: sum all pools' totalAmountStaked (already in standard units)
    const allPools = await staking.find({});
    const totalTVL = allPools.reduce((sum, p) => sum + (p.totalAmountStaked || 0), 0);

    // 2. My Stakes: StakingToken (micro units) with StakerData fallback
    const stakingRecords = await StakingToken.find({ wallet });
    const withdrawalRecords = await withdrawToken.find({ wallet });
    // withdrawToken.tokens is stored in standard units (not micro)
    const totalWithdrawn = withdrawalRecords.reduce((sum, rec) => sum + (rec.tokens || 0), 0);

    let myStake = 0;
    if (stakingRecords.length > 0) {
      const totalStaked = stakingRecords.reduce((sum, rec) => sum + (rec.totalStaked || 0), 0) / 1_000_000;
      myStake = totalStaked - totalWithdrawn;
    } else {
      // Fallback: StakerData records (created on claim, micro units)
      const stakerRecords = await StakerData.find({ walletId: wallet });
      const stakerStaked = stakerRecords.reduce((sum, r) => sum + (r.stakedAmount || 0), 0) / 1_000_000;
      myStake = stakerStaked - totalWithdrawn;
    }
    myStake = Math.max(myStake, 0);

    // 3. My Rewards: claimReward (micro units) with StakerData fallback
    const userRewards = await claimReward.find({ walletId: wallet });
    let myReward = 0;
    if (userRewards.length > 0) {
      myReward = userRewards.reduce((sum, rec) => sum + (rec.rewardClaimed || 0), 0) / 1_000_000;
    } else {
      const stakerRecords = await StakerData.find({ walletId: wallet });
      myReward = stakerRecords.reduce((sum, r) => sum + (r.rewardClaimed || 0), 0) / 1_000_000;
    }

    res.status(200).json({
      success: true,
      data: { totalTVL, myStake, myReward }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user staking stats",
      error: error.message
    });
  }
};

const getStakingTokensById = async (req, res) => {
  const { poolId } = req.params;

  if (!poolId) {
    return res.status(400).json({
      success: false,
      message: "Pool ID is required"
    });
  }

  try {
    const data = await StakingToken.find({ appId : Number(poolId) }).sort({ createdAt: -1 });

    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No records found for the given pool ID"
      });
    }

    return res.status(200).json({ success: true, data }); // ✅ return here
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch records by pool ID",
      error: error.message
    });
  }
};


const getStakingTokensByWallet = async (req, res) => {
  try {
    const { wallet } = req.params;
    const records = await StakingToken.find({ wallet });
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  addStakingToken,
  getAllStakingTokens,
  deleteStakingToken,
  getStakingTokensByPoolId,
  getPoolTokensAndWithdrawn,
  getStakingRecordsByAppId,
  getUserStakingStats,
  getStakingTokensById,
  getStakingTokensByWallet
};
