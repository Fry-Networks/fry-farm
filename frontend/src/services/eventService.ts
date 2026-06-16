import axios from 'axios'
import { authAxios } from './apiClient'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string
const api = axios.create({ baseURL: API_BASE })

export interface EventChallenge {
  _id: string
  eventId: string
  type: string
  name: string
  description?: string
  pointsMultiplier: number
  enabled: boolean
  config?: {
    minAmount?: number
    specificPoolIds?: string[]
    specificTokenIds?: number[]
    streakBonusPerDay?: number
  }
}

export interface AirdropTier {
  rank: number
  rankEnd: number
  rewardFry: number
}

export interface CommunityAirdropTier {
  rank: number
  rankEnd?: number
  rewardAmount: number
}

export interface FryEvent {
  _id: string
  name: string
  description?: string
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled'
  startDate?: string
  endDate?: string
  airdropPoolFry: number
  airdropDistribution: 'proportional' | 'tiered'
  airdropTiers?: AirdropTier[]
  minPointsToQualify: number
  bannerImage?: string
  totalParticipants: number
  lastPointsUpdate?: string
  challenges?: EventChallenge[]
  autoSchedule?: {
    enabled: boolean
    templateName?: string
    recurrence?: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    nextRunDate?: string
  }
  // Community event fields
  eventType?: 'official' | 'community'
  creatorWallet?: string
  rewardAsaId?: number
  rewardAsaName?: string
  rewardAsaDecimals?: number
  rewardPool?: number
  fundingStatus?: 'unfunded' | 'funded' | 'distributed' | 'refunded'
  fundingTxId?: string
  fundingFeeAmount?: number
  fundingFeeTxId?: string
  fundedAt?: string
  isHidden?: boolean
  vesting?: {
    enabled: boolean
    startDate?: string
    durationDays?: number
    cliffDays?: number
    model?: 'linear' | 'cliff-linear'
    rewardAsaId?: number
    totalPool?: number // microFRY
    vestingType?: 'off-chain' | 'on-chain'
    appId?: number // Algorand app ID for on-chain vesting
  }
}

export interface ChallengePointEntry {
  challengeId: string
  challengeType: string
  points: number
  lastCalculated?: string
}

export interface LeaderboardEntry {
  _id: string
  wallet: string
  totalPoints: number
  rank: number
  challengePoints: ChallengePointEntry[]
  airdropAmount?: number
  airdropStatus?: string
}

export interface UserPoints {
  _id: string
  eventId: string
  wallet: string
  totalPoints: number
  rank: number | null
  challengePoints: ChallengePointEntry[]
  airdropAmount?: number
  airdropTxId?: string
  airdropStatus?: string
}

// Discriminated union mirroring backend vestingController.js:43-59
export type VestingStatus =
  | { enabled: false; message?: string }
  | { enabled: true; qualified: false; message?: string }
  | {
      enabled: true
      qualified: true
      totalAllocation: number // microFRY
      vestedAmount: number // microFRY unlocked so far
      claimedAmount: number // microFRY already claimed
      claimableAmount: number // microFRY ready to claim now
      vestingStartDate: string
      vestingEndDate: string
      vestingModel: 'linear' | 'cliff-linear'
      durationDays: number
      percentVested: number // 0-100
      percentClaimed: number // 0-100
      nextUnlockAmount: number // approx microFRY per day
      isFullyVested: boolean
      rewardAsaId: number
      claimCount: number
      lastClaimAt: string | null
      lastClaimTxId: string | null
    }

export interface VestingClaimResult {
  txId: string
  claimedAmount: number // microFRY just claimed
  newClaimedTotal: number
  remainingAllocation: number
  isFullyVested: boolean
}

export async function fetchActiveEvents(): Promise<FryEvent[]> {
  const { data } = await api.get('/events/active')
  return data.data
}

export async function fetchAllEvents(): Promise<FryEvent[]> {
  const { data } = await api.get('/events')
  return data.data
}

export async function fetchEventById(id: string): Promise<FryEvent> {
  const { data } = await api.get(`/events/${id}`)
  return data.data
}

export async function fetchLeaderboard(
  eventId: string,
  limit = 50,
  offset = 0
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  const { data } = await api.get(`/events/${eventId}/leaderboard`, {
    params: { limit, offset },
  })
  return data.data
}

export async function fetchUserPoints(
  eventId: string,
  wallet: string
): Promise<UserPoints> {
  const { data } = await api.get(`/events/${eventId}/points/${wallet}`)
  return data.data
}

export async function fetchVestingStatus(
  eventId: string,
  wallet: string
): Promise<VestingStatus> {
  const { data } = await api.get(`/events/${eventId}/vesting/status`, {
    params: { wallet },
  })
  return data.data
}

export async function claimVesting(eventId: string): Promise<VestingClaimResult> {
  const { data } = await authAxios.post(`/events/${eventId}/vesting/claim`)
  return data.data
}

// ─── Admin payload interfaces ───

export interface CreateEventPayload {
  name: string
  description?: string
  startDate?: string
  endDate?: string
  airdropPoolFry?: number
  airdropDistribution?: 'proportional' | 'tiered'
  airdropTiers?: AirdropTier[]
  minPointsToQualify?: number
  autoSchedule?: FryEvent['autoSchedule']
  bannerImage?: string
  status?: 'draft' | 'scheduled'
  vesting?: {
    enabled?: boolean
    startDate?: string
    durationDays?: number
    cliffDays?: number
    model?: 'linear' | 'cliff-linear'
    rewardAsaId?: number
    totalPool?: number
    vestingType?: 'off-chain' | 'on-chain'
    appId?: number
  }
}

