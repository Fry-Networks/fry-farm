const mongoose = require("mongoose");

const claimRewardSchema = new mongoose.Schema({
  rewardClaimed: {
    type: Number,
    required: true,
  },
  stakedAmount: {
    type: Number,
    required: true,
  },
  stakedTime: {
    type: Number,
    required: true,
  },
  walletId: {
    type: String,
    required: true,
  },
  poolId: {
    type: String,
    required: true,
  },
}, { timestamps: true });

const ClaimReward = mongoose.model("ClaimReward", claimRewardSchema, "claimrewards");
module.exports = ClaimReward;
