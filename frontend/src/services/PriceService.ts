import axios from 'axios'
import { poolUtils, PoolStatus } from '@tinymanorg/tinyman-js-sdk'
import { getAlgodClient } from '../farming_func'

const USDC_ID = 31566704
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const priceCache = new Map<string, { price: number; timestamp: number }>()

function getCachedPrice(key: string): number | null {
  const entry = priceCache.get(key)
  if (entry && Date.now() - entry.timestamp < PRICE_CACHE_TTL_MS) return entry.price
  return null
}

function setCachedPrice(key: string, price: number): void {
  priceCache.set(key, { price, timestamp: Date.now() })
}

export async function fetchAlgoUsd(): Promise<number> {
  const cached = getCachedPrice('algo-usd')
  if (cached !== null) return cached

  // Primary: Vestige (free, no rate limit)
  try {
    const r = await axios.get(`https://api.vestigelabs.org/assets/price`, {
      params: { asset_ids: 0, denominating_asset_id: USDC_ID },
      timeout: 8000,
    })
    const price = r.data?.[0]?.price
    if (price && price > 0) { setCachedPrice('algo-usd', price); return price }
  } catch { /* fallback */ }

  // Fallback: CoinGecko
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'algorand', vs_currencies: 'usd' },
      timeout: 8000,
    })
    const price = r.data?.algorand?.usd
    if (price && price > 0) { setCachedPrice('algo-usd', price); return price }
  } catch { /* fallback */ }

  // Fallback: Coinbase
  try {
    const r = await axios.get('https://api.coinbase.com/v2/prices/ALGO-USD/spot', { timeout: 8000 })
    const price = parseFloat(r.data?.data?.amount ?? '0')
    if (price > 0) { setCachedPrice('algo-usd', price); return price }
  } catch { /* fallback */ }

  // Fallback: CoinPaprika
  try {
    const r = await axios.get('https://api.coinpaprika.com/v1/tickers/algo-algorand', { timeout: 8000 })
    const price = r.data?.quotes?.USD?.price
    if (price && price > 0) { setCachedPrice('algo-usd', price); return price }
  } catch { /* fallback */ }

  // Last resort: Binance (may be geo-blocked)
  try {
    const r = await axios.get('https://api1.binance.com/api/v3/ticker/price', {
      params: { symbol: 'ALGOUSDT' },
      timeout: 8000,
    })
    const price = parseFloat(r.data?.price ?? '0')
    if (price > 0) { setCachedPrice('algo-usd', price); return price }
  } catch { /* fallback */ }

  return 0
}

const tinymanNegativeCache = new Map<string, number>()
const TINYMAN_NEGATIVE_TTL = 5 * 60 * 1000 // 5 min

async function fetchTinymanPool(a: number, b: number) {
  const key = `${Math.min(a, b)}-${Math.max(a, b)}`
  const neg = tinymanNegativeCache.get(key)
  if (neg && Date.now() - neg < TINYMAN_NEGATIVE_TTL) {
    throw new Error('Pool not found (cached)')
  }

  const tryUrls = [
    `https://mainnet.analytics.tinyman.org/api/v1/pool/${a}/${b}/`,
    `https://mainnet.analytics.tinyman.org/api/v1/pool/${b}/${a}/`,
  ]
  for (const url of tryUrls) {
    try {
      const res = await axios.get(url, { timeout: 10000 })
      if (res.status === 200 && res.data) return res.data
    } catch {
      // try next
    }
  }
  tinymanNegativeCache.set(key, Date.now())
  throw new Error('Pool not found')
}

async function fetchVestigeBatchPrices(asaIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (asaIds.length === 0) return result
  try {
    const r = await axios.get('https://api.vestigelabs.org/assets/price', {
      params: { asset_ids: asaIds.join(','), denominating_asset_id: USDC_ID },
      timeout: 15000,
    })
    if (Array.isArray(r.data)) {
      for (const entry of r.data) {
        const id = entry?.asset_id
        const price = entry?.price
        if (id != null) {
          const p = price ?? 0
          result.set(Number(id), p)
          if (p > 0) {
            setCachedPrice(`asa-${id}`, p)
          }
        }
      }
    }
  } catch (err: any) { console.warn('[PriceService] Vestige batch failed:', err?.message) }
  return result
}

