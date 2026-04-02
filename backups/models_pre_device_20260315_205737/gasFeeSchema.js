const mongoose = require("mongoose");

const gasFeeSchema = new mongoose.Schema(
  {
    appId: {
      type: Number,
      required: true,
    },
    userId: {
      type: String, // Assuming it's a wallet address or user reference ID
      required: true,
    },
    gasAmount: {
      type: Number, // Amount in microAlgos or desired unit
      required: true,
    },
    gasType: {
      type: String,
      required: true,
    },
    feePercent: {
      type: Number,
    },
    feeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'flat',
    },
    baseAmount: {
      type: Number,
    },
    baseToken: {
      type: String,
    },
    feeToken: {
      type: String,
    },
    txId: {
      type: String,
    },
    usdValue: {
      type: Number,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

const GasFee = mongoose.model("GasFee", gasFeeSchema, "gasFee");

module.exports = GasFee;
