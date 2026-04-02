const logger = require("../config/logger");
const axios = require('axios');

const FOLKS_BASE = 'https://api.folksrouter.io/v1';
const VESTIGE_BASE = 'https://api.vestigelabs.org';
const REQUEST_TIMEOUT = 15000;

// --- In-memory quote cache ---
const quoteCache = new Map();
const CACHE_TTL = 10000; // 10 seconds
const RATE_LIMIT_TTL = 30000; // 30 seconds cooldown on 429

function getCacheKey(provider, params) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return `${provider}:${sorted}`;
}

async function getCachedOrFetch(cacheKey, ttlMs, fetchFn) {
  const cached = quoteCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < ttlMs) {
    return { data: cached.data, fromCache: true, rateLimited: cached.rateLimited || false };
  }
  const data = await fetchFn();
  quoteCache.set(cacheKey, { data, timestamp: now, rateLimited: false });
  return { data, fromCache: false, rateLimited: false };
}

function cacheRateLimited(cacheKey) {
  quoteCache.set(cacheKey, {
    data: { success: false, message: 'Rate limited — try again shortly' },
    timestamp: Date.now(),
    rateLimited: true,
  });
}

// Purge stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of quoteCache) {
    if (now - entry.timestamp > 30000) quoteCache.delete(key);
  }
}, 60000);

/**
 * GET /swap/folks/quote
 * Proxies to FolksRouter quote endpoint
 */
const proxyFolksQuote = async (req, res) => {
  const cacheKey = getCacheKey('folks', req.query);
  try {
    const { data, fromCache, rateLimited } = await getCachedOrFetch(cacheKey, CACHE_TTL, async () => {
      const resp = await axios.get(`${FOLKS_BASE}/fetch/quote`, {
        params: req.query,
        timeout: REQUEST_TIMEOUT,
      });
      return resp.data;
    });
    if (rateLimited) {
      res.set('X-Cache', 'HIT').status(429).json(data);
      return;
    }
    res.set('X-Cache', fromCache ? 'HIT' : 'MISS').json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    if (status === 429) cacheRateLimited(cacheKey);
    res.status(status).json({
      success: false,
      message: err.response?.data?.message || 'FolksRouter quote failed',
    });
  }
};

/**
 * GET /swap/folks/prepare
 * Proxies to FolksRouter prepare/swap endpoint
 */
