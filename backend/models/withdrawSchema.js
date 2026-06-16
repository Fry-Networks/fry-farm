const mongoose = require("mongoose");

const withdrawSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  tokens: {
    type: Number,
    required: true,
  },
  wallet: {
    type: String,
    required: true,
  },
  poolId: {
    type: String,
    required: true,
  },
  appId: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
});

withdrawSchema.index({ wallet: 1, poolId: 1, timestamp: 1 });
withdrawSchema.index({ appId: 1, wallet: 1 });

const Withdraw = mongoose.model("Withdraw", withdrawSchema, "withdrawalTokens");
module.exports = Withdraw;
