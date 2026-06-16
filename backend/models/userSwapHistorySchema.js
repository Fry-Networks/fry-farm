const mongoose = require("mongoose");


const userSwapHistorySchema = new mongoose.Schema({
    chainId: {
      type: String,
      default: 'algorand-mainnet',
      enum: ['algorand-mainnet', 'voi-mainnet'],
      index: true,
    },
    userId: {
      type: String, 
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    token1: {
      id: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
    },
    token2: {
      id: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
    },
    timeOfSwap: {
      type: Date,
      default: Date.now,
    },
    liquidityPoolId: {
      type: String,
      required: true,
    },
    fee: {
      type: Number,
      required: true,
    },
  });
  
  module.exports = mongoose.model("UserSwapHistory", userSwapHistorySchema);
  