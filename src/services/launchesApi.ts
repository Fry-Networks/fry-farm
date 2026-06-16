import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string
const api = axios.create({ baseURL: API_BASE })

export interface LaunchesStats {
  totalTokens: number
  bondingUsd: number
  feeBpsPlatform: number
  feeBpsCreator: number
  appId: number
}

export interface LaunchedToken {
  asaId: number
  name: string
  unitName: string
  total: number
  decimals: number
  creator: string
  url: string
  imageUrl?: string
  error?: string
}

export async function getLaunchesStats(): Promise<LaunchesStats> {
  const { data } = await api.get('/launches/stats')
  return data.data
}

export async function getTokens(limit = 50): Promise<{ tokens: LaunchedToken[]; total: number }> {
  const { data } = await api.get('/launches/tokens', { params: { limit } })
  return { tokens: data.data, total: data.total }
}
