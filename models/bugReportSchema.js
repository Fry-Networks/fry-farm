const mongoose = require('mongoose');

const bugReportSchema = new mongoose.Schema({
  walletId: {
    type: String,
    required: true,
    index: true,
  },
  walletAddress: {
    type: String,
    required: true,
  },
  chain: {
    type: String,
    required: true,
    enum: ['algorand', 'voi'],
  },
  discordUsername: {
    type: String,
  },
  title: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['ui', 'staking', 'farming', 'nft-staking', 'swap', 'prediction', 'device-staking', 'other'],
  },
  screenshot: {
    type: String,
  },
  consoleLog: {
    type: String,
  },
  harFile: {
    type: String,
  },
  status: {
    type: String,
    enum: ['open', 'acknowledged', 'resolved', 'closed'],
    default: 'open',
  },
}, {
  timestamps: true,
  collection: 'bug_reports',
});

const BugReport = mongoose.model('BugReport', bugReportSchema, 'bug_reports');
module.exports = BugReport;
