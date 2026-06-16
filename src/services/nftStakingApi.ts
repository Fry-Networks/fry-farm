import axios from 'axios'
import { authAxios } from './apiClient'
import type {
  NftStakingPool,
  StakedNft,
  NftClaim,
  NftPriceResult,
  CreateNftPoolPayload,
  StakeNftPayload,
  UnstakeNftPayload,
  ClaimPayload,
} from '../types/nftStaking'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

const api = axios.create({
  baseURL: API_BASE,
})

// Chain header interceptor (axios.create() instances don't inherit global interceptors)
api.interceptors.request.use((config) => {
  try {
    const chainId = localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet'
    config.headers['X-Chain-Id'] = chainId
    if (chainId === 'voi-mainnet') {
      const voiConn = localStorage.getItem('voi-wallet-connection')
      if (voiConn) {
        const { address } = JSON.parse(voiConn)
        if (address) config.headers['X-Wallet-Address'] = address
      }
    }
  } catch { /* ignore */ }
  return config
})

export async function getAllNftPools(): Promise<NftStakingPool[]> {
  const { data } = await api.get('/nftstaking/all')
  return data.data
}

export async function getNftPoolByAppId(appId: number): Promise<NftStakingPool> {
  const { data } = await api.get(`/nftstaking/pool/${appId}`)
  return data.data
}

export async function getNftPoolsByCreator(wallet: string): Promise<NftStakingPool[]> {
  const { data } = await api.get(`/nftstaking/creator/${wallet}`)
  return data.data
}

export async function addNftPool(payload: CreateNftPoolPayload): Promise<NftStakingPool> {
  const { data } = await authAxios.post('/nftstaking/add', payload)
  return data.data
}

export async function updateNftPool(appId: number, updates: Partial<NftStakingPool>): Promise<NftStakingPool> {
  const { data } = await authAxios.put(`/nftstaking/update/${appId}`, updates)
  return data.data
}

export async function addStakedNft(payload: StakeNftPayload): Promise<StakedNft> {
  const { data } = await authAxios.post('/nftstaking/stake', payload)
  return data.data
}

export async function getStakedNftsByWallet(wallet: string): Promise<StakedNft[]> {
  const { data } = await api.get(`/nftstaking/stakes/wallet/${wallet}`)
  return data.data
}

export async function getStakedNftsByPool(appId: number): Promise<StakedNft[]> {
  const { data } = await api.get(`/nftstaking/stakes/pool/${appId}`)
  return data.data
}

export async function unstakeNft(payload: UnstakeNftPayload): Promise<any> {
  const { data } = await authAxios.post('/nftstaking/unstake', payload)
  return data.data
}

export async function addNftClaim(payload: ClaimPayload): Promise<NftClaim> {
  const { data } = await authAxios.post('/nftstaking/claim', payload)
  return data.data
}

export async function getClaimsByWallet(wallet: string): Promise<NftClaim[]> {
  const { data } = await api.get(`/nftstaking/claims/${wallet}`)
  return data.data
}

export async function getNftPrice(asaId: number): Promise<NftPriceResult> {
  const { data } = await api.get(`/nftstaking/nftprice/${asaId}`)
  return data.data
}
