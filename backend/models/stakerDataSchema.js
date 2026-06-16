const mongoose = require("mongoose");

const stakerDataSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  walletId: {
    type: String,
    required: true,
  },
  stakedAmount: {
    type: Number,
    required: true,
  },
  stakeTime: {
    type: Number, 
    required: true,
  },
  poolId: {
    type: String,
    required: true,
  },
  rewardClaimed: {
    type: Number,
    default: 0,
  },
  feeTxId: {
    type: String,
    default: '',
  },
  feeAssetId: {
    type: Number,
    default: 0,
  },
});


const StakerData = mongoose.model("StakerData", stakerDataSchema);
module.exports = StakerData;
