const mongoose = require("mongoose");

const stakingTokenSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  apr: {
    type: Number,
    required: true,
  },
  lockPeriod: {
    type: Number,
    required: true,
  },
  poolEndTime: {
    type: Number,
    required: true,
  },
  poolStartTime: {
    type: Number,
    required: true,
  },
  poolTime: {
    type: Number,
    required: true,
  },
  rewardToken: {
    type: Number,
    required: true,
  },
  stakeTokens: {
    type: Number,
    required: true,
  },
  totalStaked: {
    type: Number,
    default: 0,
  },
  poolId:{
    type: String,
    required: true,
  },
  wallet:{
    type: String,
    required: true,
  },
  appId:{
    type: Number,
    required: true,
  },
}, { timestamps: true });

const StakingToken = mongoose.model("StakingToken", stakingTokenSchema);
module.exports = StakingToken;
