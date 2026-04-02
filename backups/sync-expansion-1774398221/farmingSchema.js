const mongoose = require("mongoose");

const farmingSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  creatorId: {
    type: String,
    required: true,
  },
  lpToken: {
    tokenA: {
      type: String,
      required: true,
    },
    tokenB: {
      type: String,
      required: true,
    },
  },
  rewardToken: {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: false,
    },
  },
  rewardTokenAmount: {
    type: Number,
    required: true,
  },
  farmStartTime: {
    type: Number,
    required: true,
  },
  farmEndTime: {
    type: Number,
    required: true,
  },
  duration: {
    type: Number,
    required: true,
  },
  lockPeriod: {
    type: Number,
    required: true,
  },
  farmEntryFee: {
    type: Number,
    required: true,
  },
  rewardDistributionRate: {
    type: Number,
    required: true,
  },
  rewardDistributionSchedule: {
    type: Number,
    required: true,
  },
  fryRewardFee: {
    type: Number,
    required: true,
  },
  aprRate: {
    type: Number,
    default: 0,
  },
  totalFarmers: {
    type: Number,
    default: 0,
  },
  totalStaked: {
    type: Number,
    default: 0,
  },
  rewardsDistributed: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  appId: {
    type: Number,
    required: true,
  },
  poolType: {
    type: String,
    enum: ['lp', 'single'],
    default: 'lp',
  },
  dexProvider: {
    type: String,
    default: '',
  },
  stakeTokenName: {
    type: String,
    default: '',
  },
  stakeTokenSymbol: {
    type: String,
    default: '',
  },
  rewardTokenName: {
    type: String,
    default: '',
  },
  rewardTokenSymbol: {
    type: String,
    default: '',
  },
  lpPairName: {
    type: String,
    default: '',
  },
  isGated: {
    type: Boolean,
    default: false,
  },
  gateConfig: {
    type: {
      nftAsaId: { type: Number, default: 0 },
      nftCreatorAddress: { type: String, default: '' },
      collectionName: { type: String, default: '' },
      minNftCount: { type: Number, default: 1 },
      gateMessage: { type: String, default: 'This pool requires an NFT to participate.' },
    },
    default: {},
  },
});

const Farming = mongoose.model("Farming", farmingSchema, "farmingPools");
module.exports = Farming;
