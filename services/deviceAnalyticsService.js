const logger = require("../config/logger");
const DevicePool = require("../models/devicePoolSchema");
const DevicePosition = require("../models/devicePositionSchema");

/**
 * Update analytics for a pool (aggregated from positions)
 */
async function updatePoolAnalytics(poolAppId) {
  try {
    const pipeline = [
      { $match: { poolAppId, status: { $ne: 'unstaked' } } },
      {
        $group: {
          _id: null,
          totalUniqueStakers: { $addToSet: '$wallet' },
          deviceTypes: { $push: '$deviceChainId' },
          stakeTimes: { $push: '$stakeTime' },
        },
      },
    ];

    const [result] = await DevicePosition.aggregate(pipeline);
    if (!result) return;

    const uniqueStakers = result.totalUniqueStakers.length;

    // Device type breakdown
    const deviceTypeBreakdown = {};
    for (const dt of result.deviceTypes) {
      deviceTypeBreakdown[dt] = (deviceTypeBreakdown[dt] || 0) + 1;
    }

    // Average stake duration
    const now = Date.now();
    const durations = result.stakeTimes.map(st => (now - new Date(st).getTime()) / 86400000);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // 30-day retention: positions staked > 30 days ago that are still active
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    const oldPositions = await DevicePosition.countDocuments({
      poolAppId,
      stakeTime: { $lte: thirtyDaysAgo },
      status: { $ne: 'unstaked' },
    });
    const totalOld = await DevicePosition.countDocuments({
      poolAppId,
      stakeTime: { $lte: thirtyDaysAgo },
    });
    const retention = totalOld > 0 ? (oldPositions / totalOld) * 100 : 0;

    await DevicePool.findOneAndUpdate(
      { appId: poolAppId },
      {
        $set: {
          'analytics.totalUniqueStakers': uniqueStakers,
          'analytics.deviceTypeBreakdown': deviceTypeBreakdown,
          'analytics.averageStakeDurationDays': Math.round(avgDuration * 100) / 100,
          'analytics.retentionRate30d': Math.round(retention * 100) / 100,
          'analytics.lastAnalyticsUpdate': new Date(),
        },
      }
    );
  } catch (err) {
    logger.error(`updatePoolAnalytics error for ${poolAppId}:`, err.message);
  }
}

/**
 * Get creator analytics for a pool
 */
async function getCreatorAnalytics(poolAppId, creatorWallet) {
  const pool = await DevicePool.findOne({ appId: poolAppId });
  if (!pool) throw new Error(`Pool ${poolAppId} not found`);
  if (pool.creator !== creatorWallet) throw new Error('Only the pool creator can view analytics');

  // Positions by status
  const statusBreakdown = await DevicePosition.aggregate([
    { $match: { poolAppId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  // Requirement compliance rates
  const activePositions = await DevicePosition.find({
    poolAppId,
    status: { $ne: 'unstaked' },
  }).lean();

  const requirementCompliance = {};
  for (const pos of activePositions) {
    for (const rs of (pos.requirementStatus || [])) {
      if (!requirementCompliance[rs.requirementId]) {
        requirementCompliance[rs.requirementId] = { met: 0, total: 0 };
      }
      requirementCompliance[rs.requirementId].total++;
      if (rs.met) requirementCompliance[rs.requirementId].met++;
    }
  }

  // Convert to percentages
  const complianceRates = {};
  for (const [id, data] of Object.entries(requirementCompliance)) {
    complianceRates[id] = data.total > 0
      ? Math.round((data.met / data.total) * 10000) / 100
      : 0;
  }

  // Multiplier distribution
  const multiplierDist = await DevicePosition.aggregate([
    { $match: { poolAppId, status: { $ne: 'unstaked' } } },
    {
      $bucket: {
        groupBy: '$effectiveMultiplier',
        boundaries: [0, 10000, 12500, 15000, 20000, 50000, 100001],
        default: 'other',
        output: { count: { $sum: 1 } },
      },
    },
  ]);

  // Total claimed
  const claimAgg = await DevicePosition.aggregate([
    { $match: { poolAppId } },
    { $group: { _id: null, totalClaimed: { $sum: '$totalClaimed' } } },
  ]);

  // Staker growth (by month)
  const growth = await DevicePosition.aggregate([
    { $match: { poolAppId } },
    {
      $group: {
        _id: {
          year: { $year: '$stakeTime' },
          month: { $month: '$stakeTime' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  return {
    pool: { appId: pool.appId, name: pool.name, analytics: pool.analytics },
    statusBreakdown: statusBreakdown.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
    complianceRates,
    multiplierDistribution: multiplierDist,
    totalClaimed: claimAgg[0]?.totalClaimed || 0,
    stakerGrowth: growth,
  };
}

module.exports = { updatePoolAnalytics, getCreatorAnalytics };
