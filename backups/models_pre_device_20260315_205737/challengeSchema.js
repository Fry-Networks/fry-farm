const mongoose = require("mongoose");

const challengeSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'staking_volume',
      'farming_volume',
      'trading_volume',
      'staking_profit',
      'farming_profit',
      'daily_claim_streak',
      'hold_duration',
      'referral',
      'nft_staking_volume',
      'prediction_lp_volume',
    ],
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  pointsMultiplier: {
    type: Number,
    default: 1.0,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  config: {
    minAmount: { type: Number },
    specificPoolIds: [{ type: String }],
    specificTokenIds: [{ type: Number }],
    streakBonusPerDay: { type: Number, default: 10 },
  },
}, { timestamps: true });

challengeSchema.index({ eventId: 1, type: 1 });

const Challenge = mongoose.model("Challenge", challengeSchema, "challenges");
module.exports = Challenge;
