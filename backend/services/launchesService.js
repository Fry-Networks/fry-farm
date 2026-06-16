const logger = require('../config/logger');
const { getAlgodClientForChain } = require('./algodService');
const https = require('https');

const _imageCache = new Map();
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

function ipfsToHttp(url) {
  if (!url) return null;
  if (url.startsWith('ipfs://')) return IPFS_GATEWAY + url.slice(7);
  return url.startsWith('http') ? url : null;
}

function resolveArc3Image(url) {
  const httpUrl = ipfsToHttp(url);
  if (!httpUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = https.get(httpUrl, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) { resolve(null); return; }
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (ct.startsWith('image/')) { res.destroy(); resolve(httpUrl); return; }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const meta = JSON.parse(body);
          resolve(ipfsToHttp(meta.image) || meta.image || null);
        } catch (_e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

const LAUNCHES_APP_ID = 3452678093;

async function getLaunchesStats(chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const appInfo = await client.getApplicationByID(LAUNCHES_APP_ID).do();
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
    totalTokens: state.nextTokenNum || 0,
    bondingUsd: (state.bondingUsd || 0) / 1_000_000,
    feeBpsPlatform: state.feeBpsPlatform || 0,
    feeBpsCreator: state.feeBpsCreator || 0,
    oracleAppId: state.oracleAppId || 0,
    appId: LAUNCHES_APP_ID,
  };
}

/**
 * Read token boxes from the Launches app.
 * Box format: 'a' (0x61) prefix + 8-byte uint64 ASA ID = token data.
 * Returns array of { asaId } sorted descending (newest first).
 */
async function getTokenList(chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const boxesRes = await client.getApplicationBoxes(LAUNCHES_APP_ID).do();
  const boxes = boxesRes.boxes || [];

  const tokens = [];
  for (const box of boxes) {
    const nameBytes = typeof box.name === 'string'
      ? Buffer.from(box.name, 'base64')
      : Buffer.from(box.name);

    // Token boxes: 'a' prefix (0x61) + 8-byte ASA ID
    if (nameBytes.length === 9 && nameBytes[0] === 0x61) {
      const asaId = Number(nameBytes.readBigUInt64BE(1));
      if (asaId > 0) tokens.push({ asaId });
    }
  }

  // Newest first (higher ASA IDs are newer)
  tokens.sort((a, b) => b.asaId - a.asaId);
  return tokens;
}

/**
 * Enrich token list with on-chain ASA metadata.
 * Processes in batches with delay to avoid rate limiting.
 */
async function enrichTokens(tokens, chainId = 'algorand-mainnet', limit = 50) {
  const client = getAlgodClientForChain(chainId);
  const batch = tokens.slice(0, limit);
  const results = [];

  for (const token of batch) {
    try {
      const assetInfo = await client.getAssetByID(token.asaId).do();
      const p = assetInfo.params || {};
      results.push({
        asaId: token.asaId,
        name: p.name || `Token #${token.asaId}`,
        unitName: p['unit-name'] || '',
        total: Number(p.total || 0),
        decimals: p.decimals || 0,
        creator: p.creator || '',
        url: p.url || '',
      });
    } catch (err) {
      results.push({ asaId: token.asaId, name: `Token #${token.asaId}`, error: err.message });
    }
    // Small delay between lookups
    await new Promise(r => setTimeout(r, 50));
  }

  // Resolve ARC-3 images (parallel, cached, never throws)
  await Promise.allSettled(results.map(async (r) => {
    if (_imageCache.has(r.asaId)) {
      r.imageUrl = _imageCache.get(r.asaId);
      return;
    }
    if (!r.url || r.error) { r.imageUrl = null; return; }
    try {
      const imageUrl = await resolveArc3Image(r.url);
      _imageCache.set(r.asaId, imageUrl);
      r.imageUrl = imageUrl;
    } catch (_e) { r.imageUrl = null; }
  }));

  return results;
}

/**
 * Get metadata for a single token by ASA ID.
 * Returns: { asaId, name, unitName, decimals, total, creator, url }
 */
async function getTokenDetail(asaId, chainId = 'algorand-mainnet') {
  const client = getAlgodClientForChain(chainId);
  const assetInfo = await client.getAssetByID(asaId).do();
  const p = assetInfo.params || {};

  // Resolve ARC-3 image (cached)
  let imageUrl = null;
  if (p.url) {
    if (_imageCache.has(asaId)) {
      imageUrl = _imageCache.get(asaId);
    } else {
      try {
        imageUrl = await resolveArc3Image(p.url);
        _imageCache.set(asaId, imageUrl);
      } catch (_e) { /* ignore */ }
    }
  }

  return {
    asaId,
    name: p.name || `Token #${asaId}`,
    unitName: p['unit-name'] || '',
    total: Number(p.total || 0),
    decimals: p.decimals || 0,
    creator: p.creator || '',
    url: p.url || '',
    imageUrl,
  };
}

module.exports = { getLaunchesStats, getTokenList, enrichTokens, getTokenDetail, LAUNCHES_APP_ID };
