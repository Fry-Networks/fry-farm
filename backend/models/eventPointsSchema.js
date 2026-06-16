const mongoose = require("mongoose");

const eventPointsSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  wallet: {
    type: String,
    required: true,
  },
  challengePoints: [{
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge' },
    challengeType: { type: String },
    points: { type: Number, default: 0 },
    lastCalculated: { type: Date },
  }],
  totalPoints: {
    type: Number,
    default: 0,
  },
  rank: {
    type: Number,
  },
  airdropAmount: {
    type: Number,
  },
  airdropTxId: {
    type: String,
  },
  airdropStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
  },

  // Vesting fields
  vestingAllocation: { type: Number, default: 0 },     // total microFRY allocated, immutable once set
  vestingClaimed: { type: Number, default: 0 },        // running total microFRY claimed
  vestingLastClaimAt: { type: Date },                  // timestamp of last successful claim
  vestingLastClaimTxId: { type: String },              // Algorand txID of last claim
  vestingClaimCount: { type: Number, default: 0 },     // number of successful claims
}, { timestamps: true });

eventPointsSchema.index({ eventId: 1, wallet: 1 }, { unique: true });
eventPointsSchema.index({ eventId: 1, totalPoints: -1 });

const EventPoints = mongoose.model("EventPoints", eventPointsSchema, "eventPoints");
module.exports = EventPoints;
