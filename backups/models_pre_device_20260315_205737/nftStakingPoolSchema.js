const mongoose = require("mongoose");

const nftStakingPoolSchema = new mongoose.Schema({
  creatorId: {
    type: String,
    required: true,
  },
  appId: {
    type: Number,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  imageUrl: {
    type: String,
    default: '',
  },
  rewardTokenId: {
    type: Number,
    required: true,
  },
  rewardModel: {
    type: String,
    required: true,
    enum: ['fixed_rate', 'proportional', 'apr'],
  },
  collectionMode: {
    type: String,
    required: true,
    enum: ['creator_address', 'whitelist', 'both'],
  },
  collectionCreator: {
    type: String,
    default: '',
  },
  whitelistedAsaIds: {
    type: [Number],
    default: [],
  },
  collectionName: {
    type: String,
    default: '',
  },
  nftValueInRewardToken: {
    type: Number,
    default: 0,
  },
  ratePerDay: {
    type: Number,
    default: 0,
  },
  totalRewardPool: {
    type: Number,
    default: 0,
  },
  aprRate: {
    type: Number,
    default: 0,
  },
  valuePerNft: {
    type: Number,
    default: 0,
  },
  poolEndTime: {
    type: Number,
    default: 0,
  },
  lockPeriod: {
    type: Number,
    default: 0,
  },
  depositFeeBps: {
    type: Number,
    default: 0,
  },
  withdrawFeeBps: {
    type: Number,
    default: 0,
  },
  claimFeeBps: {
    type: Number,
    default: 0,
  },
  feeRecipient: {
    type: String,
    default: '',
  },
  totalNftsStaked: {
    type: Number,
    default: 0,
  },
  totalStakers: {
    type: Number,
    default: 0,
  },
  totalRewardsClaimed: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const NftStakingPool = mongoose.model("NftStakingPool", nftStakingPoolSchema, "nftStakingPools");
module.exports = NftStakingPool;
