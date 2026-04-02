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

async function getAsaUsdPrice(asaId) {
  const cacheKey = `asaUsd_${asaId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // 1) Try Tinyman asset detail API (simplest, works for verified assets)
  const assetPrice = await fetchTinymanAssetPrice(asaId);
  if (assetPrice > 0) {
    setCache(cacheKey, assetPrice);
    return assetPrice;
  }

  // 2) Try ASA/USDC pool for direct USD price
  try {
    const usdcPool = await fetchTinymanPool(asaId, USDC_ID);
    if (usdcPool) {
      const r = usdcPool.reserves || usdcPool.data?.reserves || usdcPool;
      const reserveA = Number(r?.[asaId] ?? r?.asset_1 ?? 0);
      const reserveUSDC = Number(r?.[USDC_ID] ?? r?.asset_2 ?? 0);
      if (reserveA > 0 && reserveUSDC > 0) {
        const price = reserveUSDC / reserveA;
        setCache(cacheKey, price);
        return price;
      }
    }
  } catch {
    // fallback below
  }

  // 3) Fallback: ASA/ALGO pool × ALGO/USD
  try {
    const algoUsd = await getAlgoUsdPrice();
    if (algoUsd === 0) return 0;

    const algoPool = await fetchTinymanPool(asaId, 0);
    if (!algoPool) return 0;

    const r2 = algoPool.reserves || algoPool.data?.reserves || algoPool;
    const reserveAsa = Number(r2?.[asaId] ?? 0);
    const reserveAlgo = Number(r2?.[0] ?? 0);

    if (reserveAsa > 0 && reserveAlgo > 0) {
      const price = (reserveAlgo / reserveAsa) * algoUsd;
      setCache(cacheKey, price);
      return price;
    }
  } catch (err) {
    logger.error(`getAsaUsdPrice(${asaId}) error:`, err.message);
  }

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
