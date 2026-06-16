const mongoose = require('mongoose');

const stakingClaimRecordSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  wallet: { type: String, required: true, index: true },
  appId: { type: Number, required: true, index: true },
  amount: { type: Number, required: true },
  txId: { type: String, required: true, unique: true },
  claimedAt: { type: Date, required: true, default: Date.now },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
}, { timestamps: true });

stakingClaimRecordSchema.index({ wallet: 1, appId: 1 });

const StakingClaimRecord = mongoose.model('StakingClaimRecord', stakingClaimRecordSchema, 'stakingClaimRecords');

module.exports = StakingClaimRecord;
