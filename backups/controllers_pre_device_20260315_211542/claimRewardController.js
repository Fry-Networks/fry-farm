const ClaimReward = require('../models/claimRewardSchema');

// Add a new claimed reward
const addClaimReward = async (req, res) => {
  try {
    const newClaim = new ClaimReward(req.body);
    const savedClaim = await newClaim.save();
    res.status(201).json({ success: true, data: savedClaim });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add claim reward', error: error.message });
  }
};

// Get all claimed rewards
const getAllClaimRewards = async (req, res) => {
  try {
    const rewards = await ClaimReward.find();
    res.status(200).json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch claim rewards', error: error.message });
  }
};

// Get claimed rewards by walletId
const getClaimRewardsByWallet = async (req, res) => {
  try {
    const { walletId } = req.params;
    const rewards = await ClaimReward.find({ walletId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch claim rewards for wallet', error: error.message });
  }
};

// Get claimed rewards by poolId
const getClaimRewardsByPool = async (req, res) => {
  try {
    const { poolId } = req.params;
    const rewards = await ClaimReward.find({ poolId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: rewards });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch claim rewards for pool', error: error.message });
  }
};

module.exports = {
  addClaimReward,
  getAllClaimRewards,
  getClaimRewardsByWallet,
  getClaimRewardsByPool,
};
