const mongoose = require('mongoose');

const rewardsConfigSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  isEnabled: { type: Boolean, default: true },
  rewardSchedule: {
    type: [Number],
    default: [100, 150, 200, 300, 500, 750, 1500],
  },
  // Anti-sybil thresholds
  minAlgoBalance: { type: Number, default: 5 },
  minFryBalance: { type: Number, default: 100 },
  minWalletAgeDays: { type: Number, default: 7 },
  maxClaimsPerIpPerDay: { type: Number, default: 3 },
  maxClaimsPerFingerprintPerDay: { type: Number, default: 3 },
  minOnChainScore: { type: Number, default: 2 },
  // Timing
  streakResetHours: { type: Number, default: 48 },
  claimCooldownHours: { type: Number, default: 20 },
  // Trust tiers
  trustTierThresholds: { type: [Number], default: [0.3, 0.6, 0.8] },
  trustTierMultipliers: { type: [Number], default: [0.2, 0.5, 1.0, 1.1] },
  // Circuit breaker
  baselineClaimsPerHour: { type: Number, default: 30 },
  yellowMultiplier: { type: Number, default: 1.5 },
  orangeMultiplier: { type: Number, default: 2.0 },
  redMultiplier: { type: Number, default: 3.0 },
  maxDailyClaimsAutoCap: { type: Number, default: 500 },
  minTreasuryBalance: { type: Number, default: 10000 },
  // Misc
  alertWebhookUrl: { type: String, default: '' },
  adminWallets: { type: [String], default: [] },
  fryAsaId: { type: Number, default: 2485314946 },
  indexerUrl: { type: String, default: 'https://mainnet-idx.4160.nodely.dev' },
  // Capped-hybrid reward model
  cappedHybridEnabled: { type: Boolean, default: false },
  dailyGlobalBudget: { type: Number, default: 5000 },
  maxGrossPerUser: { type: Number, default: 25 },
  liquidBps: { type: Number, default: 2000 },
  vaultBps: { type: Number, default: 8000 },
  weeklyUnlockRequiredDays: { type: Number, default: 5 },
  minStakedForVault: { type: Number, default: 1000 },
  requireMinStakeForVault: { type: Boolean, default: false },
  vaultWeekStartDay: { type: Number, default: 5 },
}, { timestamps: true });

rewardsConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

const RewardsConfig = mongoose.model('RewardsConfig', rewardsConfigSchema, 'rewardsconfig');

module.exports = RewardsConfig;
