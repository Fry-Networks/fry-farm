const mongoose = require("mongoose");

const swapLogSchema = new mongoose.Schema(
  {
    chainId: {
      type: String,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      required: true,
    },
    inputAsset: {
      type: Number,
      required: true,
    },
    outputAsset: {
      type: Number,
      required: true,
    },
    inputAmount: {
      type: Number,
      required: true,
    },
    outputAmount: {
      type: Number,
    },
    expectedOutput: {
      type: Number,
    },
    slippage: {
      type: Number,
    },
    route: {
      type: String,
    },
    txId: {
      type: String,
      required: true,
      unique: true,
    },
    wallet: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'pending',
    },
    triggerSource: {
      type: String,
    },
    error: {
      type: String,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const SwapLog = mongoose.model("SwapLog", swapLogSchema, "swapLog");

module.exports = SwapLog;
