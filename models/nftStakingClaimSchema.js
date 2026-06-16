const mongoose = require("mongoose");

const nftStakingClaimSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
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
  rewardClaimed: {
    type: Number,
    required: true,
  },
  txId: {
    type: String,
    required: true,
  },
  feeAmount: {
    type: Number,
    default: 0,
  },
  claimedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

const NftStakingClaim = mongoose.model("NftStakingClaim", nftStakingClaimSchema, "nftStakingClaims");
module.exports = NftStakingClaim;
