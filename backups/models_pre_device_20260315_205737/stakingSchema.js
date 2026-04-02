const mongoose = require("mongoose");

const stakingSchema = new mongoose.Schema({
  creatorId: {
  type: String,
    required: true,
  },
  stakeToken: {
    id: {
      type: String,
      required: true,
    },
    name: {
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
      required: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  stakingStartTime: {
    type: Number,
    required: true,
  },
  stakingEndTime: {
    type: Number,
    required: true,
  },
  stakingTime: {
    type: Number,
    default: 0,
  },
  duration: {
    type: Number,
    required: true,
  },
  aprRate: {
    type: Number,
    required: true,
  },
  totalStakers: {
    type: Number,
    default: 0,
  },
  totalAmountStaked: {
    type: Number,
    default: 0,
  },
  rewardTokenAmount: {
    type: Number,
    required: true,
  },
  stakingContractId: {
    type: String,
    required: true,
  },
  lockPeriod: {
    type: Number, 
    default: 0,
    required: true,
  },
  rewardsDistributed: {
    type: Number,
    default: 0,
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
  contractVersion: {
    type: Number,
    default: 1,
  },
});


const Staking = mongoose.model("Staking", stakingSchema);
module.exports = Staking;
