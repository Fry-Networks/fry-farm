const mongoose = require("mongoose");

const nftStakedTokenSchema = new mongoose.Schema({
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
  nftAsaId: {
    type: Number,
    required: true,
  },
  nftName: {
    type: String,
    default: '',
  },
  nftImageUrl: {
    type: String,
    default: '',
  },
  stakedAt: {
    type: Date,
    default: Date.now,
  },
  unstakedAt: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const NftStakedToken = mongoose.model("NftStakedToken", nftStakedTokenSchema, "nftStakedTokens");
module.exports = NftStakedToken;
