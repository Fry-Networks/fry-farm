const mongoose = require("mongoose");

const nftStakingPoolSchema = new mongoose.Schema({
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
  contractType: {
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
  totalRewardBalance: {
    type: Number,
    default: 0,
  },
  lastOnChainSync: {
    type: Date,
    default: null,
  },
});

const NftStakingPool = mongoose.model("NftStakingPool", nftStakingPoolSchema, "nftStakingPools");
module.exports = NftStakingPool;
