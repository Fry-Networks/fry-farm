
const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  tokenId: {
    type: Number,
    required: true,
  },
  burnSupply: {
    type: Number,
    default: 0,
  },
  circulatingSupply: {
    type: Number,
    default: 0,
  },
  confidence: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Number,
    default: Date.now,
  },
  decimals: {
    type: Number,
    default: 6,
  },
  fullyDilutedMarketCap: {
    type: Number,
    default: 0,
  },
  labels: [{
    type: Number,
  }],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  marketCap: {
    type: Number,
    default: 0,
  },
  networkId: {
    type: Number,
    default: 0,
  },
  price: {
    type: Number,
    default: 0,
  },
  price1d: {
    type: Number,
    default: 0,
  },
  price1h: {
    type: Number,
    default: 0,
  },
  price7d: {
    type: Number,
    default: 0,
  },
  rank: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    default: "",
  },
  swaps1d: {
    type: Number,
    default: 0,
  },
  swaps1h: {
    type: Number,
    default: 0,
  },
  swaps7d: {
    type: Number,
    default: 0,
  },
  tokenImage: {
    type: String,
    default: '',
  },
  tokenName: {
    type: String,
    required: true,
  },
  tokenSymbol: {
    type: String,
    required: true,
  },
  totalSupply: {
    type: Number,
    default: 0,
  },
  tvl: {
    type: Number,
    default: 0,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  volume1d: {
    type: Number,
    default: 0,
  },
  volume1h: {
    type: Number,
    default: 0,
  },
  volume7d: {
    type: Number,
    default: 0,
  },
});

const Token = mongoose.model("Token", tokenSchema);

module.exports = Token;
