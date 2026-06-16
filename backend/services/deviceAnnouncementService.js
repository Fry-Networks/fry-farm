const logger = require("../config/logger");
const DevicePool = require("../models/devicePoolSchema");
const DevicePoolAnnouncement = require("../models/devicePoolAnnouncementSchema");

/**
 * Create a pool announcement (creator only)
 */
async function createAnnouncement(poolAppId, creatorWallet, { title, body, priority, expiresAt }) {
  const pool = await DevicePool.findOne({ appId: poolAppId });
  if (!pool) throw new Error(`Pool ${poolAppId} not found`);
  if (pool.creator !== creatorWallet) throw new Error('Only the pool creator can post announcements');

  const announcement = new DevicePoolAnnouncement({
    poolAppId,
    creator: creatorWallet,
    title,
    body,
    priority: priority || 'normal',
    expiresAt: expiresAt || null,
  });

  return announcement.save();
}

/**
 * Get announcements for a pool (non-expired, paginated)
 */
async function getAnnouncements(poolAppId, { limit = 20, before } = {}) {
  const query = {
    poolAppId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  };

  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  return DevicePoolAnnouncement.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Mark an announcement as read by a wallet
 */
async function markRead(announcementId, wallet) {
  return DevicePoolAnnouncement.findByIdAndUpdate(
    announcementId,
    { $addToSet: { readBy: wallet } },
    { new: true }
  );
}

module.exports = { createAnnouncement, getAnnouncements, markRead };
