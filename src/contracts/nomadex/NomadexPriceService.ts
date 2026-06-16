import algosdk, { Indexer } from 'algosdk';
import axios from 'axios';
import { loadMarketData, findPool, findToken } from './api';
import { getChainConfig } from '../../config/chains';
import HumbleClient from '../humble/HumbleClient';
import { findHumblePool, findHumbleToken, loadHumbleMarketData } from '../humble/api';

const VOI_ID = 0;
const WVOI_ID = 390001;
const AUSDC_ID = 395614;
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// Lazy singletons for Humble on-chain pool queries
let _voiAlgod: algosdk.Algodv2 | null = null;
let _voiIndexer: Indexer | null = null;
let _humbleClient: HumbleClient | null = null;

function getVoiClients() {
  if (!_voiAlgod) {
    const conn = getChainConfig('voi-mainnet').connection as {
      algodServer: string; algodPort: number; algodToken: string;
      indexerServer: string; indexerPort: number; indexerToken: string;
    };
    _voiAlgod = new algosdk.Algodv2(conn.algodToken, conn.algodServer, conn.algodPort);
    _voiIndexer = new Indexer(conn.indexerToken, conn.indexerServer, conn.indexerPort);
  }
  return { algod: _voiAlgod!, indexer: _voiIndexer! };
}

function getHumbleClient() {
  if (!_humbleClient) _humbleClient = new HumbleClient();
  return _humbleClient;
}

const priceCache = new Map<string, { price: number; timestamp: number }>();
const inflightPrices = new Map<string, Promise<number>>();
const CONCURRENCY_LIMIT = 6;

function getCachedPrice(key: string): number | null {
  const entry = priceCache.get(key);
  if (entry && Date.now() - entry.timestamp < PRICE_CACHE_TTL_MS) return entry.price;
  return null;
}

function setCachedPrice(key: string, price: number): void {
  priceCache.set(key, { price, timestamp: Date.now() });
}

/**
 * Fetch VOI/USD price.
 * No VOI/aUSDC pool exists on Nomadex — use CoinGecko as primary source.
 */
export async function fetchVoiUsd(): Promise<number> {
  const cached = getCachedPrice('voi-usd');
  if (cached !== null) return cached;

  const inflight = inflightPrices.get('voi-usd');
  if (inflight) return inflight;

  const promise = _fetchVoiUsdUncached();
  inflightPrices.set('voi-usd', promise);
  try {
    return await promise;
  } finally {
    inflightPrices.delete('voi-usd');
  }
}

async function _fetchVoiUsdUncached(): Promise<number> {
  // Primary: CoinGecko
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'voi-network', vs_currencies: 'usd' },
      timeout: 8000,
    });
    const price = r.data?.['voi-network']?.usd;
    if (price && price > 0) { setCachedPrice('voi-usd', price); return price; }
  } catch { /* fallback */ }

  // Fallback: CoinPaprika
  try {
    const r = await axios.get('https://api.coinpaprika.com/v1/tickers/voi-voi-network', { timeout: 8000 });
    const price = r.data?.quotes?.USD?.price;
    if (price && price > 0) { setCachedPrice('voi-usd', price); return price; }
  } catch { /* fallback */ }

  // Fallback: Derive from Nomadex pool if VOI/aUSDC pool ever appears
  try {
    await loadMarketData();
    const pool = findPool(VOI_ID, AUSDC_ID);
    if (pool) {
      const isVoiAlpha = pool.alphaId === VOI_ID;
      const voiReserve = BigInt(isVoiAlpha ? pool.balances[0] : pool.balances[1]);
      const usdcReserve = BigInt(isVoiAlpha ? pool.balances[1] : pool.balances[0]);
      if (voiReserve > 0n) {
        const usdcToken = findToken(AUSDC_ID);
        const usdcDecimals = usdcToken?.decimals ?? 6;
        const price = (Number(usdcReserve) / 10 ** usdcDecimals) / (Number(voiReserve) / 1e6);
        if (price > 0) { setCachedPrice('voi-usd', price); return price; }
      }
    }
  } catch { /* ignore */ }

  return 0;
}

