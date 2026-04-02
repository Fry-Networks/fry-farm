import axios from 'axios'

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
    const r = await axios.get('https://free-api.vestige.fi/asset/0/price', { timeout: 8000 })
    const price = r.data?.USD ?? r.data?.price
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

async function fetchTinymanPool(a: number, b: number) {
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
  throw new Error('Pool not found')
}

export async function getAsaUsdPrice(asaId: number): Promise<number> {
  const cached = getCachedPrice(`asa-${asaId}`)
  if (cached !== null) return cached

  // 0) Vestige free API (no rate limit)
  try {
    const r = await axios.get(`https://free-api.vestige.fi/asset/${asaId}/price`, { timeout: 8000 })
    const price = r.data?.USD ?? r.data?.price
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
 * Fetch USD prices for a list of ASA IDs.
 * Uses Promise.allSettled so one failure doesn't block others.
 * Returns a map of asaId -> usdPrice (0 for failures).
 */
export async function fetchPriceMap(asaIds: number[]): Promise<Record<string, number>> {
  const unique = [...new Set(asaIds)]
  const results = await Promise.allSettled(
    unique.map(async (id) => ({ id, price: await getAsaUsdPrice(id) }))
  )

  const priceMap: Record<string, number> = {}
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      priceMap[result.value.id.toString()] = result.value.price
    }
    // rejected → leave missing, consumer uses ?? 0
  })
  return priceMap
}
