const mongoose = require("mongoose");

const withdrawSchema = new mongoose.Schema({
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

const Withdraw = mongoose.model("Withdraw", withdrawSchema, "withdrawalTokens");
module.exports = Withdraw;
