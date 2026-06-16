const axios = require('axios');
const logger = require('../config/logger');
const { getAsaUsdPrice, getAlgoUsdPrice } = require('./priceService');

// --- In-memory cache (matching priceService.js pattern) ---
const cache = {};

function getCached(key, ttlMs) {
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < ttlMs) {
    return entry.value;
  }
  return null;
}

function setCache(key, value) {
  cache[key] = { value, timestamp: Date.now() };
}

// --- Constants ---
const { getIndexerUrl } = require('./algodService');
const _getIndexerBaseV2 = () => `${getIndexerUrl()}/v2`;
const PERA_BASE = 'https://mainnet.api.perawallet.app/v1/public';
const CACHE_1HR = 60 * 60 * 1000;
const CACHE_6HR = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;

// --- Step 1: DappRadar (optional — skipped if no API key) ---

async function fetchDappRadarFloor(asaId) {
  const apiKey = process.env.DAPPRADAR_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `dappradar_${asaId}`;
  const cached = getCached(cacheKey, CACHE_1HR);
  if (cached !== null) return cached;

  try {
    const res = await axios.get(
      'https://api.dappradar.com/4tsxo4vuhotaojtl/nfts/collections',
      {
        headers: { 'X-BLOBR-KEY': apiKey },
        params: { chain: 'algorand', asset_id: asaId },
        timeout: REQUEST_TIMEOUT,
      }
    );
    const floorUsd = parseFloat(res.data?.results?.[0]?.floorPriceUsd ?? '0');
    if (floorUsd > 0) {
      setCache(cacheKey, floorUsd);
      return floorUsd;
    }
  } catch (err) {
    logger.warn(`nftPriceOracle: DappRadar failed for ASA ${asaId}: ${err.message}`);
  }
  return null;
}

// --- Step 2: Pera API (no auth) ---

async function fetchPeraPrice(asaId) {
  const cacheKey = `pera_nft_${asaId}`;
  const cached = getCached(cacheKey, CACHE_1HR);
  if (cached !== null) return cached;

  try {
    const res = await axios.get(
      `${PERA_BASE}/assets/${asaId}/`,
      {
        params: { include_collectible: true },
        timeout: REQUEST_TIMEOUT,
      }
    );
    const usdValue = parseFloat(res.data?.usd_value ?? '0');
    if (usdValue > 0) {
      setCache(cacheKey, usdValue);
      return usdValue;
    }
  } catch (err) {
    logger.warn(`nftPriceOracle: Pera API failed for ASA ${asaId}: ${err.message}`);
  }
  return null;
}

// --- Step 3: Algorand Indexer last sale ---

async function fetchLastSalePrice(asaId) {
  const cacheKey = `lastsale_${asaId}`;
  const cached = getCached(cacheKey, CACHE_6HR);
  if (cached !== null) return cached;

  try {
    const res = await axios.get(
      `${_getIndexerBaseV2()}/assets/${asaId}/transactions`,
      {
        params: { 'tx-type': 'axfer', limit: 50 },
        timeout: REQUEST_TIMEOUT,
      }
    );

    const txns = res.data?.transactions || [];

    for (const tx of txns) {
      if (!tx.group) continue;

      try {
        const groupRes = await axios.get(
          `${_getIndexerBaseV2()}/transactions`,
          {
            params: { group: tx.group, limit: 10 },
            timeout: REQUEST_TIMEOUT,
          }
        );

        const groupTxns = groupRes.data?.transactions || [];
        const paymentTx = groupTxns.find(
          (gt) => gt['tx-type'] === 'pay' && gt['payment-transaction']?.amount > 0
        );

        if (paymentTx) {
          const microAlgo = paymentTx['payment-transaction'].amount;
          const algoAmount = microAlgo / 1_000_000;
          const algoUsd = await getAlgoUsdPrice();
          const usdValue = algoAmount * algoUsd;

          if (usdValue > 0) {
            setCache(cacheKey, usdValue);
            return usdValue;
          }
        }
      } catch {
        // Skip this group, try next
      }
    }
  } catch (err) {
    logger.warn(`nftPriceOracle: Indexer last-sale failed for ASA ${asaId}: ${err.message}`);
  }
  return null;
}

// --- Step 4: Creator fallback (from DB) ---

async function fetchCreatorFallback(asaId, poolAppId) {
  if (!poolAppId) return null;

  try {
    const NftStakingPool = require('../models/nftStakingPoolSchema');
    const pool = await NftStakingPool.findOne({ appId: poolAppId });
    if (pool && pool.nftValueInRewardToken > 0) {
      return { valueInRewardToken: pool.nftValueInRewardToken, source: 'creator_fallback' };
    }
  } catch (err) {
    logger.warn(`nftPriceOracle: Creator fallback failed for pool ${poolAppId}: ${err.message}`);
  }
  return null;
}

// --- USD to reward token conversion ---

async function convertUsdToRewardToken(usdValue, rewardTokenId) {
  if (rewardTokenId === 0) {
    const algoUsd = await getAlgoUsdPrice();
    return algoUsd > 0 ? usdValue / algoUsd : 0;
  }
  const asaUsd = await getAsaUsdPrice(rewardTokenId);
  return asaUsd > 0 ? usdValue / asaUsd : 0;
}

// --- Main export ---

async function getNftValue(asaId, rewardTokenId, poolAppId) {
  // Step 1: DappRadar
  const dappRadarUsd = await fetchDappRadarFloor(asaId);
  if (dappRadarUsd !== null) {
    const valueInRewardToken = await convertUsdToRewardToken(dappRadarUsd, rewardTokenId);
    return { valueInRewardToken, source: 'dappradar', usdValue: dappRadarUsd };
  }

  // Step 2: Pera
  const peraUsd = await fetchPeraPrice(asaId);
  if (peraUsd !== null) {
    const valueInRewardToken = await convertUsdToRewardToken(peraUsd, rewardTokenId);
    return { valueInRewardToken, source: 'pera', usdValue: peraUsd };
  }

  // Step 3: Indexer last sale
  const lastSaleUsd = await fetchLastSalePrice(asaId);
  if (lastSaleUsd !== null) {
    const valueInRewardToken = await convertUsdToRewardToken(lastSaleUsd, rewardTokenId);
    return { valueInRewardToken, source: 'indexer_last_sale', usdValue: lastSaleUsd };
  }

  // Step 4: Creator fallback (returns value already in reward token)
  const fallback = await fetchCreatorFallback(asaId, poolAppId);
  if (fallback !== null) {
    return { valueInRewardToken: fallback.valueInRewardToken, source: 'creator_fallback', usdValue: null };
  }

  // Nothing found
  return { valueInRewardToken: 0, source: 'none', usdValue: 0 };
}

module.exports = { getNftValue };
