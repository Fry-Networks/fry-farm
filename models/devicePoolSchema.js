const mongoose = require("mongoose");

const devicePoolSchema = new mongoose.Schema({
  // Pool Identity
  appId: {
    type: String,
    required: true,
    unique: true,
  },
  creator: {
    type: String,
    required: true,
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
  status: {
    type: String,
    enum: ['active', 'ended', 'paused'],
    default: 'active',
  },

  // Staking Mode
  stakingMode: {
    type: String,
    required: true,
    enum: ['verified-hold', 'escrow'],
  },
  verifierAddress: {
    type: String,
    default: '',
  },
  verificationIntervalMinutes: {
    type: Number,
    default: 15,
  },
  verificationGracePeriod: {
    type: Number,
    default: 3,
  },

  // NFT Collection
  collectionCreator: {
    type: String,
    default: '',
  },
  collectionMode: {
    type: String,
    enum: ['creator_address', 'whitelist', 'both'],
    default: 'creator_address',
  },
  whitelist: {
    type: [Number],
    default: [],
  },
  acceptedCollections: [{
    collectionId: { type: String, default: '' },
    collectionName: { type: String, default: '' },
    collectionImage: { type: String, default: '' },
    chain: { type: String, default: 'algorand-mainnet' },
    identifiers: {
      creatorAddress: { type: String, default: '' },
      contractAddress: { type: String, default: '' },
      collectionAddress: { type: String, default: '' },
      evmChainId: { type: Number, default: 0 },
    },
  }],

  // Rewards
  rewardTokenId: {
    type: Number,
    required: true,
  },
  rewardToken: {
    id: { type: Number, default: 0 },
    name: { type: String, default: '' },
    symbol: { type: String, default: '' },
    image: { type: String, default: '' },
    decimals: { type: Number, default: 6 },
  },
  rewardModel: {
    type: String,
    required: true,
    enum: ['fixed_rate', 'proportional', 'apr'],
  },
  rewardPerDay: {
    type: Number,
    default: 0,
  },
  dailyPoolReward: {
    type: Number,
    default: 0,
  },
  apr: {
    type: Number,
    default: 0,
  },
  valuePerNft: {
    type: Number,
    default: 0,
  },
  rewardAmount: {
    type: Number,
    default: 0,
  },

  // Fees
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
    default: 800,
  },

  // Timing
  startDate: {
    type: Date,
    default: null,
  },
  endDate: {
    type: Date,
    default: null,
  },
  lockPeriod: {
    type: Number,
    default: 0,
  },

  // Stats
  totalStaked: {
    type: Number,
    default: 0,
  },
  totalStakers: {
    type: Number,
    default: 0,
  },
  tags: {
    type: [String],
    default: [],
  },

  // Chain
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
  },
  chainType: {
    type: String,
    enum: ['algorand', 'evm', 'solana', 'cosmos'],
    default: 'algorand',
  },

  // Requirements
  requirements: [{
    requirementId: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['token_balance', 'staking_position', 'nft_holding', 'multi_device', 'wallet_age'],
    },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    params: { type: mongoose.Schema.Types.Mixed, required: true },
    enforcement: {
      type: String,
      enum: ['required', 'optional_boost'],
      default: 'required',
    },
  }],

  // Boost Multipliers
  boostMultipliers: [{
    multiplierId: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      required: true,
      enum: ['stake_duration', 'token_balance', 'device_count', 'requirement_met'],
    },
    params: { type: mongoose.Schema.Types.Mixed, required: true },
    stackable: { type: Boolean, default: true },
    maxMultiplier: { type: Number, default: 100000 },
  }],

  // Announcements & Gating
  announcementsEnabled: {
    type: Boolean,
    default: true,
  },
  gatedAccessEnabled: {
    type: Boolean,
    default: true,
  },
  gatedAccessLabel: {
    type: String,
    default: '',
  },

  // Analytics
  analytics: {
    totalUniqueStakers: { type: Number, default: 0 },
    deviceTypeBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    averageStakeDurationDays: { type: Number, default: 0 },
    retentionRate30d: { type: Number, default: 0 },
    lastAnalyticsUpdate: { type: Date, default: null },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

devicePoolSchema.index({ status: 1, chainId: 1 });
devicePoolSchema.index({ creator: 1 });
devicePoolSchema.index({ "acceptedCollections.identifiers.creatorAddress": 1 });

const DevicePool = mongoose.model("DevicePool", devicePoolSchema, "devicePools");
module.exports = DevicePool;
