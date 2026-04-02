const mongoose = require("mongoose");

const stakingFarmingTokenSchema = new mongoose.Schema({
  // Associated pool
  poolId: {
    type: String,
    required: true,
  },
  // The user staking in this pool
  wallet: {
    type: String,
    required: true,
  },
  // Staking state
  stakedAmount: {
    type: Number,
    default: 0,
  },
  earnedReward: {
    type: Number,
    default: 0,
  },
  // Optional
  lastStakedAt: {
    type: Number, // timestamp
    default: null,
  },
  claimedAt: {
    type: Number, // timestamp
    default: null,
  }
}, {
  timestamps: true,
});

const StakingFarmingToken = mongoose.model("StakingFarmingToken", stakingFarmingTokenSchema,"stakeFarmingTokens");
module.exports = StakingFarmingToken;
