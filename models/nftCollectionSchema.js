const mongoose = require("mongoose");

const nftCollectionSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  creatorAddress: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    default: '',
  },
  imageUrl: {
    type: String,
    default: '',
  },
  totalSupply: {
    type: Number,
    default: 0,
  },
  sampleAsaIds: {
    type: [Number],
    default: [],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  lastSync: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound unique index — one collection per creator per chain
nftCollectionSchema.index({ chainId: 1, creatorAddress: 1 }, { unique: true });

const NftCollection = mongoose.model("NftCollection", nftCollectionSchema, "nftCollections");
module.exports = NftCollection;
