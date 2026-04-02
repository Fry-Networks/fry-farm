const mongoose = require("mongoose");

const alphaArcadePoolSchema = new mongoose.Schema({
  creatorId:            { type: String, default: 'system' },
  marketAppId:          { type: Number, required: true, unique: true },
  matcherAppId:         { type: Number, default: 3078581851 },
  marketQuestion:       { type: String, default: '' },
  marketCategory:       { type: String, default: '' },
  marketImageUrl:       { type: String, default: '' },
  marketResolutionTime: { type: Number, default: 0 },
  yesAsaId:             { type: Number, default: 0 },
  noAsaId:              { type: Number, default: 0 },
  usdcAsaId:            { type: Number, default: 31566704 },
  spreadBps:            { type: Number, default: 50 },
  rewardToken: {
    id:   { type: String, default: '' },
    name: { type: String, default: '' },
  },
  rewardTokenAmount:    { type: Number, default: 0 },
  poolStartTime:        { type: Number, default: 0 },
  poolEndTime:          { type: Number, default: 0 },
  duration:             { type: Number, default: 0 },
  aprRate:              { type: Number, default: 0 },
  lockPeriod:           { type: Number, default: 0 },
  totalProviders:       { type: Number, default: 0 },
  totalUsdcDeposited:   { type: Number, default: 0 },
  rewardsDistributed:   { type: Number, default: 0 },
  isActive:             { type: Boolean, default: true },
  isResolved:           { type: Boolean, default: false },
  resolutionOutcome:    { type: String, enum: ['yes', 'no', null], default: null },
  createdAt:            { type: Date, default: Date.now },
});

const AlphaArcadePool = mongoose.model("AlphaArcadePool", alphaArcadePoolSchema, "alphaArcadePools");
module.exports = AlphaArcadePool;
