import { authAxios } from './apiClient';
import type {
  P2PMarket, P2PMarketStats, P2POffer, P2PTrade, P2PReputation,
  P2POfferPagination, CreateOfferPayload, AcceptOfferPayload, CancelOfferPayload,
  RegisterMarketPayload,
} from '../types/p2pSwap';

// --- Public reads ---

export async function getP2PMarkets(): Promise<P2PMarket[]> {
  const { data } = await authAxios.get('/p2p/markets');
  return data.data;
}

export async function getP2PMarketDetail(appId: number): Promise<P2PMarket> {
  const { data } = await authAxios.get(`/p2p/markets/${appId}`);
  return data.data;
}

export async function getP2PMarketStats(appId: number): Promise<P2PMarketStats> {
  const { data } = await authAxios.get(`/p2p/markets/${appId}/stats`);
  return data.data;
}

export async function getP2PMarketTrades(params: {
  appId: number;
  page?: number;
  limit?: number;
}): Promise<{ data: P2PTrade[]; pagination: P2POfferPagination }> {
  const { appId, ...rest } = params;
  const { data } = await authAxios.get(`/p2p/markets/${appId}/trades`, { params: rest });
  return { data: data.data, pagination: data.pagination };
}

export async function getP2POffers(params: {
  marketAppId?: number;
  status?: string;
  makerWallet?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
} = {}): Promise<{ data: P2POffer[]; pagination: P2POfferPagination }> {
  const { data } = await authAxios.get('/p2p/offers', { params });
  return { data: data.data, pagination: data.pagination };
}

export async function getP2POffer(
  chainId: string, marketAppId: number, offerId: number
): Promise<P2POffer> {
  const { data } = await authAxios.get(`/p2p/offers/${chainId}/${marketAppId}/${offerId}`);
  return data.data;
}

export async function getP2PReputation(walletAddress: string): Promise<P2PReputation> {
  const { data } = await authAxios.get(`/p2p/reputation/${walletAddress}`);
  return data.data;
}

// --- Authenticated reads ---

export async function getMyP2POffers(params: {
  status?: string;
  marketAppId?: number;
  page?: number;
  limit?: number;
} = {}): Promise<{ data: P2POffer[]; pagination: P2POfferPagination }> {
  const { data } = await authAxios.get('/p2p/my-offers', { params });
  return { data: data.data, pagination: data.pagination };
}

export async function getP2PHistory(params: {
  marketAppId?: number;
  page?: number;
  limit?: number;
} = {}): Promise<{ data: P2PTrade[]; pagination: P2POfferPagination }> {
  const { data } = await authAxios.get('/p2p/history', { params });
  return { data: data.data, pagination: data.pagination };
}

// --- Authenticated writes (POST after on-chain tx success) ---

export async function recordP2POffer(payload: CreateOfferPayload): Promise<P2POffer> {
  const { data } = await authAxios.post('/p2p/offers', payload);
  return data.data;
}

export async function recordP2PAccept(
  offerId: number, payload: AcceptOfferPayload
): Promise<P2POffer> {
  const { data } = await authAxios.post(`/p2p/offers/${offerId}/accept`, payload);
  return data.data;
}

export async function recordP2PCancel(
  offerId: number, payload: CancelOfferPayload
): Promise<P2POffer> {
  const { data } = await authAxios.post(`/p2p/offers/${offerId}/cancel`, payload);
  return data.data;
}

export async function registerP2PMarket(payload: RegisterMarketPayload): Promise<P2PMarket> {
  const { data } = await authAxios.post('/p2p/markets', payload);
  return data.data;
}
