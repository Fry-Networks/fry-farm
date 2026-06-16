const mongoose = require('mongoose');

const p2pTradeSchema = new mongoose.Schema(
  {
    chainId: {
      type: String,
      required: true,
      enum: ['algorand-mainnet', 'voi-mainnet'],
      index: true,
    },
    marketAppId: {
      type: Number,
      required: true,
    },
    offerId: {
      type: Number,
      required: true,
    },
    makerWallet: {
      type: String,
      required: true,
    },
    takerWallet: {
      type: String,
      required: true,
    },
    offerAssetId: { type: Number },
    offerAmount: { type: String },
    requestAssetId: { type: Number },
    requestAmount: { type: String },
    feeAmount: { type: String, default: '0' },
    feeRecipient: { type: String, default: '' },
    settlementTxId: {
      type: String,
      required: true,
      unique: true,
    },
    settledAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

p2pTradeSchema.index({ chainId: 1, marketAppId: 1, settledAt: -1 });
p2pTradeSchema.index({ makerWallet: 1, settledAt: -1 });
p2pTradeSchema.index({ takerWallet: 1, settledAt: -1 });

const P2PTrade = mongoose.model('P2PTrade', p2pTradeSchema, 'p2pTrades');

module.exports = P2PTrade;
