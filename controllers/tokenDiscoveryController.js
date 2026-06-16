const logger = require("../config/logger");
const axios = require('axios');
const Token = require('../models/tokensSchema');

const { getIndexerUrl } = require('../services/algodService');
const _getIndexerBaseV2 = (chainId) => `${getIndexerUrl(chainId)}/v2`;

// Algorand-only third-party APIs (no Voi equivalents)
const PERA_BASE = 'https://mainnet.api.perawallet.app/v1';
const VESTIGE_BASE = 'https://api.vestigelabs.org';
const TINYMAN_ANALYTICS = 'https://mainnet.analytics.tinyman.org/api/v1';
const PACT_API = 'https://api.pact.fi/api/internal';
const TINYMAN_CDN = 'https://asa-list.tinyman.org/assets';

const NOMADEX_BASE = 'https://voimain-analytics.nomadex.app';
let nomadexCache = { tokens: [], expires: 0 };
const NOMADEX_CACHE_TTL = 30 * 60 * 1000; // 30 min

const REQUEST_TIMEOUT = 8000;

let algoUsdCache = { rate: null, expires: 0 };
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const USDC_ASA_ID = 31566704;

async function getNomadexTokens() {
  if (nomadexCache.tokens.length && Date.now() < nomadexCache.expires) {
    return nomadexCache.tokens;
  }
  try {
    const resp = await axios.get(`${NOMADEX_BASE}/tokens`, { timeout: 5000 });
    nomadexCache.tokens = resp.data || [];
    nomadexCache.expires = Date.now() + NOMADEX_CACHE_TTL;
    return nomadexCache.tokens;
  } catch (err) {
    // Return stale cache on timeout/error instead of throwing
    if (nomadexCache.tokens.length) {
      logger.warn('Nomadex fetch failed, returning stale cache:', err.message);
      return nomadexCache.tokens;
    }
    throw err;
  }
}

async function getAlgoUsdRate() {
  if (algoUsdCache.rate && Date.now() < algoUsdCache.expires) {
    return algoUsdCache.rate;
  }
  const resp = await axios.get(`${VESTIGE_BASE}/assets/price?asset_ids=${USDC_ASA_ID}`, {
    timeout: REQUEST_TIMEOUT,
  });
  const usdcAlgoPrice = resp.data[0]?.price;
  if (!usdcAlgoPrice) throw new Error('USDC price unavailable');
  const rate = 1 / usdcAlgoPrice; // 1 ALGO in USD
  algoUsdCache = { rate, expires: Date.now() + PRICE_CACHE_TTL };
  return rate;
}

const ALGO_TOKEN = {
  id: 0, name: 'Algorand', symbol: 'ALGO',
  image: `${TINYMAN_CDN}/0/icon.png`, decimals: 6, verified: true,
};

/**
 * Return the native token object for the current chain.
 */
const NATIVE_TOKEN_IMAGES = {
  ALGO: `${TINYMAN_CDN}/0/icon.png`,
  VOI: '',
};

function getNativeToken(chainConfig) {
  if (!chainConfig || !chainConfig.nativeAsset) return ALGO_TOKEN;
  const na = chainConfig.nativeAsset;
  return {
    id: na.id ?? 0,
    name: na.name,
    symbol: na.symbol,
    image: NATIVE_TOKEN_IMAGES[na.symbol] || '',
    decimals: na.decimals ?? 6,
    verified: true,
  };
}

/**
 * Resolve the best image URL for a token.
 * Pera API first (Algorand only), then Tinyman CDN fallback.
 */
async function resolveTokenImage(asaId, chainId) {
  // Skip Algorand-only image sources for Voi
  if (chainId === 'voi-mainnet') {
    return '';
  }
  try {
    const resp = await axios.get(`${PERA_BASE}/assets/${asaId}/`, { timeout: 5000 });
    const logo = resp.data?.logo;
    if (logo && typeof logo === 'string' && logo.startsWith('http')) {
      return logo;
    }
  } catch {
    // Pera unavailable, fall through
  }
  return `${TINYMAN_CDN}/${asaId}/icon.png`;
}

/**
 * GET /tokens/asa/:asaId
 * Look up a single ASA by ID. Checks DB first, then Algorand indexer.
 */
