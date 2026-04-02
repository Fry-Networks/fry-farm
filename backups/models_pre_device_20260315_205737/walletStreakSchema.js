const mongoose = require('mongoose');

const walletStreakSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true, index: true },
  currentStreak: { type: Number, default: 0 },
  lastClaimAt: { type: Date, default: null },
  totalClaimed: { type: Number, default: 0 },
  totalClaims: { type: Number, default: 0 },
  trustScore: { type: Number, default: 0, min: 0, max: 1 },
  trustTier: { type: Number, default: 0, min: 0, max: 3 },
  suspicionFlags: { type: [String], default: [] },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: '' },
}, { timestamps: true });

const WalletStreak = mongoose.model('WalletStreak', walletStreakSchema, 'walletstreaks');

module.exports = WalletStreak;