export interface CreateChallengePayload {
  type: string
  name: string
  description?: string
  pointsMultiplier?: number
  enabled?: boolean
  config?: EventChallenge['config']
}

// ─── Admin API functions ───

export async function createEvent(payload: CreateEventPayload): Promise<FryEvent> {
  const { data } = await authAxios.post('/events', payload)
  return data.data
}

export async function updateEvent(id: string, payload: Partial<CreateEventPayload>): Promise<FryEvent> {
  const { data } = await authAxios.put(`/events/${id}`, payload)
  return data.data
}

export async function deleteEvent(id: string): Promise<void> {
  await authAxios.delete(`/events/${id}`)
}

export async function activateEvent(id: string): Promise<FryEvent> {
  const { data } = await authAxios.post(`/events/${id}/activate`)
  return data.data
}

export async function endEvent(id: string): Promise<FryEvent> {
  const { data } = await authAxios.post(`/events/${id}/end`)
  return data.data
}

export async function cancelEvent(id: string): Promise<FryEvent> {
  const { data } = await authAxios.post(`/events/${id}/cancel`)
  return data.data
}

export async function addChallenge(eventId: string, payload: CreateChallengePayload): Promise<EventChallenge> {
  const { data } = await authAxios.post(`/events/${eventId}/challenges`, payload)
  return data.data
}

export async function updateChallenge(challengeId: string, payload: Partial<CreateChallengePayload>): Promise<EventChallenge> {
  const { data } = await authAxios.put(`/events/challenges/${challengeId}`, payload)
  return data.data
}

export async function removeChallenge(challengeId: string): Promise<void> {
  await authAxios.delete(`/events/challenges/${challengeId}`)
}

export async function triggerPointCalculation(eventId: string): Promise<void> {
  await authAxios.post(`/events/${eventId}/calculate-points`)
}

export async function triggerAirdrop(eventId: string): Promise<void> {
  await authAxios.post(`/events/${eventId}/airdrop`)
}

export async function uploadEventBanner(eventId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('banner', file)
  const { data } = await authAxios.post(`/events/${eventId}/banner`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data.bannerImage
}

// ─── Community event types ───

export interface CreateCommunityEventPayload {
  name: string
  description?: string
  startDate: string
  endDate: string
  rewardAsaId: number
  rewardAmount: number
  airdropDistribution?: 'proportional' | 'tiered'
  airdropTiers?: CommunityAirdropTier[]
  minPointsToQualify?: number
  bannerImage?: string
  challenges: CreateChallengePayload[]
  vesting?: {
    enabled?: boolean
    startDate?: string
    durationDays?: number
    cliffDays?: number
    model?: 'linear' | 'cliff-linear'
    rewardAsaId?: number
    totalPool?: number
    vestingType?: 'off-chain' | 'on-chain'
    appId?: number
  }
}

export interface FundingResult {
  eventId: string
  unsignedTxns: string[]
  feeTxn: string | null
  feeAmount: number
  netAmount: number
  escrowAddress: string
  rewardAsaId: number
  rewardAsaName: string
}

// ─── Community event API functions ───

export async function fetchCommunityEvents(status?: string): Promise<FryEvent[]> {
  const { data } = await api.get('/community-events', { params: status ? { status } : {} })
  return data.data
}

export async function fetchCommunityEventById(id: string): Promise<FryEvent> {
  const { data } = await api.get(`/community-events/${id}`)
  return data.data
}

export async function fetchMyCommunityEvents(): Promise<FryEvent[]> {
  const { data } = await authAxios.get('/community-events/mine')
  return data.data
}

export async function createCommunityEvent(payload: CreateCommunityEventPayload): Promise<{ event: FryEvent; feeInfo: any }> {
  const { data } = await authAxios.post('/community-events', payload)
  return data.data
}

export async function updateCommunityEvent(id: string, payload: Partial<CreateCommunityEventPayload>): Promise<FryEvent> {
  const { data } = await authAxios.put(`/community-events/${id}`, payload)
  return data.data
}

export async function buildCommunityFunding(id: string): Promise<FundingResult> {
  const { data } = await authAxios.post(`/community-events/${id}/fund`)
  return data.data
}

export async function confirmCommunityFunding(id: string, txId: string, feeTxId: string): Promise<FryEvent> {
  const { data } = await authAxios.post(`/community-events/${id}/confirm-funding`, { txId, feeTxId })
  return data.data
}

export async function cancelCommunityEvent(id: string): Promise<FryEvent> {
  const { data } = await authAxios.post(`/community-events/${id}/cancel`)
  return data.data
}

export async function addCommunityChallenge(eventId: string, payload: CreateChallengePayload): Promise<EventChallenge> {
  const { data } = await authAxios.post(`/community-events/${eventId}/challenges`, payload)
  return data.data
}

export async function updateCommunityChallenge(challengeId: string, payload: Partial<CreateChallengePayload>): Promise<EventChallenge> {
  const { data } = await authAxios.put(`/community-events/challenges/${challengeId}`, payload)
  return data.data
}

export async function removeCommunityChallenge(challengeId: string): Promise<void> {
  await authAxios.delete(`/community-events/challenges/${challengeId}`)
}

export async function uploadCommunityBanner(eventId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('banner', file)
  const { data } = await authAxios.post(`/community-events/${eventId}/banner`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data.bannerImage
}

export async function hideCommunityEvent(id: string, reason: string): Promise<FryEvent> {
  const { data } = await authAxios.put(`/community-events/${id}/hide`, { reason })
  return data.data
}
