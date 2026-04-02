const mongoose = require("mongoose");

const eventPointsSchema = new mongoose.Schema({
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
}, { timestamps: true });

eventPointsSchema.index({ eventId: 1, wallet: 1 }, { unique: true });
eventPointsSchema.index({ eventId: 1, totalPoints: -1 });

const EventPoints = mongoose.model("EventPoints", eventPointsSchema, "eventPoints");
module.exports = EventPoints;
