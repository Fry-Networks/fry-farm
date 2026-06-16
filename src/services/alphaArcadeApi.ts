import axios from 'axios'
import { authAxios } from './apiClient'
import type {
  AlphaArcadeMarket,
  AlphaArcadePool,
  AlphaArcadePosition,
  AlphaArcadeOrderbook,
  AlphaArcadeStats,
  BuildTxnResponse,
} from '../types/alphaArcade'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

const api = axios.create({
  baseURL: API_BASE,
})

// Stats (public)
export async function getStats(): Promise<AlphaArcadeStats> {
  const { data } = await api.get('/prediction-lp/stats')
  return data.data
}

// Public reads (no auth)
export async function getMarkets(): Promise<AlphaArcadeMarket[]> {
  const { data } = await api.get('/prediction-lp/markets')
  return data.data
}

export async function getRewardMarkets(): Promise<AlphaArcadeMarket[]> {
  const { data } = await api.get('/prediction-lp/markets/rewards')
  return data.data
}

export async function getMarketDetail(appId: number): Promise<AlphaArcadeMarket> {
  const { data } = await api.get(`/prediction-lp/markets/${appId}`)
  return data.data
}

export async function getOrderbook(appId: number): Promise<AlphaArcadeOrderbook> {
  const { data } = await api.get(`/prediction-lp/orderbook/${appId}`)
  return data.data
}

export async function getPools(): Promise<AlphaArcadePool[]> {
  const { data } = await api.get('/prediction-lp/pools')
  return data.data
}

export async function getPool(poolId: string): Promise<AlphaArcadePool> {
  const { data } = await api.get(`/prediction-lp/pool/${poolId}`)
  return data.data
}

export async function getPositionsByWallet(wallet: string): Promise<AlphaArcadePosition[]> {
  const { data } = await api.get(`/prediction-lp/positions/${wallet}`)
  return data.data
}

export async function getPositionByPool(wallet: string, poolId: string): Promise<AlphaArcadePosition> {
  const { data } = await api.get(`/prediction-lp/position/${wallet}/${poolId}`)
  return data.data
}

// Authenticated writes
export async function buildDeposit(payload: {
  wallet: string
  marketAppId: number
  usdcAmount: number
  spread?: number
}): Promise<BuildTxnResponse> {
  const { data } = await authAxios.post('/prediction-lp/build-deposit', payload)
  return data.data
}

export async function buildWithdraw(payload: {
  wallet: string
  poolId: string
}): Promise<BuildTxnResponse> {
  const { data } = await authAxios.post('/prediction-lp/build-withdraw', payload)
  return data.data
}

export async function recordDeposit(payload: {
  wallet: string
  marketAppId: number
  poolId: string
  usdcDeposited: number
  yesEscrowAppIds: number[]
  noEscrowAppIds: number[]
  spreadUsed: number
  entryMidPrice: number
  txId: string
  depositFee?: number
}): Promise<AlphaArcadePosition> {
  const { data } = await authAxios.post('/prediction-lp/record-deposit', payload)
  return data.data
}

export async function recordWithdraw(payload: {
  wallet: string
  poolId?: string
  positionId: string
  usdcRecovered: number
  remainingYesTokens: number
  remainingNoTokens: number
  txId: string
  withdrawFee?: number
}): Promise<AlphaArcadePosition> {
  const { data } = await authAxios.post('/prediction-lp/record-withdraw', payload)
  return data.data
}

export async function buildClaim(payload: {
  wallet: string
  poolId: string
}): Promise<BuildTxnResponse> {
  const { data } = await authAxios.post('/prediction-lp/build-claim', payload)
  return data.data
}

export async function recordClaim(payload: {
  wallet: string
  poolId: string
  positionId: string
  amountClaimed: number
  txId: string
}): Promise<AlphaArcadePosition> {
  const { data } = await authAxios.post('/prediction-lp/record-claim', payload)
  return data.data
}
