const mongoose = require('mongoose');

const voiPriceSampleSchema = new mongoose.Schema({
  fromTokenId: { type: Number, required: true },
  toTokenId:   { type: Number, required: true },
  price:       { type: Number, required: true },
  source:      { type: String, enum: ['nomadex', 'humble'] },
  volume:      { type: Number, default: 0 },
  timestamp:   { type: Date, default: Date.now },
});

voiPriceSampleSchema.index({ fromTokenId: 1, toTokenId: 1, timestamp: 1 });
voiPriceSampleSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('VoiPriceSample', voiPriceSampleSchema);
