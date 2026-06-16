const mongoose = require('mongoose');

const p2pMarketSchema = new mongoose.Schema(
  {
    chainId: {
      type: String,
      required: true,
      enum: ['algorand-mainnet', 'voi-mainnet'],
      index: true,
    },
    appId: {
      type: Number,
      required: true,
    },
    appAddress: {
      type: String,
      required: true,
    },
    offerAssetId: {
      type: Number,
      required: true,
    },
    offerAssetName: { type: String, default: '' },
    offerAssetSymbol: { type: String, default: '' },
    offerAssetDecimals: { type: Number, default: 6 },
    requestAssetId: {
      type: Number,
      required: true,
    },
    requestAssetName: { type: String, default: '' },
    requestAssetSymbol: { type: String, default: '' },
    requestAssetDecimals: { type: Number, default: 6 },
    creator: {
      type: String,
      required: true,
    },
    feeRecipient: {
      type: String,
      required: true,
    },
    feeBps: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    gatedWallet: {
      type: String,
      default: '',
    },
    deployTxId: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

p2pMarketSchema.index({ chainId: 1, appId: 1 }, { unique: true });
p2pMarketSchema.index({ chainId: 1, isActive: 1 });
p2pMarketSchema.index({ chainId: 1, offerAssetId: 1, requestAssetId: 1 });
p2pMarketSchema.index({ chainId: 1, isActive: 1, isPrivate: 1 });

const P2PMarket = mongoose.model('P2PMarket', p2pMarketSchema, 'p2pMarkets');

module.exports = P2PMarket;
