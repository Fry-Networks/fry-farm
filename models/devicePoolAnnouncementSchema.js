const mongoose = require("mongoose");

const devicePoolAnnouncementSchema = new mongoose.Schema({
  chainId: {
    type: String,
    default: 'algorand-mainnet',
    enum: ['algorand-mainnet', 'voi-mainnet'],
    index: true,
  },
  poolAppId: {
    type: String,
    required: true,
  },
  creator: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  body: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  priority: {
    type: String,
    enum: ['normal', 'urgent'],
    default: 'normal',
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  readBy: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

devicePoolAnnouncementSchema.index({ poolAppId: 1, createdAt: -1 });

const DevicePoolAnnouncement = mongoose.model("DevicePoolAnnouncement", devicePoolAnnouncementSchema, "devicePoolAnnouncements");
module.exports = DevicePoolAnnouncement;