/**
 * Get USD price for any Voi-chain token.
 * Strategy:
 *   1. VOI or wVOI → fetchVoiUsd()
 *   2. TOKEN/VOI pool → price_in_voi * voiUsd
 *   3. TOKEN/aUSDC pool → direct USD
 *   4. Return 0
 */
export async function getVoiTokenUsdPrice(tokenId: number): Promise<number> {
  if (tokenId === VOI_ID || tokenId === WVOI_ID) return fetchVoiUsd();

  const cached = getCachedPrice(`voi-token-${tokenId}`);
  if (cached !== null) return cached;

  const key = `voi-token-${tokenId}`;
  const inflight = inflightPrices.get(key);
  if (inflight) return inflight;

  const promise = _getVoiTokenUsdPriceUncached(tokenId);
  inflightPrices.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightPrices.delete(key);
  }
}

async function _getVoiTokenUsdPriceUncached(tokenId: number): Promise<number> {
  await loadMarketData();

  // Strategy 1: TOKEN/VOI pool
  const voiPool = findPool(tokenId, VOI_ID);
  if (voiPool) {
    const isTokenAlpha = voiPool.alphaId === tokenId;
    const tokenReserve = BigInt(isTokenAlpha ? voiPool.balances[0] : voiPool.balances[1]);
    const voiReserve = BigInt(isTokenAlpha ? voiPool.balances[1] : voiPool.balances[0]);

    if (tokenReserve > 0n && voiReserve > 0n) {
      const token = findToken(tokenId);
      const tokenDecimals = token?.decimals ?? 6;
      const priceInVoi = (Number(voiReserve) / 1e6) / (Number(tokenReserve) / 10 ** tokenDecimals);
      const voiUsd = await fetchVoiUsd();
      const price = priceInVoi * voiUsd;
      if (price > 0) { setCachedPrice(`voi-token-${tokenId}`, price); return price; }
    }
  }

  // Strategy 2: TOKEN/aUSDC pool (direct USD price)
  const usdcPool = findPool(tokenId, AUSDC_ID);
  if (usdcPool) {
    const isTokenAlpha = usdcPool.alphaId === tokenId;
    const tokenReserve = BigInt(isTokenAlpha ? usdcPool.balances[0] : usdcPool.balances[1]);
    const usdcReserve = BigInt(isTokenAlpha ? usdcPool.balances[1] : usdcPool.balances[0]);

    if (tokenReserve > 0n && usdcReserve > 0n) {
      const token = findToken(tokenId);
      const tokenDecimals = token?.decimals ?? 6;
      const usdcToken = findToken(AUSDC_ID);
      const usdcDecimals = usdcToken?.decimals ?? 6;
      const price = (Number(usdcReserve) / 10 ** usdcDecimals) / (Number(tokenReserve) / 10 ** tokenDecimals);
      if (price > 0) { setCachedPrice(`voi-token-${tokenId}`, price); return price; }
    }
  }

  // Strategy 3: Humble TOKEN/VOI pool — derive from on-chain reserves
  await loadHumbleMarketData();
  const humbleVoiPool = findHumblePool(tokenId, VOI_ID);
  if (humbleVoiPool) {
    const voiUsd = await fetchVoiUsd();
    if (voiUsd > 0) {
      try {
        const poolId = Number(humbleVoiPool.poolId);
        const { algod, indexer } = getVoiClients();
        const dummyAddr = algosdk.getApplicationAddress(poolId);
        const info = await getHumbleClient().fetchPoolInfo(poolId, dummyAddr, algod, indexer);

        // Pool uses wVOI (390001), not raw VOI (0)
        const effectiveTokenId = tokenId === 0 ? WVOI_ID : tokenId;
        const isTokenA = info.tokA === effectiveTokenId;
        const tokenReserve = BigInt(isTokenA ? info.poolBals.A : info.poolBals.B);
        const voiReserve = BigInt(isTokenA ? info.poolBals.B : info.poolBals.A);

        if (tokenReserve > 0n && voiReserve > 0n) {
          const hToken = findHumbleToken(effectiveTokenId);
          const tokenDecimals = hToken?.decimals ?? 6;
          const voiPerToken = (Number(voiReserve) / 1e6) / (Number(tokenReserve) / 10 ** tokenDecimals);
          const price = voiUsd * voiPerToken;
          if (price > 0) { setCachedPrice(`voi-token-${tokenId}`, price); return price; }
        }
      } catch { /* Humble pool query failed — continue */ }
    }
  }

  return 0;
}

