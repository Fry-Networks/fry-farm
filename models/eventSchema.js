const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'ended', 'cancelled'],
    default: 'draft',
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
  airdropPoolFry: {
    type: Number,
    default: 0,
  },
  airdropDistribution: {
    type: String,
    enum: ['proportional', 'tiered'],
    default: 'proportional',
  },
  airdropTiers: [{
    rank: { type: Number },
    rankEnd: { type: Number },
    rewardFry: { type: Number },
    rewardAmount: { type: Number },
  }],
  minPointsToQualify: {
    type: Number,
    default: 0,
  },
  autoSchedule: {
    enabled: { type: Boolean, default: false },
    templateName: { type: String },
    recurrence: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly'] },
    nextRunDate: { type: Date },
  },
  createdBy: {
    type: String,
  },
  bannerImage: {
    type: String,
  },
  totalParticipants: {
    type: Number,
    default: 0,
  },
  lastPointsUpdate: {
    type: Date,
  },

  // Community event fields
  eventType: {
    type: String,
    enum: ['official', 'community'],
    default: 'official',
  },
  creatorWallet: {
    type: String,
    default: '',
  },
  rewardAsaId: {
    type: Number,
    default: null,
  },
  rewardAsaName: {
    type: String,
    default: '',
  },
  rewardAsaDecimals: {
    type: Number,
    default: 6,
  },
  rewardPool: {
    type: Number,
    default: 0,
  },
  fundingStatus: {
    type: String,
    enum: ['unfunded', 'funded', 'distributed', 'refunded'],
    default: 'unfunded',
  },
  fundingTxId: {
    type: String,
    default: '',
  },
  fundingFeeAmount: {
    type: Number,
    default: 0,
  },
  fundingFeeTxId: {
    type: String,
    default: '',
  },
  fundedAt: {
    type: Date,
    default: null,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  hiddenReason: {
    type: String,
    default: '',
  },

  // Vesting configuration for event rewards
  vesting: {
    enabled: { type: Boolean, default: false },
    startDate: { type: Date },
    durationDays: { type: Number },
    cliffDays: { type: Number, default: 0 },
    model: { type: String, enum: ['linear', 'cliff-linear'], default: 'linear' },
    rewardAsaId: { type: Number },
    totalPool: { type: Number },  // microFRY
    vestingType: { type: String, enum: ['off-chain', 'on-chain'], default: 'off-chain' },
    appId: { type: Number },  // Algorand app ID for on-chain EventVesting contract
    eventCallerAddress: { type: String },  // Per-event Algorand account for seeding
    eventCallerKey: {
      ciphertext: { type: String },
      iv: { type: String },
      authTag: { type: String },
    },
    seedingStatus: { type: String, enum: ["pending", "seeding", "seeded", "finalized", "failed"], default: "pending" },
    seedingError: { type: String },
  },
}, { timestamps: true });

eventSchema.index({ status: 1, startDate: 1, endDate: 1 });
eventSchema.index({ eventType: 1, status: 1, startDate: 1 });
eventSchema.index({ creatorWallet: 1 });

const Event = mongoose.model("Event", eventSchema, "events");
module.exports = Event;