const proxyFolksPrepare = async (req, res) => {
  try {
    console.log(`[FolksRouter Prepare] Request params: ${JSON.stringify(req.query)}`);
    const { data } = await axios.get(`${FOLKS_BASE}/prepare/swap`, {
      params: req.query,
      timeout: REQUEST_TIMEOUT,
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    const respBody = JSON.stringify(err.response?.data || {}).slice(0, 500);
    console.error(`[FolksRouter Prepare] Error ${status} | params: ${JSON.stringify(req.query)} | upstream body: ${respBody}`);
    res.status(status).json({
      success: false,
      message: err.response?.data?.message || 'FolksRouter prepare failed',
    });
  }
};

/**
 * GET /swap/vestige/quote
 * Proxies to Vestige swap quote endpoint
 */
const proxyVestigeQuote = async (req, res) => {
  const cacheKey = getCacheKey('vestige', req.query);
  try {
    const { data, fromCache, rateLimited } = await getCachedOrFetch(cacheKey, CACHE_TTL, async () => {
      const resp = await axios.get(`${VESTIGE_BASE}/swap/v4`, {
        params: req.query,
        timeout: REQUEST_TIMEOUT,
      });
      return resp.data;
    });
    if (rateLimited) {
      res.set('X-Cache', 'HIT').status(429).json(data);
      return;
    }
    res.set('X-Cache', fromCache ? 'HIT' : 'MISS').json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    if (status === 429) cacheRateLimited(cacheKey);
    res.status(status).json({
      success: false,
      message: err.response?.data?.message || 'Vestige quote failed',
    });
  }
};

/**
 * POST /swap/vestige/transactions
 * Proxies to Vestige swap transactions endpoint
 */
const proxyVestigeTransactions = async (req, res) => {
  try {
    const bodyType = typeof req.body;
    const bodyKeys = req.body ? Object.keys(req.body) : [];
    const bodySize = req.body ? JSON.stringify(req.body).length : 0;
    console.log(`[Vestige Transactions] body present: ${!!req.body}, typeof: ${bodyType}, keys: [${bodyKeys}], size: ${bodySize}B, query: ${JSON.stringify(req.query)}`);
    const { data } = await axios.post(`${VESTIGE_BASE}/swap/v4/transactions`, req.body, {
      params: req.query,
      timeout: REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    const respBody = JSON.stringify(err.response?.data || {}).slice(0, 500);
    console.error(`[Vestige Transactions] Error ${status} | query: ${JSON.stringify(req.query)} | upstream body: ${respBody}`);
    console.error(`[Vestige Transactions] req.body present: ${!!req.body}, typeof: ${typeof req.body}, keys: [${req.body ? Object.keys(req.body) : []}]`);
    res.status(status).json({
      success: false,
      message: err.response?.data?.message || 'Vestige transactions failed',
    });
  }
};

/**
 * POST /swap/deflex/quote
 * Runs Deflex SDK server-side to get a swap quote
 */
const proxyDeflexQuote = async (req, res) => {
  return res.status(503).json({ success: false, message: 'Deflex temporarily unavailable — SSL cert expired' });
  try {
    const { fromASAId, toASAId, amount } = req.body;
    if (fromASAId === undefined || toASAId === undefined || amount === undefined) {
      return res.status(400).json({ success: false, message: 'fromASAId, toASAId, amount required' });
    }

    const cacheKey = getCacheKey('deflex', { fromASAId, toASAId, amount });
    const { data, fromCache, rateLimited } = await getCachedOrFetch(cacheKey, CACHE_TTL, async () => {
      const { DeflexOrderRouterClient } = require('@deflex/deflex-sdk-js');
      const algodServer = process.env.ALGOD_SERVER || 'https://mainnet-api.algonode.cloud';
      const algodToken = process.env.ALGOD_TOKEN || '';
      const algodPort = process.env.ALGOD_PORT || '';

      const client = DeflexOrderRouterClient.fetchMainnetClient(algodServer, algodToken, algodPort);
      const quote = await client.getFixedInputSwapQuote(fromASAId, toASAId, amount);
      return { success: true, quote };
    });

    if (rateLimited) {
      res.set('X-Cache', 'HIT').status(429).json(data);
      return;
    }
    res.set('X-Cache', fromCache ? 'HIT' : 'MISS').json(data);
  } catch (err) {
    logger.error('Deflex quote error:', err.message);
    res.status(502).json({
      success: false,
      message: err.message || 'Deflex quote failed',
    });
  }
};

/**
 * POST /swap/deflex/transactions
 * Runs Deflex SDK server-side to get swap transactions
 * Returns serialized transactions as base64 with lsig indicators
 */
const proxyDeflexTransactions = async (req, res) => {
  try {
    const { address, quote, slippageBps } = req.body;
    if (!address || !quote || slippageBps === undefined) {
      return res.status(400).json({ success: false, message: 'address, quote, slippageBps required' });
    }

    const { DeflexOrderRouterClient } = require('@deflex/deflex-sdk-js');
    const algodServer = process.env.ALGOD_SERVER || 'https://mainnet-api.algonode.cloud';
    const algodToken = process.env.ALGOD_TOKEN || '';
    const algodPort = process.env.ALGOD_PORT || '';

    const client = DeflexOrderRouterClient.fetchMainnetClient(algodServer, algodToken, algodPort);
    const txnGroup = await client.getSwapQuoteTransactions(address, quote, slippageBps / 10000);

    // Serialize transactions for frontend
    const serialized = txnGroup.txns.map((t) => ({
      data: typeof t.data === 'string' ? t.data : Buffer.from(t.data).toString('base64'),
      hasLogicSig: t.logicSigBlob instanceof Uint8Array,
      logicSigBlob: t.logicSigBlob instanceof Uint8Array
        ? Buffer.from(t.logicSigBlob).toString('base64')
        : null,
    }));

    res.json({ success: true, txns: serialized });
  } catch (err) {
    logger.error('Deflex transactions error:', err.message);
    res.status(502).json({
      success: false,
      message: err.message || 'Deflex transactions failed',
    });
  }
};

module.exports = {
  proxyFolksQuote,
  proxyFolksPrepare,
  proxyVestigeQuote,
  proxyVestigeTransactions,
  proxyDeflexQuote,
  proxyDeflexTransactions,
};