/**
 * Batch-fetch USD prices for a list of Voi token IDs.
 * Mirrors PriceService.fetchPriceMap() interface.
 */
/**
 * Get USD price for a Nomadex LP token pair.
 * LP price = (reserveA_usd + reserveB_usd) / totalLpSupply
 */
export async function getNomadexLpTokenUsdPrice(tokenAId: number, tokenBId: number): Promise<number> {
  const cacheKey = `voi-lp-${Math.min(tokenAId, tokenBId)}-${Math.max(tokenAId, tokenBId)}`;
  const cached = getCachedPrice(cacheKey);
  if (cached !== null) return cached;

  await loadMarketData();
  const pool = findPool(tokenAId, tokenBId);
  if (!pool) return 0;

  const isAAlpha = pool.alphaId === tokenAId;
  const reserveA = BigInt(isAAlpha ? pool.balances[0] : pool.balances[1]);
  const reserveB = BigInt(isAAlpha ? pool.balances[1] : pool.balances[0]);

  const tokenA = findToken(tokenAId);
  const tokenB = findToken(tokenBId);
  const decimalsA = tokenA?.decimals ?? 6;
  const decimalsB = tokenB?.decimals ?? 6;

  const [priceA, priceB] = await Promise.all([
    getVoiTokenUsdPrice(tokenAId),
    getVoiTokenUsdPrice(tokenBId),
  ]);

  const reserveAUsd = (Number(reserveA) / 10 ** decimalsA) * priceA;
  const reserveBUsd = (Number(reserveB) / 10 ** decimalsB) * priceB;
  const totalValueUsd = reserveAUsd + reserveBUsd;

  if (totalValueUsd <= 0) return 0;

  // Get LP total supply via arc200_totalSupply on pool app
  try {
    const voiConfig = getChainConfig('voi-mainnet');
    const conn = voiConfig.connection as { algodServer: string; algodPort: number; algodToken: string };
    const client = new algosdk.Algodv2(conn.algodToken, conn.algodServer, conn.algodPort);

    const totalSupplySelector = new Uint8Array([0xd8, 0x9d, 0x5e, 0x83]); // arc200_totalSupply
    const result = await client.getApplicationByID(pool.id).do();
    // Use simulate to call arc200_totalSupply
    const atc = new algosdk.AtomicTransactionComposer();
    const params = await client.getTransactionParams().do();
    const dummyAddr = algosdk.getApplicationAddress(pool.id);
    atc.addMethodCall({
      appID: pool.id,
      method: new algosdk.ABIMethod({ name: 'arc200_totalSupply', args: [], returns: { type: 'uint256' } }),
      sender: dummyAddr,
      suggestedParams: params,
      signer: algosdk.makeEmptyTransactionSigner(),
    });
    const simResult = await atc.simulate(client);
    const returnValue = simResult.methodResults[0]?.returnValue;
    if (returnValue != null) {
      const totalSupply = Number(returnValue) / 1e6; // LP tokens have 6 decimals
      if (totalSupply > 0) {
        const price = totalValueUsd / totalSupply;
        if (price > 0) { setCachedPrice(cacheKey, price); return price; }
      }
    }
  } catch {
    // Fallback: estimate from reserves only (assumes equal-weight pool)
    // price per LP ≈ 2 * sqrt(reserveA_usd * reserveB_usd) / totalSupply
    // Without totalSupply, return 0
  }

  return 0;
}

export async function fetchVoiPriceMap(tokenIds: number[]): Promise<Record<string, number>> {
  await loadMarketData();
  const unique = [...new Set(tokenIds)];
  const priceMap: Record<string, number> = {};

  for (let i = 0; i < unique.length; i += CONCURRENCY_LIMIT) {
    const batch = unique.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(
      batch.map(async (id) => ({ id, price: await getVoiTokenUsdPrice(id) }))
    );
    results.forEach((r) => {
      if (r.status === 'fulfilled') priceMap[r.value.id.toString()] = r.value.price;
    });
  }
  return priceMap;
}