const lookupAsaById = async (req, res) => {
  try {
    const asaId = Number(req.params.asaId);
    if (isNaN(asaId) || asaId < 0) {
      return res.status(400).json({ success: false, message: 'Invalid ASA ID' });
    }

    // Special case: native token (ID 0)
    if (asaId === 0) {
      return res.json({
        success: true,
        data: getNativeToken(req.chainConfig),
      });
    }

    const chainId = req.chainId || 'algorand-mainnet';

    // Check DB first (chain-aware)
    const dbToken = await Token.findOne({ tokenId: asaId, chainId });
    if (dbToken) {
      return res.json({
        success: true,
        data: {
          id: dbToken.tokenId,
          name: dbToken.tokenName,
          symbol: dbToken.tokenSymbol,
          image: dbToken.tokenImage,
          decimals: dbToken.decimals,
          verified: dbToken.verified || false,
        },
      });
    }

    // Fetch from Algorand indexer
    const indexerResp = await axios.get(`${_getIndexerBaseV2(req?.chainId)}/assets/${asaId}`, {
      timeout: REQUEST_TIMEOUT,
    });
    const asset = indexerResp.data?.asset;
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    const params = asset.params || {};
    const name = params.name || `Asset ${asaId}`;
    const symbol = params['unit-name'] || name;
    const decimals = params.decimals ?? 6;
    const image = await resolveTokenImage(asaId, chainId);

    // Cache into DB for future lookups
    try {
      await Token.findOneAndUpdate(
        { tokenId: asaId, chainId },
        {
          tokenId: asaId,
          chainId,
          tokenName: name,
          tokenSymbol: symbol,
          tokenImage: image,
          decimals,
          verified: false,
          source: 'indexer-discovery',
          lastUpdated: new Date(),
        },
        { upsert: true, new: true }
      );
    } catch (cacheErr) {
      logger.error('Failed to cache discovered token:', cacheErr.message);
    }

    return res.json({
      success: true,
      data: { id: asaId, name, symbol, image, decimals, verified: false },
    });
  } catch (error) {
    logger.error('lookupAsaById error:', error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ success: false, message: 'Asset not found on Algorand' });
    }
    return res.status(500).json({ success: false, message: 'Failed to look up asset' });
  }
};

/**
 * GET /tokens/search?q=...
 * Search tokens by name/symbol. DB first, then Vestige API for additional results.
 */
const searchTokensByName = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    // Validate query length
    if (q.length > 100) {
      return res.status(400).json({ success: false, message: 'Query too long' });
    }

    const chainId = req.chainId || 'algorand-mainnet';
    const nativeToken = getNativeToken(req.chainConfig);

    // Empty query: return popular/default tokens
    if (!q) {
      const popular = await Token.find({ chainId, tokenId: { $ne: 0 } }).sort({ verified: -1 }).limit(20);
      const results = [nativeToken, ...popular.map((t) => ({
        id: t.tokenId,
        name: t.tokenName,
        symbol: t.tokenSymbol,
        image: t.tokenImage,
        decimals: t.decimals,
        verified: t.verified || false,
      }))];

      if (chainId === 'voi-mainnet' && results.length < 20) {
        try {
          const nomadexTokens = await getNomadexTokens();
          const existingIds = new Set(results.map((r) => r.id));
          for (const nt of nomadexTokens) {
            if (existingIds.has(nt.id)) continue;
            results.push({
              id: nt.id, name: nt.name, symbol: nt.symbol,
              image: '', decimals: nt.decimals ?? 6, verified: false,
            });
            existingIds.add(nt.id);
            if (results.length >= 20) break;
          }
        } catch { /* Nomadex unavailable */ }
      }

      return res.json({ success: true, data: results });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search DB (chain-aware)
    const dbResults = await Token.find({
      chainId,
      $or: [
        { tokenName: { $regex: escaped, $options: 'i' } },
        { tokenSymbol: { $regex: escaped, $options: 'i' } },
      ],
    }).limit(20);

    const results = dbResults.map((t) => ({
      id: t.tokenId,
      name: t.tokenName,
      symbol: t.tokenSymbol,
      image: t.tokenImage,
      decimals: t.decimals,
      verified: t.verified || false,
    }));

    // If fewer than 5 DB results, also query Vestige (Algorand only)
    if (results.length < 5 && chainId !== 'voi-mainnet') {
      try {
        const vestigeResp = await axios.get(`${VESTIGE_BASE}/assets`, {
          params: { query: q },
          timeout: REQUEST_TIMEOUT,
        });
        const vestigeAssets = vestigeResp.data || [];
        const existingIds = new Set(results.map((r) => r.id));

        for (const va of vestigeAssets) {
          if (existingIds.has(va.id)) continue;
          results.push({
            id: va.id,
            name: va.name || `Asset ${va.id}`,
            symbol: va.unit_name || va.name || 'UNKNOWN',
            image: `${TINYMAN_CDN}/${va.id}/icon.png`,
            decimals: va.decimals ?? 6,
            verified: false,
          });
          existingIds.add(va.id);
          if (results.length >= 20) break;
        }
      } catch {
        // Vestige unavailable, continue with DB results
      }
    }

    if (results.length < 5 && chainId === 'voi-mainnet') {
      try {
        const nomadexTokens = await getNomadexTokens();
        const existingIds = new Set(results.map((r) => r.id));
        const queryLower = q.toLowerCase();
        for (const nt of nomadexTokens) {
          if (existingIds.has(nt.id)) continue;
          if (!nt.name.toLowerCase().includes(queryLower) &&
              !nt.symbol.toLowerCase().includes(queryLower)) continue;
          results.push({
            id: nt.id, name: nt.name || `Asset ${nt.id}`,
            symbol: nt.symbol || 'UNKNOWN', image: '',
            decimals: nt.decimals ?? 6, verified: false,
          });
          existingIds.add(nt.id);
          if (results.length >= 20) break;
        }
      } catch { /* Nomadex unavailable */ }
    }

    // Inject native token if query matches its name/symbol
    const ql = q.toLowerCase();
    const nativeName = nativeToken.name.toLowerCase();
    const nativeSymbol = nativeToken.symbol.toLowerCase();
    if (nativeName.includes(ql) || nativeSymbol.includes(ql)) {
      const idx = results.findIndex((r) => r.id === 0);
      if (idx >= 0) {
        results.splice(idx, 1);
      }
      results.unshift(nativeToken);
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    logger.error('searchTokensByName error:', error.message);
    return res.status(500).json({ success: false, message: 'Search failed' });
  }
};

