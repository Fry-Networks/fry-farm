const mongoose = require('mongoose');

const dailyClaimSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true },
  claimDate: { type: Date, required: true },
  streakDay: { type: Number, required: true },
  baseReward: { type: Number, required: true },
  trustMultiplier: { type: Number, required: true },
  actualReward: { type: Number, required: true },
  txId: { type: String, required: true },
  ipAddress: { type: String, default: '' },
  fingerprintHash: { type: String, default: '' },
  trustScore: { type: Number, default: 0 },
  trustTier: { type: Number, default: 0 },
  onChainScore: { type: Number, default: 0 },
}, { timestamps: true });

// Compound index prevents double-claims
dailyClaimSchema.index({ walletAddress: 1, claimDate: -1 }, { unique: true });
dailyClaimSchema.index({ ipAddress: 1, claimDate: -1 });
dailyClaimSchema.index({ fingerprintHash: 1, claimDate: -1 });

const DailyClaim = mongoose.model('DailyClaim', dailyClaimSchema, 'dailyclaims');

module.exports = DailyClaim;
