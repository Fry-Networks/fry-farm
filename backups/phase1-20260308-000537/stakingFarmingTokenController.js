const StakingFarmingToken = require("../models/stakingFarmingTokenSchema");
const withdrawFarmingToken = require("../models/withdrawFarmingTokenSchema");
const claimFarmRewards = require("../models/claimFarmRewardsSchema");
const Farming = require("../models/farmingSchema"); // Import your farming schema

// Create a new staking farming token entry (user staking in pool)
const addStakingFarmingToken = async (req, res) => {
  try {
    const newRecord = new StakingFarmingToken(req.body);
    const savedRecord = await newRecord.save();
    res.status(201).json({ success: true, data: savedRecord });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add staking farming token',
      error: error.message
    });
  }
};

// Get all staking farming records
const getAllStakingFarmingTokens = async (req, res) => {
  try {
    const records = await StakingFarmingToken.find();
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staking farming records',
      error: error.message
    });
  }
};

// Delete a staking farming record by ID
const deleteStakingFarmingToken = async (req, res) => {
  try {
    const deleted = await StakingFarmingToken.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    res.status(200).json({ success: true, message: 'Staking farming record deleted successfully', id: req.params.id });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete staking farming record',
      error: error.message
    });
  }
};

// Get all user staking records by poolId
const getStakingFarmingTokensByPoolId = async (req, res) => {
  const { poolId } = req.params;

  if (!poolId) {
    return res.status(400).json({
      success: false,
      message: "Pool ID is required"
    });
  }

  try {
    const data = await StakingFarmingToken.find({ poolId }).sort({ createdAt: -1 });

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


// Get a user's stake for a specific pool
const getStakingFarmingByUserAndPool = async (req, res) => {
  const { poolId, wallet } = req.params;

  if (!poolId || !wallet) {
    return res.status(400).json({
      success: false,
      message: "Pool ID and wallet address are required"
    });
  }

  try {
    const records = await StakingFarmingToken.find({ poolId, wallet });

    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: "No staking records found for this user in the given pool"
      });
    }

    const totalStaked = records.reduce((sum, rec) => sum + (rec.stakedAmount || 0), 0);
    
    const withdrawalRecords = await withdrawFarmingToken.find({ poolId, userWallet: wallet });
    const totalWithdrawn = withdrawalRecords.reduce((sum, rec) => sum + (rec.amount || 0), 0);
    const updatedTotalStaked = totalStaked - totalWithdrawn;

    return res.status(200).json({
      success: true,
      totalStaked: updatedTotalStaked
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch staking records",
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
    const records = await StakingFarmingToken.find({ poolId });

    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: "No staking records found for this user in the given pool"
      });
    }

    const totalStaked = records.reduce((sum, rec) => sum + (rec.stakedAmount || 0), 0);
    
    const withdrawalRecords = await withdrawFarmingToken.find({ poolId });
    const totalWithdrawn = withdrawalRecords.reduce((sum, rec) => sum + (rec.amount || 0), 0);
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

const getFarmingRecordsByAppId = async (req, res) => {
  const { appId } = req.params;

  if (!appId) {
    return res.status(400).json({
      success: false,
      message: "App ID is required"
    });
  }

  try {
    // Fetch farming records where the appId matches
    const records = await Farming.find({ appId: Number(appId) }).sort({ createdAt: -1 });

    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: "No farming records found for the given appId"
      });
    }

    res.status(200).json({
      success: true,
      data: records
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch farming records by appId",
      error: error.message
    });
  }
};

const getUserFarmingStats = async (req, res) => {
  const { wallet } = req.params;

  if (!wallet) {
    return res.status(400).json({
      success: false,
      message: "Wallet address is required"
    });
  }

  try {
    // Fetch all staking records by wallet
    const stakingRecords = await StakingFarmingToken.find({ wallet });

    // Calculate total staked amount
    const totalStaked = stakingRecords.reduce((sum, rec) => sum + (rec.stakedAmount || 0), 0);

    // Calculate total earned rewards
    // const totalReward = stakingRecords.reduce((sum, rec) => sum + (rec.earnedReward || 0), 0);

    // Fetch all withdrawal records by wallet
    const withdrawalRecords = await withdrawFarmingToken.find({ userWallet: wallet });

    // Calculate total withdrawn amount
    const totalWithdrawn = withdrawalRecords.reduce((sum, rec) => sum + (rec.amount || 0), 0);

    // Final stake = totalStaked - totalWithdrawn
    const activeStake = totalStaked - totalWithdrawn;

    const userRewards = await claimFarmRewards.find({ walletId: wallet });
    const totalReward = userRewards.reduce((sum, rec) => sum + (rec.rewardClaimed || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        totalTVL: totalStaked,       
        myStake: activeStake,
        myReward: totalReward
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user farming stats",
      error: error.message
    });
  }
};


const getStakingFarmingTokensByWallet = async (req, res) => {
  try {
    const { wallet } = req.params;
    const records = await StakingFarmingToken.find({ wallet });
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  addStakingFarmingToken,
  getAllStakingFarmingTokens,
  deleteStakingFarmingToken,
  getStakingFarmingTokensByPoolId,
  getStakingFarmingByUserAndPool,
  getPoolTokensAndWithdrawn,
  getFarmingRecordsByAppId,
  getUserFarmingStats,
  getStakingFarmingTokensByWallet
};