/**
 * GET /tokens/lp-discover?tokenA=...&tokenB=...
 * Discover LP tokens from Tinyman and Pact DEXes.
 */
const discoverLpTokens = async (req, res) => {
  try {
    const tokenA = Number(req.query.tokenA);
    const tokenB = Number(req.query.tokenB);

    if (isNaN(tokenA) || isNaN(tokenB)) {
      return res.status(400).json({ success: false, message: 'tokenA and tokenB are required numbers' });
    }

    const results = [];

    // Query Tinyman and Pact in parallel with graceful degradation
    // Tinyman API doesn't filter server-side, so request a large page to search locally
    const [tinymanResult, pactResult] = await Promise.allSettled([
      axios.get(`${TINYMAN_ANALYTICS}/pools/`, {
        params: { asset_1: tokenA, asset_2: tokenB, limit: 500 },
        timeout: REQUEST_TIMEOUT,
      }),
      axios.get(`${PACT_API}/pools`, {
        params: { assetIds: `${tokenA},${tokenB}`, limit: 200 },
        timeout: REQUEST_TIMEOUT,
      }),
    ]);

    // Process Tinyman results
    if (tinymanResult.status === 'fulfilled') {
      const pools = tinymanResult.value.data?.results || tinymanResult.value.data || [];
      const poolArray = Array.isArray(pools) ? pools : [];
      for (const pool of poolArray) {
        const lpAsaId = pool.liquidity_asset?.id || pool.pool_token_asset_id;
        if (!lpAsaId) continue;
        const asset1Id = Number(pool.asset_1?.id);
        const asset2Id = Number(pool.asset_2?.id);
        // Filter: pool must contain BOTH requested tokens
        const poolIds = [asset1Id, asset2Id];
        if (!poolIds.includes(tokenA) || !poolIds.includes(tokenB)) continue;
        results.push({
          lpAsaId: Number(lpAsaId),
          dex: 'Tinyman',
          poolAddress: pool.address || '',
          tokenA: { id: asset1Id, name: pool.asset_1?.name || String(asset1Id), symbol: pool.asset_1?.unit_name || '' },
          tokenB: { id: asset2Id, name: pool.asset_2?.name || String(asset2Id), symbol: pool.asset_2?.unit_name || '' },
        });
      }
    }

    // Process Pact results — API returns assets as an array, not primary_asset/secondary_asset
    if (pactResult.status === 'fulfilled') {
      const pools = pactResult.value.data?.results || pactResult.value.data || [];
      const poolArray = Array.isArray(pools) ? pools : [];
      for (const pool of poolArray) {
        const assets = pool.assets || [];
        if (assets.length < 2) continue;
        const asset0Id = Number(assets[0]?.id);
        const asset1Id = Number(assets[1]?.id);
        // Filter: pool must contain BOTH requested tokens
        const poolIds = [asset0Id, asset1Id];
        if (!poolIds.includes(tokenA) || !poolIds.includes(tokenB)) continue;
        // Pact pool ID is the application ID; use it as a fallback LP identifier
        const lpAsaId = pool.lp_token_id || pool.lpTokenId || pool.id;
        if (!lpAsaId) continue;
        // Avoid duplicates
        if (results.some((r) => r.lpAsaId === Number(lpAsaId))) continue;
        results.push({
          lpAsaId: Number(lpAsaId),
          dex: 'Pact',
          poolAddress: pool.id?.toString() || '',
          tokenA: { id: asset0Id, name: assets[0]?.name || String(asset0Id), symbol: assets[0]?.unit_name || '' },
          tokenB: { id: asset1Id, name: assets[1]?.name || String(asset1Id), symbol: assets[1]?.unit_name || '' },
        });
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    logger.error('discoverLpTokens error:', error.message);
    return res.status(500).json({ success: false, message: 'LP discovery failed' });
  }
};

/**
 * GET /tokens/price/:asaId
 * Chain-aware price proxy: Vestige for Algorand, Nomadex for Voi.
 */
const getTokenPrice = async (req, res) => {
  const { asaId } = req.params;
  const chainId = req.chainId || 'algorand-mainnet';

  try {
    if (chainId === 'voi-mainnet') {
      // Voi: use Nomadex for token prices
      const tokens = await getNomadexTokens();
      if (String(asaId) === '0') {
        // Native VOI — Nomadex may not list it; return from pool data if available
        const voiToken = tokens.find(t => t.id === 0 || t.symbol === 'VOI');
        if (voiToken?.price) {
          return res.json({ price: voiToken.price, priceNative: 1, source: 'nomadex' });
        }
        return res.json({ price: null, source: 'unavailable' });
      }
      const token = tokens.find(t => String(t.id) === String(asaId) || String(t.assetId) === String(asaId));
      if (token?.price) {
        return res.json({ price: token.price, priceNative: token.priceInVoi || null, source: 'nomadex' });
      }
      return res.json({ price: null, source: 'unavailable' });
    }

    // Algorand: use Vestige (existing logic)
    const [tokenResp, algoUsd] = await Promise.all([
      axios.get(`${VESTIGE_BASE}/assets/price?asset_ids=${asaId}`, {
        timeout: REQUEST_TIMEOUT,
      }),
      getAlgoUsdRate(),
    ]);
    const tokenData = tokenResp.data[0];
    if (!tokenData?.price) {
      return res.json({ price: null, source: 'unavailable' });
    }
    const priceAlgo = tokenData.price;
    const priceUsd = priceAlgo * algoUsd;
    res.json({ price: priceUsd, priceAlgo, source: 'vestige' });
  } catch (err) {
    res.json({ price: null, source: 'unavailable' });
  }
};

// Module-level cache for NFT collection ASA lists (30 min TTL)
const collectionCache = new Map(); // key: creatorAddr, value: {asaIds: Set, expires: number}
const COLLECTION_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Cache for asaId → creator address mapping
const asaCreatorCache = new Map(); // key: asaId, value: {creator, expires}
const ASA_CREATOR_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Look up the creator address for a given ASA ID from the indexer.
 * Cached for 1 hour.
 */
async function resolveCreatorFromAsa(asaId) {
  const cached = asaCreatorCache.get(asaId);
  if (cached && Date.now() < cached.expires) {
    return cached.creator;
  }
  const resp = await axios.get(`${_getIndexerBaseV2(req?.chainId)}/assets/${asaId}`, { timeout: REQUEST_TIMEOUT });
  const creator = resp.data?.asset?.params?.creator;
  if (!creator) throw new Error(`No creator found for ASA ${asaId}`);
  asaCreatorCache.set(asaId, { creator, expires: Date.now() + ASA_CREATOR_CACHE_TTL });
  return creator;
}

/**
 * GET /tokens/nft-collection?asaId={id}
 * Look up NFT collection info from a single ASA ID.
 */
const lookupNftCollection = async (req, res) => {
  try {
    const asaId = Number(req.query.asaId);
    if (isNaN(asaId) || asaId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid asaId is required' });
    }

    // Fetch the asset to get creator
    const assetResp = await axios.get(`${_getIndexerBaseV2(req?.chainId)}/assets/${asaId}`, { timeout: REQUEST_TIMEOUT });
    const asset = assetResp.data?.asset;
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }

    const creator = asset.params?.creator;
    if (!creator) {
      return res.status(404).json({ success: false, message: 'No creator found for this asset' });
    }

    // Cache the creator mapping
    asaCreatorCache.set(asaId, { creator, expires: Date.now() + ASA_CREATOR_CACHE_TTL });

    // Fetch sample assets by this creator
    const creatorResp = await axios.get(`${_getIndexerBaseV2(req?.chainId)}/assets`, {
      params: { creator, limit: 10 },
      timeout: REQUEST_TIMEOUT,
    });
    const sampleAssets = (creatorResp.data?.assets || []).map((a) => ({
      id: a.index,
      name: a.params?.name || `Asset ${a.index}`,
      unitName: a.params?.['unit-name'] || '',
    }));

    // Derive collection name from the first asset's name (strip trailing numbers/hashes)
    const firstName = sampleAssets[0]?.name || '';
    const collectionName = firstName.replace(/\s*[#\-]\s*\d+\s*$/, '').trim() || firstName;

    return res.json({
      success: true,
      data: {
        creator,
        collectionName,
        sampleAssets,
        totalCount: sampleAssets.length,
      },
    });
  } catch (error) {
    logger.error('lookupNftCollection error:', error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ success: false, message: 'Asset not found on Algorand' });
    }
    return res.status(500).json({ success: false, message: 'NFT collection lookup failed' });
  }
};

/**
 * GET /tokens/verify-nft?wallet={addr}&asaId={id}&minCount={1}
 * or  GET /tokens/verify-nft?wallet={addr}&creator={creatorAddr}&minCount={1}
 * Verify that a wallet holds NFTs from a specific creator's collection.
 */
const verifyNftOwnership = async (req, res) => {
  try {
    let { wallet, creator, asaId, minCount = 1 } = req.query;
    const requiredCount = Number(minCount) || 1;

    // If asaId provided, resolve creator from it
    if (asaId && !creator) {
      try {
        creator = await resolveCreatorFromAsa(Number(asaId));
      } catch (err) {
        return res.status(404).json({ success: false, message: `Could not resolve creator for ASA ${asaId}` });
      }
    }

    if (!wallet || !creator) {
      return res.status(400).json({
        success: false,
        message: 'wallet and (creator or asaId) query parameters are required',
      });
    }

    // 1. Get collection ASAs (cached)
    let collectionAsaIds;
    const cached = collectionCache.get(creator);
    if (cached && Date.now() < cached.expires) {
      collectionAsaIds = cached.asaIds;
    } else {
      // Fetch all assets created by this address from indexer
      const asaIds = new Set();
      let nextToken = '';
      let fetchCount = 0;
      const MAX_FETCHES = 5; // Limit pagination to prevent runaway requests

      do {
        const url = `${_getIndexerBaseV2(req?.chainId)}/assets?creator=${creator}&limit=500${nextToken ? `&next=${nextToken}` : ''}`;
        const resp = await axios.get(url, { timeout: REQUEST_TIMEOUT });
        const assets = resp.data?.assets || [];
        for (const asset of assets) {
          asaIds.add(asset.index);
        }
        nextToken = resp.data?.['next-token'] || '';
        fetchCount++;
      } while (nextToken && fetchCount < MAX_FETCHES);

      collectionCache.set(creator, { asaIds, expires: Date.now() + COLLECTION_CACHE_TTL });
      collectionAsaIds = asaIds;
    }

    // 2. Get wallet's ASA holdings
    let walletAssets;
    try {
      const walletResp = await axios.get(`${_getIndexerBaseV2(req?.chainId)}/accounts/${wallet}/assets`, {
        params: { limit: 1000 },
        timeout: REQUEST_TIMEOUT,
      });
      walletAssets = walletResp.data?.assets || [];
    } catch (err) {
      // If wallet doesn't exist on-chain, return ineligible
      if (err.response?.status === 404) {
        return res.json({
          success: true,
          data: { eligible: false, heldCount: 0, requiredCount },
        });
      }
      throw err;
    }

    // 3. Intersect: count wallet ASAs that belong to the collection
    let heldCount = 0;
    for (const asset of walletAssets) {
      const asaId = asset['asset-id'];
      if (collectionAsaIds.has(asaId) && asset.amount > 0) {
        heldCount++;
      }
    }

    // 4. Return eligibility
    return res.json({
      success: true,
      data: {
        eligible: heldCount >= requiredCount,
        heldCount,
        requiredCount,
      },
    });
  } catch (error) {
    logger.error('verifyNftOwnership error:', error.message);
    return res.status(500).json({ success: false, message: 'NFT verification failed' });
  }
};

module.exports = {
  lookupAsaById,
  searchTokensByName,
  discoverLpTokens,
  getTokenPrice,
  verifyNftOwnership,
  lookupNftCollection,
};
