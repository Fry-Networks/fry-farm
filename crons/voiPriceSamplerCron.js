const cron = require('node-cron');
const axios = require('axios');
const logger = require('../config/logger');
const VoiPriceSample = require('../models/voiPriceSampleSchema');

const NOMADEX_POOLS_URL = 'https://voimain-analytics.nomadex.app/pools';
const SNOWBALL_POOL_URL = 'https://api.snowballswap.com/pool';
const HUMBLE_POOLS_URL = 'https://api.humble.sh/pools';

// Fetch timeout to avoid hanging the cron
const FETCH_TIMEOUT = 15_000;

// wVOI (ARC-200 wrapped VOI) — normalize to native VOI (0) so chart queries match
const WVOI_ID = 390001;

/**
 * Compute implied price from pool reserves.
 * Returns price of tokenA in terms of tokenB (how much tokenB per 1 tokenA).
 */
function priceFromReserves(reserveA, reserveB, decimalsA, decimalsB) {
  const adjA = reserveA / Math.pow(10, decimalsA);
  const adjB = reserveB / Math.pow(10, decimalsB);
  if (adjA === 0) return 0;
  return adjB / adjA;
}

/**
 * Sample prices from Nomadex pools.
 * Nomadex analytics returns pools with balances and volume.
 */
async function sampleNomadexPools() {
  const samples = [];
  const { data: pools } = await axios.get(NOMADEX_POOLS_URL, { timeout: FETCH_TIMEOUT });

  if (!Array.isArray(pools)) return samples;

  // Also fetch token metadata for decimals
  let tokenMap = {};
  try {
    const { data: tokens } = await axios.get('https://voimain-analytics.nomadex.app/tokens', { timeout: FETCH_TIMEOUT });
    if (Array.isArray(tokens)) {
      for (const t of tokens) tokenMap[t.id] = t;
    }
  } catch (err) {
    logger.warn('voiPriceSampler: failed to fetch Nomadex tokens for decimals:', err.message);
  }

  for (const pool of pools) {
    try {
      // Skip offline pools with zero reserves; include offline pools that still have liquidity
      if (!pool.online && (Number(pool.balances?.[0] || 0) === 0 || Number(pool.balances?.[1] || 0) === 0)) continue;
      const reserveA = Number(pool.balances[0]);
      const reserveB = Number(pool.balances[1]);
      if (reserveA === 0 || reserveB === 0) continue;

      const decimalsA = tokenMap[pool.alphaId]?.decimals ?? 6;
      const decimalsB = tokenMap[pool.betaId]?.decimals ?? 6;
      const price = priceFromReserves(reserveA, reserveB, decimalsA, decimalsB);
      if (price <= 0 || !isFinite(price)) continue;

      const volA = Number(pool.volume?.[0] || 0) / Math.pow(10, decimalsA);

      // Normalize wVOI → native VOI so chart queries for VOI(0) find all pairs
      const fromId = pool.alphaId === WVOI_ID ? 0 : pool.alphaId;
      const toId = pool.betaId === WVOI_ID ? 0 : pool.betaId;

      samples.push({
        fromTokenId: fromId,
        toTokenId: toId,
        price,
        source: 'nomadex',
        volume: volA,
      });
    } catch (err) {
      logger.error(`voiPriceSampler: Nomadex pool ${pool.id} error:`, err.message);
      continue;
    }
  }

  return samples;
}

/**
 * Sample prices from Humble pools via SnowballSwap pool detail (has reserves).
 */
async function sampleHumblePools() {
  const samples = [];
  const { data: resp } = await axios.get(HUMBLE_POOLS_URL, { timeout: FETCH_TIMEOUT });
  const pools = resp.pools || resp;

  if (!Array.isArray(pools)) return samples;

  for (const pool of pools) {
    try {
      const poolId = pool.poolId || pool.contractId;
      if (!poolId) continue;

      // Get reserves from SnowballSwap pool detail
      const { data: detail } = await axios.get(`${SNOWBALL_POOL_URL}/${poolId}`, { timeout: FETCH_TIMEOUT });
      if (!detail?.reserves) continue;

      const reserveA = Number(detail.reserves.A || 0);
      const reserveB = Number(detail.reserves.B || 0);
      if (reserveA === 0 || reserveB === 0) continue;

      const tokA = detail.tokA ?? pool.tokA;
      const tokB = detail.tokB ?? pool.tokB;
      if (tokA == null || tokB == null) continue;

      // Humble tokens are ARC-200 with 6 decimals typically
      const price = priceFromReserves(reserveA, reserveB, 6, 6);
      if (price <= 0 || !isFinite(price)) continue;

      // Normalize wVOI → native VOI
      const fromId = tokA === WVOI_ID ? 0 : tokA;
      const toId = tokB === WVOI_ID ? 0 : tokB;

      samples.push({
        fromTokenId: fromId,
        toTokenId: toId,
        price,
        source: 'humble',
        volume: 0,
      });
    } catch (err) {
      logger.error(`voiPriceSampler: Humble pool ${pool.poolId} error:`, err.message);
      continue;
    }
  }

  return samples;
}

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  const start = Date.now();
  logger.info('voiPriceSampler: starting');

  try {
    // Fetch from both sources in parallel
    const [nomadexSamples, humbleSamples] = await Promise.allSettled([
      sampleNomadexPools(),
      sampleHumblePools(),
    ]);

    const allSamples = [];

    if (nomadexSamples.status === 'fulfilled') {
      allSamples.push(...nomadexSamples.value);
      logger.info(`voiPriceSampler: ${nomadexSamples.value.length} Nomadex samples`);
    } else {
      logger.error('voiPriceSampler: Nomadex fetch failed:', nomadexSamples.reason?.message);
    }

    if (humbleSamples.status === 'fulfilled') {
      allSamples.push(...humbleSamples.value);
      logger.info(`voiPriceSampler: ${humbleSamples.value.length} Humble samples`);
    } else {
      logger.error('voiPriceSampler: Humble fetch failed:', humbleSamples.reason?.message);
    }

    // For pairs with both sources, keep the one with higher volume (prefer Nomadex)
    const bestByPair = new Map();
    for (const sample of allSamples) {
      const key = `${sample.fromTokenId}-${sample.toTokenId}`;
      const existing = bestByPair.get(key);
      if (!existing || sample.volume > existing.volume) {
        bestByPair.set(key, sample);
      }
    }

    // Save to MongoDB
    const docs = [...bestByPair.values()].map(s => ({
      ...s,
      timestamp: new Date(),
    }));

    if (docs.length > 0) {
      await VoiPriceSample.insertMany(docs, { ordered: false });
    }

    logger.info(`voiPriceSampler: saved ${docs.length} samples in ${Date.now() - start}ms`);
  } catch (err) {
    // Top-level catch: NEVER let the cron crash the backend process
    logger.error('voiPriceSampler: top-level error:', err);
  }
});

logger.info('voiPriceSampler: registered (every 5 minutes)');
