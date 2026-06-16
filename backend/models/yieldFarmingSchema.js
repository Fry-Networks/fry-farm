const mongoose = require("mongoose");

const yieldFarmingSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  poolCreator: {
    type: String,
    required: true,
  },
  poolId: {
    type: String, 
    required: true,
  },
  token1: {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
  },
  token2: {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
  },
  totalLiquidityProviders: {
    type: Number,
    default: 0, 
  },
  rewardToken: {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  apy: {
    type: Number,
    required: true, 
  },
  duration: {
    type: Number, 
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  tvc: {
    type: Number, 
    required: true,
  },
  rewardsDistributed: {
    type: Number,
    default: 0, 
  },
});


const YieldFarming = mongoose.model("YieldFarming", yieldFarmingSchema);
module.exports = YieldFarming;
