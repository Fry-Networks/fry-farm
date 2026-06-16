import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

interface DiscoveredToken {
  id: number;
  name: string;
  symbol: string;
  image: string;
  decimals: number;
  verified: boolean;
}

interface LpPool {
  lpAsaId: number;
  dex: string;
  poolAddress: string;
  tokenA: { id: number; name: string; symbol: string };
  tokenB: { id: number; name: string; symbol: string };
}

function getChainId(): string {
  return localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet';
}

// In-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
  // Limit cache size
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

/**
 * Look up a single ASA by ID.
 */
export async function lookupAsa(asaId: number): Promise<DiscoveredToken> {
  const cacheKey = `asa:${getChainId()}:${asaId}`;
  const cached = getCached<DiscoveredToken>(cacheKey);
  if (cached) return cached;

  const resp = await axios.get(`${API_BASE}/tokens/asa/${asaId}`, { timeout: 10000 });
  const token = resp.data.data;
  setCache(cacheKey, token);
  return token;
}

/**
 * Search tokens by name or symbol.
 */
export async function getDefaultTokens(): Promise<DiscoveredToken[]> {
  const cacheKey = `defaults:${getChainId()}`;
  const cached = getCached<DiscoveredToken[]>(cacheKey);
  if (cached) return cached;
  const resp = await axios.get(`${API_BASE}/tokens/search`, {
    params: { q: '' }, timeout: 10000,
  });
  const tokens = resp.data.data || [];
  setCache(cacheKey, tokens);
  return tokens;
}

export async function searchTokens(query: string): Promise<DiscoveredToken[]> {
  const cacheKey = `search:${getChainId()}:${(query || '').trim().toLowerCase()}`;
  const cached = getCached<DiscoveredToken[]>(cacheKey);
  if (cached) return cached;

  const resp = await axios.get(`${API_BASE}/tokens/search`, {
    params: { q: query.trim() },
    timeout: 10000,
  });
  const tokens = resp.data.data || [];
  setCache(cacheKey, tokens);
  return tokens;
}

/**
 * Discover LP tokens for a pair from Tinyman and Pact.
 */
export async function discoverLpTokens(tokenA: number, tokenB: number): Promise<LpPool[]> {
  const cacheKey = `lp:${getChainId()}:${tokenA}:${tokenB}`;
  const cached = getCached<LpPool[]>(cacheKey);
  if (cached) return cached;

  const resp = await axios.get(`${API_BASE}/tokens/lp-discover`, {
    params: { tokenA, tokenB },
    timeout: 15000,
  });
  const pools = resp.data.data || [];
  setCache(cacheKey, pools);
  return pools;
}

export type { DiscoveredToken, LpPool };
