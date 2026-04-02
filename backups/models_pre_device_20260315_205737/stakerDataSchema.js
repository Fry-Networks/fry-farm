const mongoose = require("mongoose");

const stakerDataSchema = new mongoose.Schema({
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
});


const StakerData = mongoose.model("StakerData", stakerDataSchema);
module.exports = StakerData;
