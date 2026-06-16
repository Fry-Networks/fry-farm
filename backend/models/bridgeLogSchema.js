const mongoose = require("mongoose");

const bridgeLogSchema = new mongoose.Schema(
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
    sourceAmount: {
      type: Number,
      required: true,
    },
    bridgeFee: {
      type: Number,
      required: true,
    },
    destinationAmount: {
      type: Number,
      required: true,
    },
    destinationAddress: {
      type: String,
      required: true,
    },
    destinationToken: {
      type: String,
      required: true,
    },
    sourceTxId: {
      type: String,
      required: true,
      unique: true,
    },
    destinationTxId: {
      type: String,
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

const BridgeLog = mongoose.model("BridgeLog", bridgeLogSchema, "bridgeLog");

module.exports = BridgeLog;
