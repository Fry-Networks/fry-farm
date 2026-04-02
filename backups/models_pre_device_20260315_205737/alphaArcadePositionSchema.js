const mongoose = require("mongoose");

const alphaArcadePositionSchema = new mongoose.Schema({
  wallet:              { type: String, required: true },
  poolId:              { type: String, required: true },
  marketAppId:         { type: Number, required: true },
  usdcDeposited:       { type: Number, default: 0 },
  yesEscrowAppIds:     { type: [Number], default: [] },
  noEscrowAppIds:      { type: [Number], default: [] },
  spreadUsed:          { type: Number, default: 0 },
  entryMidPrice:       { type: Number, default: 0 },
  status:              { type: String, enum: ['active','pending_withdrawal','withdrawing','withdrawn','auto_withdrawn','resolved'], default: 'active' },
  warningsSent:        [{
    type:   { type: String, enum: ['48hr', '24hr', '6hr'] },
    sentAt: { type: Date, default: Date.now },
  }],
  autoWithdrawTriggered: { type: Boolean, default: false },
  autoWithdrawAt:      { type: Date, default: null },
  withdrawnAt:         { type: Date, default: null },
  usdcRecovered:       { type: Number, default: 0 },
  remainingYesTokens:  { type: Number, default: 0 },
  remainingNoTokens:   { type: Number, default: 0 },
  feesPaid: {
    depositFee:      { type: Number, default: 0 },
    withdrawFee:     { type: Number, default: 0 },
  },
}, { timestamps: true });

alphaArcadePositionSchema.index({ wallet: 1, status: 1 });
alphaArcadePositionSchema.index({ marketAppId: 1, status: 1 });
alphaArcadePositionSchema.index({ poolId: 1, wallet: 1 });

const AlphaArcadePosition = mongoose.model("AlphaArcadePosition", alphaArcadePositionSchema, "alphaArcadePositions");
module.exports = AlphaArcadePosition;
