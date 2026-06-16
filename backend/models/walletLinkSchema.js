const mongoose = require("mongoose");

const walletLinkSchema = new mongoose.Schema({
  algorandAddress: {
    type: String,
    required: true,
    unique: true,
  },
  links: [{
    chainId: { type: String, required: true },
    walletAddress: { type: String, required: true },
    signatureProof: { type: String, default: '' },
    signedMessage: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  }],
}, { timestamps: true });

const WalletLink = mongoose.model("WalletLink", walletLinkSchema, "walletLinks");
module.exports = WalletLink;
