const logger = require('../config/logger');
const { getAlgodClientForChain } = require('./algodService');

const DROPS_APP_ID = 2936934082;

async function getDropsStats(chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const appInfo = await client.getApplicationByID(DROPS_APP_ID).do();
  const gs = appInfo.params.globalState || appInfo.params['global-state'] || [];

  const state = {};
  for (const item of gs) {
    const key = typeof item.key === 'string'
      ? Buffer.from(item.key, 'base64').toString('utf8')
      : Buffer.from(item.key).toString('utf8');
    if (item.value.type === 2) {
      state[key] = Number(item.value.uint);
    }
  }

  return {
    totalDrops: state.lastDropId || 0,
    totalClaims: state.totalClaims || 0,
    perClaimFee: (state.perClaimFeeAmount || 0) / 1_000_000,
    creationFee: (state.creationFeeAmount || 0) / 1_000_000,
    nfdRegistryId: state.nfdRegistryId || 0,
    appId: DROPS_APP_ID,
  };
}

/**
 * Read drop boxes from the Drops app.
 * Drops are stored as boxes with various naming conventions.
 * Returns the total count and basic info.
 */
async function getDropList(chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const boxesRes = await client.getApplicationBoxes(DROPS_APP_ID).do();
  const boxes = boxesRes.boxes || [];

  // Count unique box patterns
  const dropBoxes = [];
  for (const box of boxes) {
    const nameBytes = typeof box.name === 'string'
      ? Buffer.from(box.name, 'base64')
      : Buffer.from(box.name);

    // Drop data boxes are typically short-keyed (drop ID based)
    if (nameBytes.length <= 16) {
      dropBoxes.push({
        name: nameBytes.toString('base64'),
        length: nameBytes.length,
      });
    }
  }

  return { totalBoxes: boxes.length, drops: dropBoxes.length };
}

/**
 * Get basic drop info by dropId.
 * Returns: { dropId, appId, status }
 * NOTE: Box parsing for detailed drop data is deferred.
 */
async function getDropDetail(dropId, chainId = 'algorand-mainnet') {
  // Validate that the app exists
  const client = getAlgodClientForChain(chainId);
  await client.getApplicationByID(DROPS_APP_ID).do();

  return {
    dropId,
    appId: DROPS_APP_ID,
    status: 'active',
  };
}

/**
 * Check eligibility for a wallet on a drop.
 * Returns basic eligibility placeholder.
 * NOTE: Detailed eligibility logic (NFD/token/whitelist checks) deferred.
 */
async function checkEligibility(dropId, wallet, chainId = 'algorand-mainnet') {
  // Basic validation
  if (!wallet || typeof wallet !== 'string' || wallet.trim().length === 0) {
    throw new Error('wallet must be a non-empty string');
  }

  return {
    dropId,
    wallet,
    eligible: true,
    reason: 'eligibility check pending implementation',
  };
}

module.exports = { getDropsStats, getDropList, getDropDetail, checkEligibility, DROPS_APP_ID };
