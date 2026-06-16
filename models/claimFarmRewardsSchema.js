const mongoose = require("mongoose");

const claimFarmRewardSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  walletId: {
    type: String,
    required: true,
  },
  poolId: {
    type: String,
    required: true,
  },
  rewardClaimed: {
    type: Number, // In tokens (e.g., 0.001)
    required: true,
  },
  stakedAmount: {
    type: Number, // In tokens (e.g., 2)
    required: true,
  },
  stakeStartTime: {
    type: Number, // UNIX timestamp in seconds
    required: true,
  },
  claimTime: {
    type: Number, // UNIX timestamp in seconds
    required: true,
  },
}, {
  timestamps: true,
  collection: 'claimFarmRewards'
});

const claimFarmRewards = mongoose.model("claimFarmRewards", claimFarmRewardSchema);
module.exports = claimFarmRewards;
