const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true },
  grossAmount: { type: Number, required: true },
  liquidAmount: { type: Number, required: true },
  vaultAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['reserved', 'chain_pending', 'db_finalizing', 'finalized', 'failed'],
    default: 'reserved',
  },
  reservedAt: { type: Date, default: Date.now },
  chainSubmitStartedAt: Date,
  txId: String,
  chainConfirmedAt: Date,
  finalizedAt: Date,
  failedAt: Date,
  failureReason: String,
}, { _id: true });

const dailyBudgetSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  totalGrossIssued: { type: Number, default: 0 },
  totalLiquidIssued: { type: Number, default: 0 },
  totalVaultIssued: { type: Number, default: 0 },
  claimCount: { type: Number, default: 0 },
  budgetLimit: { type: Number, required: true },
  maxPerUser: { type: Number, required: true },
  reservations: [reservationSchema],
}, { timestamps: true });


const DailyBudget = mongoose.model('DailyBudget', dailyBudgetSchema, 'dailybudgets');

module.exports = DailyBudget;
