const mongoose = require('mongoose');

const circuitBreakerStateSchema = new mongoose.Schema({
  currentLevel: { type: String, enum: ['green', 'yellow', 'orange', 'red'], default: 'green' },
  claimsThisHour: { type: Number, default: 0 },
  claimsToday: { type: Number, default: 0 },
  suspiciousClaimsThisHour: { type: Number, default: 0 },
  hourResetAt: { type: Date, default: () => new Date(Date.now() + 60 * 60 * 1000) },
  dayResetAt: { type: Date, default: () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }},
  manualPause: { type: Boolean, default: false },
  manualPauseReason: { type: String, default: '' },
}, { timestamps: true });

circuitBreakerStateSchema.statics.getState = async function () {
  let state = await this.findOne();
  if (!state) {
    state = await this.create({});
  }
  return state;
};

const CircuitBreakerState = mongoose.model('CircuitBreakerState', circuitBreakerStateSchema, 'circuitbreakerstate');

module.exports = CircuitBreakerState;
