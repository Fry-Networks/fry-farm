import axios, { AxiosInstance } from 'axios';
import { NomadexToken, NomadexPool } from './types';

const ANALYTICS_BASE = 'https://voimain-analytics.nomadex.app';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// Module-level singleton cache — shared by NomadexClient and NomadexPriceService
let api: AxiosInstance | null = null;
let pools: NomadexPool[] = [];
let tokens: NomadexToken[] = [];
let lastFetch = 0;

function getApi(): AxiosInstance {
  if (!api) api = axios.create({ baseURL: ANALYTICS_BASE, timeout: 8000 });
  return api;
}

/** Fetch tokens and pools from Nomadex analytics API, with 5 min cache */
export async function loadMarketData(): Promise<void> {
  if (Date.now() - lastFetch < CACHE_TTL_MS && tokens.length > 0) return;

  const results = await Promise.allSettled([
    getApi().get<NomadexToken[]>('/tokens'),
    getApi().get<NomadexPool[]>('/pools'),
  ]);

  if (results[0].status === 'fulfilled') tokens = results[0].value.data;
  if (results[1].status === 'fulfilled') pools = results[1].value.data.filter((p) => p.online);
  lastFetch = Date.now();
}

export function getTokens(): NomadexToken[] {
  return tokens;
}

export function getPools(): NomadexPool[] {
  return pools;
}

/** Find the best pool for a token pair (highest liquidity) */
export function findPool(tokenAId: number, tokenBId: number): NomadexPool | null {
  const candidates = pools.filter(
    (p) =>
      (p.alphaId === tokenAId && p.betaId === tokenBId) ||
      (p.alphaId === tokenBId && p.betaId === tokenAId)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => {
    const pLiq = BigInt(p.balances[0]) + BigInt(p.balances[1]);
    const bLiq = BigInt(best.balances[0]) + BigInt(best.balances[1]);
    return pLiq > bLiq ? p : best;
  });
}

/** Look up a token from the cached list */
export function findToken(tokenId: number): NomadexToken | undefined {
  return tokens.find((t) => t.id === tokenId);
}
