const mongoose = require('mongoose');

const vaultEntrySchema = new mongoose.Schema({
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  amount: { type: Number, required: true },
  claimDate: { type: String, required: true },
  status: {
    type: String,
    enum: ['locked', 'unlockable', 'claimed', 'expired'],
    default: 'locked',
  },
  unlocked_at: Date,
  claimed_at: Date,
  tx_id: String,
}, { _id: true });

const rewardVaultSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true },
  entries: [vaultEntrySchema],
  totalLocked: { type: Number, default: 0 },
  totalUnlockable: { type: Number, default: 0 },
  totalClaimed: { type: Number, default: 0 },
  totalExpired: { type: Number, default: 0 },
}, { timestamps: true });


const RewardVault = mongoose.model('RewardVault', rewardVaultSchema, 'rewardvaults');

module.exports = RewardVault;
