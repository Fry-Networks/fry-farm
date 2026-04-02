const claimFarmRewards = require('../models/claimFarmRewardsSchema');

// Add a new claimed farm reward
const addClaimFarmReward = async (req, res) => {
  try {
    const newClaim = new claimFarmRewards(req.body);
    const savedClaim = await newClaim.save();
    res.status(201).json({ success: true, data: savedClaim });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add farm claim reward',
      error: error.message,
    });
  }
};

// Get all claimed farm rewards
const getAllClaimFarmRewards = async (req, res) => {
  try {
    const rewards = await claimFarmRewards.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farm claim rewards',
      error: error.message,
    });
  }
};

// Get claimed rewards by walletId
const getClaimFarmRewardsByWallet = async (req, res) => {
  try {
    const { walletId } = req.params;
    const rewards = await claimFarmRewards.find({ walletId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rewards for wallet',
      error: error.message,
    });
  }
};

// Get claimed rewards by poolId
const getClaimFarmRewardsByPool = async (req, res) => {
  try {
    const { poolId } = req.params;
    const rewards = await claimFarmRewards.find({ poolId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rewards for pool',
      error: error.message,
    });
  }
};

module.exports = {
  addClaimFarmReward,
  getAllClaimFarmRewards,
  getClaimFarmRewardsByWallet,
  getClaimFarmRewardsByPool,
};
