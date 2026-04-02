const mongoose = require('mongoose');

const feeConfigSchema = new mongoose.Schema(
  {
    // Staking fees
    stakingDepositFeePercent: { type: Number, default: 0.5 },
    stakingWithdrawFeePercent: { type: Number, default: 0.25 },
    stakingClaimFeePercent: { type: Number, default: 8.0 },

    // Farming fees
    farmingDepositFeePercent: { type: Number, default: 0.5 },
    farmingWithdrawFeePercent: { type: Number, default: 0.25 },
    farmingClaimFeePercent: { type: Number, default: 8.0 },

    // Swap fee
    swapFeePercent: { type: Number, default: 0.1 },

    // Daily claim fee
    dailyClaimFeePercent: { type: Number, default: 5.0 },

    // Pool creation fee (USD-pegged, converted to FRY dynamically)
    poolCreationFeeUsd: { type: Number, default: 1.0 },

    // Fee recipient wallet
    feeRecipient: {
      type: String,
      default: 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE',
    },

    // Revenue split percentages (must sum to 100)
    revShareStakers: { type: Number, default: 60 },
    revShareTreasury: { type: Number, default: 25 },
    revSharePoolCreator: { type: Number, default: 10 },
    revShareCompound: { type: Number, default: 5 },

    // Metadata
    updatedBy: { type: String },
  },
  { timestamps: true }
);

feeConfigSchema.statics.getFeeConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

const FeeConfig = mongoose.model('FeeConfig', feeConfigSchema, 'feeconfig');

module.exports = FeeConfig;