export async function getAsaUsdPrice(asaId: number): Promise<number> {
  const cached = getCachedPrice(`asa-${asaId}`)
  if (cached !== null) return cached

  // 0) Vestige free API (no rate limit)
  try {
    const r = await axios.get(`https://api.vestigelabs.org/assets/price`, {
      params: { asset_ids: asaId, denominating_asset_id: USDC_ID },
      timeout: 8000,
    })
    const price = r.data?.[0]?.price
    if (price && price > 0) { setCachedPrice(`asa-${asaId}`, price); return price }
  } catch { /* fallback */ }

  try {
    // 1) Prefer ASA/USDC pool -> direct USD price
    const usdcPool = await fetchTinymanPool(asaId, USDC_ID)
    const r = usdcPool?.reserves || usdcPool?.data?.reserves || usdcPool
    const reserveA = Number(r?.[asaId] ?? r?.asset_1 ?? 0)
    const reserveUSDC = Number(r?.[USDC_ID] ?? r?.asset_2 ?? 0)
    if (reserveA > 0 && reserveUSDC > 0) {
      const price = reserveUSDC / reserveA
      setCachedPrice(`asa-${asaId}`, price)
      return price
    }
  } catch {
    // ignore; fallback below
  }

  // 2) Fallback: ASA/ALGO pool -> multiply by ALGO/USD
  try {
    const algoUsd = await fetchAlgoUsd()
    const ALGO_ASSET_ID = 0
    const algoPool = await fetchTinymanPool(asaId, ALGO_ASSET_ID)
    const r2 = algoPool?.reserves || algoPool?.data?.reserves || algoPool

    const reserveAsa =
      Number(r2?.[asaId]) ??
      Number(r2?.asset_1_id === asaId ? r2?.asset_1 : r2?.asset_2) ?? 0
    const reserveAlgo =
      Number(r2?.[ALGO_ASSET_ID]) ??
      Number(r2?.asset_1_id === ALGO_ASSET_ID ? r2?.asset_1 : r2?.asset_2) ?? 0

    if (reserveAsa > 0 && reserveAlgo > 0) {
      const priceAsaInAlgo = reserveAlgo / reserveAsa
      const price = priceAsaInAlgo * algoUsd
      setCachedPrice(`asa-${asaId}`, price)
      return price
    }
  } catch {
    // ignore; fallback below
  }

  // 3) Fallback: CoinGecko ASA price by contract address
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/algorand', {
      params: { contract_addresses: asaId.toString(), vs_currencies: 'usd' },
      timeout: 10000,
    })
    const price = r.data?.[asaId.toString()]?.usd
    if (price && price > 0) { setCachedPrice(`asa-${asaId}`, price); return price }
  } catch { /* ignore */ }

  // 4) No price available
  return 0
}

/**
 * Compute the USD price of one LP token for a Tinyman V2 pool.
 * Uses on-chain pool data via Tinyman SDK (the analytics API is dead).
 */
export async function getLpTokenUsdPrice(
  tokenAId: number,
  tokenBId: number,
  tokenADecimals = 6,
  tokenBDecimals = 6,
): Promise<number> {
  const cacheKey = `lp-${[tokenAId, tokenBId].sort((a, b) => a - b).join('-')}`
  const cached = getCachedPrice(cacheKey)
  if (cached !== null) return cached

  try {
    const [priceA, priceB] = await Promise.all([
      getAsaUsdPrice(tokenAId),
      getAsaUsdPrice(tokenBId),
    ])

    const algod = getAlgodClient()

    const pool = await poolUtils.v2.getPoolInfo({
      client: algod as any,
      network: 'mainnet',
      asset1ID: tokenAId,
      asset2ID: tokenBId,
    })

    if (pool.status !== PoolStatus.READY || !pool.issuedPoolTokens) return 0

    const reserveA = Number(pool.asset1Reserves ?? 0)
    const reserveB = Number(pool.asset2Reserves ?? 0)
    const issuedLP = Number(pool.issuedPoolTokens)

    if (issuedLP <= 0) return 0

    const valueA = (reserveA / 10 ** tokenADecimals) * priceA
    const valueB = (reserveB / 10 ** tokenBDecimals) * priceB

    // LP tokens have 6 decimals
    const lpPrice = (valueA + valueB) / (issuedLP / 1e6)
    setCachedPrice(cacheKey, lpPrice)
    return lpPrice
  } catch {
    return 0
  }
}

/**
 * Fetch USD prices for a list of ASA IDs.
 * Uses Promise.allSettled so one failure doesn't block others.
 * Returns a map of asaId -> usdPrice (0 for failures).
 */
