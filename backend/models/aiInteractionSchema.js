const mongoose = require("mongoose");

const aiInteractionSchema = new mongoose.Schema(
  {
    chainId: {
      type: String,
      default: 'algorand-mainnet',
      enum: ['algorand-mainnet', 'voi-mainnet'],
      index: true,
    },
    walletAddress: {
      type: String,
      required: true,
      index: true,
    },
    interactionType: {
      type: String,
      required: true,
      enum: ["pool_analysis", "portfolio_analysis", "swap_analysis"],
    },
    paymentTxId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentAmount: {
      type: Number,
      required: true,
    },
    fryPriceAtTime: {
      type: Number,
      default: 0,
    },
    poolId: {
      type: String,
    },
    prompt: {
      type: String,
    },
    response: {
      type: String,
    },
    tokensUsed: {
      type: Number,
      default: 0,
    },
    apiCost: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    errorMessage: {
      type: String,
    },
  },
  { timestamps: true }
);

const AiInteraction = mongoose.model("AiInteraction", aiInteractionSchema);
module.exports = AiInteraction;
