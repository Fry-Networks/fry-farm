const mongoose = require("mongoose");

const withdrawFarmingTokenSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  amount: {
    type: Number,
    required: true, // The amount of farming tokens being withdrawn
  },
  userWallet: {
    type: String,
    required: true, // The wallet address of the user requesting the withdrawal
  },
  poolId: {
    type: String,
    required: true, // The ID of the farming pool from which the tokens are withdrawn
  },
  farmingTokenId: {
    type: String,
    required: true, // The token ID for the farming token (e.g., FRY token)
  },
  timestamp: {
    type: Date,
    default: Date.now, // The time when the withdrawal was made
  }
});

const FarmingWithdraw = mongoose.model("FarmingWithdraw", withdrawFarmingTokenSchema, "farmingWithdrawalTokens");
module.exports = FarmingWithdraw;
