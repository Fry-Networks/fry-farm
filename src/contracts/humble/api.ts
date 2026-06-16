import axios, { AxiosInstance } from 'axios';
import { HumbleToken, HumblePoolRaw } from './types';

const API_BASE = 'https://api.humble.sh';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const WVOI_ID = 390001;

let api: AxiosInstance | null = null;
let pools: HumblePoolRaw[] = [];
let tokens: HumbleToken[] = [];
let lastFetch = 0;

function getApi(): AxiosInstance {
  if (!api) api = axios.create({ baseURL: API_BASE, timeout: 8000 });
  return api;
}

export async function loadHumbleMarketData(): Promise<void> {
  if (Date.now() - lastFetch < CACHE_TTL_MS && pools.length > 0) return;

  const [poolsRes, tokensRes] = await Promise.all([
    getApi().get('/pools'),
    getApi().get('/tokens'),
  ]);

  const rawPools = poolsRes.data?.pools ?? poolsRes.data;
  pools = Array.isArray(rawPools) ? rawPools : [];

  const rawTokens = tokensRes.data?.tokens ?? tokensRes.data;
  tokens = Array.isArray(rawTokens)
    ? rawTokens.map((t: any) => ({
        id: Number(t.assetId),
        name: t.name || '',
        symbol: t.unitName || '',
        decimals: t.decimals ?? 6,
      }))
    : [];

  lastFetch = Date.now();
}

export function getHumbleTokens(): HumbleToken[] {
  return tokens;
}

export function getHumblePools(): HumblePoolRaw[] {
  return pools;
}

/**
 * Find the best Humble pool for a token pair.
 * Maps native VOI (id=0) to wVOI (390001) for pool lookup.
 */
export function findHumblePool(
  tokenAId: number,
  tokenBId: number
): HumblePoolRaw | null {
  const a = tokenAId === 0 ? WVOI_ID : tokenAId;
  const b = tokenBId === 0 ? WVOI_ID : tokenBId;

  const candidates = pools.filter((p) => {
    const pA = Number(p.tokA);
    const pB = Number(p.tokB);
    return (pA === a && pB === b) || (pA === b && pB === a);
  });

  if (candidates.length === 0) return null;
  // Return the first match (typically there's one pool per pair)
  return candidates[0];
}

export function findHumbleToken(tokenId: number): HumbleToken | undefined {
  return tokens.find((t) => t.id === tokenId);
}
