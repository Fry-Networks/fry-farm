const mongoose = require("mongoose");

const feeDistributionLogSchema = new mongoose.Schema(
  {
    epochId: {
      type: String,
      required: true,
      unique: true,
    },
    chainId: {
      type: String,
      required: true,
      enum: ["algorand-mainnet", "voi-mainnet"],
    },
    totalFeesProcessed: {
      type: Number,
      required: true,
    },
    feeRecordCount: {
      type: Number,
      required: true,
    },
    stakerAmount: {
      type: Number,
      required: true,
    },
    compoundAmount: {
      type: Number,
      required: true,
    },
    treasuryRetained: {
      type: Number,
      required: true,
    },
    poolCreatorOnChain: {
      type: Number,
      required: true,
    },
    distPoolDeposit: {
      type: Number,
      required: true,
    },
    distPoolDepositTxId: {
      type: String,
      default: null,
    },
    startEpochTxId: {
      type: String,
      default: null,
    },
    newEpochNumber: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "deposited", "epoch_started", "failed", "partial"],
      default: "pending",
    },
    error: {
      type: String,
      default: null,
    },
    feeRecordIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "GasFee",
    }],
    // Voi cross-chain tracking
    voiBridgeTxId: { type: String, default: null },
    voiBridgeAmountMicro: { type: Number, default: null },
    voiSwapLeg1TxId: { type: String, default: null },
    voiSwapLeg2TxId: { type: String, default: null },
    voiFryReceived: { type: Number, default: null },
    voiFeeRecordCount: { type: Number, default: null },
    voiStatus: {
      type: String,
      enum: ['skipped', 'bridged', 'swapped', 'failed', null],
      default: null,
    },
    voiError: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

const FeeDistributionLog = mongoose.model(
  "FeeDistributionLog",
  feeDistributionLogSchema,
  "feeDistributionLog"
);

module.exports = FeeDistributionLog;
