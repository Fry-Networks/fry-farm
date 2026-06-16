import axios from 'axios'
import { authAxios } from './apiClient'
import type {
  DevicePool,
  DevicePosition,
  DeviceAnnouncement,
  CreatorAnalytics,
  CreateDevicePoolPayload,
  StakeDevicePayload,
  UnstakeDevicePayload,
  ClaimDevicePayload,
  CreateAnnouncementPayload,
} from '../types/deviceStaking'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

const api = axios.create({
  baseURL: API_BASE,
})

export async function getAllDevicePools(): Promise<DevicePool[]> {
  const { data } = await api.get('/devicestaking/all')
  return data.data
}

export async function getDevicePool(appId: string): Promise<DevicePool> {
  const { data } = await api.get(`/devicestaking/pool/${appId}`)
  return data.data
}

export async function getDevicePoolsByCreator(wallet: string): Promise<DevicePool[]> {
  const { data } = await api.get(`/devicestaking/creator/${wallet}`)
  return data.data
}

export async function addDevicePool(payload: CreateDevicePoolPayload): Promise<DevicePool> {
  const { data } = await authAxios.post('/devicestaking/add', payload)
  return data.data
}

export async function updateDevicePool(appId: string, updates: Partial<DevicePool>): Promise<DevicePool> {
  const { data } = await authAxios.put(`/devicestaking/update/${appId}`, updates)
  return data.data
}

export async function stakeDevice(payload: StakeDevicePayload): Promise<DevicePosition> {
  const { data } = await authAxios.post('/devicestaking/stake', payload)
  return data.data
}

export async function unstakeDevice(payload: UnstakeDevicePayload): Promise<DevicePosition> {
  const { data } = await authAxios.post('/devicestaking/unstake', payload)
  return data.data
}

export async function claimDeviceRewards(payload: ClaimDevicePayload): Promise<DevicePosition> {
  const { data } = await authAxios.post('/devicestaking/claim', payload)
  return data.data
}

export async function getPositionsByWallet(wallet: string): Promise<DevicePosition[]> {
  const { data } = await api.get(`/devicestaking/stakes/wallet/${wallet}`)
  return data.data
}

export async function getPositionsByPool(appId: string): Promise<DevicePosition[]> {
  const { data } = await api.get(`/devicestaking/stakes/pool/${appId}`)
  return data.data
}

export async function checkRequirements(appId: string, wallet: string): Promise<{ allRequiredMet: boolean; statuses: any[] }> {
  const { data } = await api.get(`/devicestaking/pool/${appId}/check/${wallet}`)
  return data.data
}

export async function createAnnouncement(appId: string, payload: CreateAnnouncementPayload): Promise<DeviceAnnouncement> {
  const { data } = await authAxios.post(`/devicestaking/pool/${appId}/announcements`, payload)
  return data.data
}

export async function getAnnouncements(appId: string, params?: { limit?: number; before?: string }): Promise<DeviceAnnouncement[]> {
  const { data } = await api.get(`/devicestaking/pool/${appId}/announcements`, { params })
  return data.data
}

export async function markAnnouncementRead(id: string): Promise<DeviceAnnouncement> {
  const { data } = await authAxios.post(`/devicestaking/announcements/${id}/read`)
  return data.data
}

export async function getCreatorAnalytics(appId: string): Promise<CreatorAnalytics> {
  const { data } = await authAxios.get(`/devicestaking/pool/${appId}/analytics`)
  return data.data
}

export async function checkGatedAccess(appId: string, wallet: string): Promise<{ hasAccess: boolean; poolName: string; stakingSince: string; label: string }> {
  const { data } = await api.get(`/device-access/${appId}/${wallet}`)
  return data.data
}
