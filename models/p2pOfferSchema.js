const mongoose = require('mongoose');

const p2pOfferSchema = new mongoose.Schema(
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
    offerAmount: {
      type: String,
      required: true,
    },
    requestAmount: {
      type: String,
      required: true,
    },
    offerType: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    counterparty: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'filled', 'cancelled', 'expired'],
      default: 'open',
    },
    expiresAt: { type: Date, default: null },
    escrowTxId: {
      type: String,
      unique: true,
      sparse: true,
    },
    takerWallet: { type: String, default: '' },
    settlementTxId: {
      type: String,
      unique: true,
      sparse: true,
    },
    settledAt: { type: Date },
    cancelTxId: {
      type: String,
      unique: true,
      sparse: true,
    },
    cancelledAt: { type: Date },
    feeTxId: { type: String, default: '' },
    platformFeeAmount: { type: String, default: '0' },
  },
  { timestamps: true }
);

p2pOfferSchema.index({ chainId: 1, marketAppId: 1, status: 1, createdAt: -1 });
p2pOfferSchema.index({ chainId: 1, marketAppId: 1, offerId: 1 }, { unique: true });
p2pOfferSchema.index({ makerWallet: 1, status: 1, createdAt: -1 });
p2pOfferSchema.index({ counterparty: 1, status: 1 }, { sparse: true });
p2pOfferSchema.index({ status: 1, expiresAt: 1 });

const P2POffer = mongoose.model('P2POffer', p2pOfferSchema, 'p2pOffers');

module.exports = P2POffer;