export async function fetchPriceMap(asaIds: number[]): Promise<Record<string, number>> {
  const unique = [...new Set(asaIds)]
  const priceMap: Record<string, number> = {}

  // Phase 0: Collect already-cached prices
  const uncachedIds: number[] = []
  for (const id of unique) {
    const cached = getCachedPrice(`asa-${id}`)
    if (cached !== null) {
      priceMap[id.toString()] = cached
    } else {
      uncachedIds.push(id)
    }
  }
  if (uncachedIds.length === 0) return priceMap

  // Phase 1: Vestige batch (primary, no rate limit)
  const vestigePrices = await fetchVestigeBatchPrices(uncachedIds)
  for (const [id, price] of vestigePrices) {
    priceMap[id.toString()] = price
  }

  const afterVestige = uncachedIds.filter((id) => {
    if (vestigePrices.has(id)) return false
    // Re-check cache: a concurrent call may have cached this price
    const nowCached = getCachedPrice(`asa-${id}`)
    if (nowCached !== null) {
      priceMap[id.toString()] = nowCached
      return false
    }
    return true
  })
  if (afterVestige.length === 0) return priceMap

  // Phase 2: Tinyman individual for remaining
  const tinymanResults = await Promise.allSettled(
    afterVestige.map(async (id) => {
      // Try USDC pool
      try {
        const usdcPool = await fetchTinymanPool(id, USDC_ID)
        const r = usdcPool?.reserves || usdcPool?.data?.reserves || usdcPool
        const reserveA = Number(r?.[id] ?? r?.asset_1 ?? 0)
        const reserveUSDC = Number(r?.[USDC_ID] ?? r?.asset_2 ?? 0)
        if (reserveA > 0 && reserveUSDC > 0) {
          const price = reserveUSDC / reserveA
          setCachedPrice(`asa-${id}`, price)
          return { id, price }
        }
      } catch { /* no USDC pool */ }
      // Try ALGO pool
      try {
        const algoUsd = await fetchAlgoUsd()
        const algoPool = await fetchTinymanPool(id, 0)
        const r2 = algoPool?.reserves || algoPool?.data?.reserves || algoPool
        const reserveAsa =
          Number(r2?.[id]) ??
          Number(r2?.asset_1_id === id ? r2?.asset_1 : r2?.asset_2) ?? 0
        const reserveAlgo =
          Number(r2?.[0]) ??
          Number(r2?.asset_1_id === 0 ? r2?.asset_1 : r2?.asset_2) ?? 0
        if (reserveAsa > 0 && reserveAlgo > 0) {
          const price = (reserveAlgo / reserveAsa) * algoUsd
          setCachedPrice(`asa-${id}`, price)
          return { id, price }
        }
      } catch { /* no ALGO pool */ }
      return { id, price: 0 }
    })
  )

  // Phase 3: Merge Tinyman results
  for (const result of tinymanResults) {
    if (result.status === 'fulfilled' && result.value.price > 0) {
      priceMap[result.value.id.toString()] = result.value.price
    }
  }

  return priceMap
}

// ─── Chain-Aware Facades ──────────────────────────────────────────

import type { ChainId } from '../config/chains/types'
import { fetchVoiUsd, getVoiTokenUsdPrice, fetchVoiPriceMap, getNomadexLpTokenUsdPrice } from '../contracts/nomadex/NomadexPriceService'

/** Chain-aware token price fetch — delegates to Algorand or Voi backend */
export async function getTokenUsdPrice(
  tokenId: number,
  chainId: ChainId = 'algorand-mainnet'
): Promise<number> {
  if (chainId === 'voi-mainnet') return getVoiTokenUsdPrice(tokenId)
  return getAsaUsdPrice(tokenId)
}

/** Chain-aware native asset price fetch (ALGO or VOI) */
export async function fetchNativeUsd(
  chainId: ChainId = 'algorand-mainnet'
): Promise<number> {
  if (chainId === 'voi-mainnet') return fetchVoiUsd()
  return fetchAlgoUsd()
}

/** Chain-aware batch price fetch */
export async function fetchChainPriceMap(
  tokenIds: number[],
  chainId: ChainId = 'algorand-mainnet'
): Promise<Record<string, number>> {
  if (chainId === 'voi-mainnet') return fetchVoiPriceMap(tokenIds)
  return fetchPriceMap(tokenIds)
}

/** Chain-aware LP token price fetch */
export async function getChainLpTokenUsdPrice(
  tokenAId: number,
  tokenBId: number,
  chainId: ChainId = 'algorand-mainnet'
): Promise<number> {
  if (chainId === 'voi-mainnet') return getNomadexLpTokenUsdPrice(tokenAId, tokenBId)
  return getLpTokenUsdPrice(tokenAId, tokenBId)
}
