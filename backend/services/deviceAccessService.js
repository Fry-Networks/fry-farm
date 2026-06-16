const DevicePool = require("../models/devicePoolSchema");
const DevicePosition = require("../models/devicePositionSchema");

/**
 * Check if a wallet has gated access to a pool
 */
async function checkAccess(poolAppId, wallet) {
  const pool = await DevicePool.findOne({ appId: poolAppId });
  if (!pool) return { hasAccess: false, poolName: null, stakingSince: null, label: '' };

  if (!pool.gatedAccessEnabled) {
    return { hasAccess: true, poolName: pool.name, stakingSince: null, label: pool.gatedAccessLabel };
  }

  const position = await DevicePosition.findOne({
    poolAppId,
    wallet,
    status: { $in: ['active', 'escrow_locked'] },
  });

  return {
    hasAccess: !!position,
    poolName: pool.name,
    stakingSince: position?.stakeTime || null,
    label: pool.gatedAccessLabel,
  };
}

module.exports = { checkAccess };
