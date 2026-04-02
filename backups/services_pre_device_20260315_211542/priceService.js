const axios = require('axios');
const logger = require('../config/logger');

const USDC_ID = 31566704;
const FRY_ID = 2485314946;
const CACHE_TTL_MS = 60_000;

const cache = {};

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.value;
  }
  return null;
}

function setCache(key, value) {
  cache[key] = { value, timestamp: Date.now() };
}

async function getAlgoUsdPrice() {
  const cached = getCached('algoUsd');
  if (cached !== null) return cached;

  // Try multiple Binance endpoints (api1 is geo-blocked in some regions)
  const endpoints = [
    'https://data-api.binance.vision/api/v3/ticker/price',
    'https://api1.binance.com/api/v3/ticker/price',
    'https://api.binance.com/api/v3/ticker/price',
  ];

  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep, {
        params: { symbol: 'ALGOUSDT' },
        timeout: 5000,
      });
      const price = parseFloat(res.data?.price ?? '0');
      if (price > 0) {
        setCache('algoUsd', price);
        return price;
      }
    } catch {
      // try next endpoint
    }
  }

  logger.error('getAlgoUsdPrice: all endpoints failed');
  return 0;
}

async function fetchTinymanPool(a, b) {
  const urls = [
    `https://mainnet.analytics.tinyman.org/api/v1/pool/${a}/${b}/`,
    `https://mainnet.analytics.tinyman.org/api/v1/pool/${b}/${a}/`,
  ];
  for (const url of urls) {
    try {
      const res = await axios.get(url, { timeout: 10000 });
      if (res.status === 200 && res.data) return res.data;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Fetch USD price from the Tinyman asset detail API.
 * Returns the price_in_usd field if available, or 0.
 */
async function fetchTinymanAssetPrice(asaId) {
  try {
    const res = await axios.get(
      `https://mainnet.analytics.tinyman.org/api/v1/assets/${asaId}/`,
      { timeout: 10000 }
    );
    const price = parseFloat(res.data?.price_in_usd ?? '0');
    if (price > 0) return price;
  } catch {
    // not available
  }
  return 0;
}

async function fetchVestigePrice(asaId) {
  const res = await axios.get(
    `https://api.vestigelabs.org/assets/price`,
    { params: { asset_ids: asaId, denominating_asset_id: USDC_ID }, timeout: 5000 }
  );
  const price = parseFloat(res.data?.[0]?.price ?? '0');
  if (!(price > 0)) throw new Error(`invalid price: ${JSON.stringify(res.data)}`);
  return price;
}

async function fetchTinymanPoolPrice(asaId, quoteAsaId) {
  const pool = await fetchTinymanPool(asaId, quoteAsaId);
  if (!pool) return 0;
  const r = pool.reserves || pool.data?.reserves || pool;
  const reserveAsa = Number(r?.[asaId] ?? r?.asset_1 ?? 0);
  const reserveQuote = Number(r?.[quoteAsaId] ?? r?.asset_2 ?? 0);
  if (reserveAsa > 0 && reserveQuote > 0) return reserveQuote / reserveAsa;
  return 0;
}

async function fetchTinymanPrice(asaId) {
  const assetPrice = await fetchTinymanAssetPrice(asaId);
  if (assetPrice > 0) return assetPrice;
  try {
    const usdcPrice = await fetchTinymanPoolPrice(asaId, USDC_ID);
    if (usdcPrice > 0) return usdcPrice;
  } catch { /* continue */ }
  try {
    const algoUsd = await getAlgoUsdPrice();
    if (algoUsd > 0) {
      const algoPrice = await fetchTinymanPoolPrice(asaId, 0);
      if (algoPrice > 0) return algoPrice * algoUsd;
    }
  } catch { /* continue */ }
  return 0;
}

async function fetchPactPrice(asaId) {
  try {
    const res = await axios.get(
      `https://api.pact.fi/api/assets/${asaId}`,
      { timeout: 5000 }
    );
    const price = parseFloat(res.data?.price ?? '0');
    return price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

function computeConsensusPrice(sources) {
  if (sources.length === 1) {
    return { price: sources[0].price, filtered: [], used: [sources[0].name] };
  }

  const sorted = [...sources].sort((a, b) => a.price - b.price);

  if (sources.length === 2) {
    const [low, high] = sorted;
    const ratio = (high.price - low.price) / low.price;
    if (ratio > 0.5) {
      logger.warn(
        `computeConsensusPrice: ${low.name}=$${low.price} vs ${high.name}=$${high.price} ` +
        `diverge by ${(ratio * 100).toFixed(1)}%, using conservative (lower)`
      );
      return { price: low.price, filtered: [high.name], used: [low.name] };
    }
    return { price: (low.price + high.price) / 2, filtered: [], used: sorted.map(s => s.name) };
  }

  // 3+ sources: median-based filtering
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[mid].price
    : (sorted[mid - 1].price + sorted[mid].price) / 2;

  const kept = [];
  const filteredOut = [];
  for (const s of sorted) {
    if (Math.abs(s.price - median) / median > 0.5) {
      filteredOut.push(s.name);
    } else {
      kept.push(s);
    }
  }

  if (kept.length === 0) {
    return { price: median, filtered: filteredOut, used: ['median-fallback'] };
  }

  return {
    price: kept.reduce((sum, s) => sum + s.price, 0) / kept.length,
    filtered: filteredOut,
    used: kept.map(s => s.name),
  };
}

async function getAsaUsdPrice(asaId) {
  const cacheKey = `asaUsd_${asaId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // PRIMARY: Vestige (trusted source of truth)
  try {
    const price = await fetchVestigePrice(asaId);
    setCache(cacheKey, price);
    return price;
  } catch (err) {
    logger.warn(`getAsaUsdPrice(${asaId}): Vestige unavailable (${err.message}), using fallbacks`);
  }

  // FALLBACK: Multi-source with discrepancy detection
  const results = await Promise.allSettled([
    fetchTinymanPrice(asaId).then(price => ({ name: 'Tinyman', price })),
    fetchPactPrice(asaId).then(price => ({ name: 'Pact', price })),
  ]);

  const sources = results
    .filter(r => r.status === 'fulfilled' && r.value.price > 0)
    .map(r => r.value);

  if (sources.length > 0) {
    const { price, filtered, used } = computeConsensusPrice(sources);
    if (filtered.length > 0) {
      logger.warn(`getAsaUsdPrice(${asaId}): filtered outliers [${filtered.join(', ')}], used [${used.join(', ')}]`);
    }
    if (used.length === 1) {
      logger.warn(`getAsaUsdPrice(${asaId}): single source (${used[0]}), price=$${price}`);
    }
    if (price > 0) {
      setCache(cacheKey, price);
      return price;
    }
  }

  // LAST RESORT: Manual override from feeConfig
  try {
    const FeeConfig = require('../models/feeConfigSchema');
    const config = await FeeConfig.getFeeConfig();
    const override = config.tokenPriceOverrides?.get(String(asaId));
    if (override && override > 0) {
      logger.warn(`getAsaUsdPrice(${asaId}): all sources failed, using manual override $${override}`);
      setCache(cacheKey, override);
      return override;
    }
  } catch { /* no override */ }

  logger.error(`getAsaUsdPrice(${asaId}): all price sources failed, returning 0`);
  return 0;
}

async function getFryUsdPrice() {
  return getAsaUsdPrice(FRY_ID);
}

module.exports = {
  getAlgoUsdPrice,
  getAsaUsdPrice,
  getFryUsdPrice,
};
