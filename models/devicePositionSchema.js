const mongoose = require("mongoose");

const devicePositionSchema = new mongoose.Schema({
  // Core
  poolAppId: {
    type: String,
    required: true,
  },
  wallet: {
    type: String,
    required: true,
  },
  deviceNftId: {
    type: Number,
    required: true,
  },
  deviceNftName: {
    type: String,
    default: '',
  },
  deviceChainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
  },
  stakingMode: {
    type: String,
    enum: ['verified-hold', 'escrow'],
    default: 'verified-hold',
  },
  status: {
    type: String,
    enum: ['active', 'escrow_locked', 'requirements_not_met', 'verification_expired', 'unstaked'],
    default: 'active',
  },
  stakeTime: {
    type: Date,
    default: Date.now,
  },
  lastClaimTime: {
    type: Date,
    default: null,
  },
  lockExpiry: {
    type: Date,
    default: null,
  },

  // Verification
  lastVerificationTime: {
    type: Date,
    default: null,
  },
  lastVerificationResult: {
    type: String,
    enum: ['verified', 'failed', 'pending'],
    default: null,
  },
  consecutiveFailures: {
    type: Number,
    default: 0,
  },

  // Cross-chain
  sourceChainWallet: {
    type: String,
    default: '',
  },

  // Requirements Status
  requirementStatus: [{
    requirementId: { type: String },
    met: { type: Boolean },
    lastChecked: { type: Date },
    details: { type: String, default: '' },
  }],
  allRequiredMet: {
    type: Boolean,
    default: true,
  },

  // Active Multipliers
  activeMultipliers: [{
    multiplierId: { type: String },
    currentMultiplier: { type: Number },
    lastChecked: { type: Date },
    qualifyingDetails: { type: String, default: '' },
  }],
  effectiveMultiplier: {
    type: Number,
    default: 10000,
  },

  // Rewards
  totalClaimed: {
    type: Number,
    default: 0,
  },
  lastRewardsClaimed: {
    type: Number,
    default: 0,
  },

  // Escrow
  escrowTxId: {
    type: String,
    default: '',
  },
}, { timestamps: true });

devicePositionSchema.index({ poolAppId: 1, wallet: 1, deviceNftId: 1 }, { unique: true });
devicePositionSchema.index({ poolAppId: 1, status: 1 });
devicePositionSchema.index({ wallet: 1, status: 1 });
devicePositionSchema.index({ status: 1, stakingMode: 1, lastVerificationTime: 1 });

const DevicePosition = mongoose.model("DevicePosition", devicePositionSchema, "devicePositions");
module.exports = DevicePosition;
