import axios from 'axios'
import { authAxios } from './apiClient'

const API_BASE = import.meta.env.VITE_API_BASE_URL as string

const api = axios.create({
  baseURL: API_BASE,
})

export interface RewardsConfig {
  isEnabled: boolean
  rewardSchedule: number[]
  minAlgoBalance: number
  minFryBalance: number
  minWalletAgeDays: number
  claimCooldownHours: number
  streakResetHours: number
  trustTierThresholds: Record<string, number>
  trustTierMultipliers: number[]
  circuitBreakerLevel: string
  cappedHybridEnabled?: boolean
  maxGrossPerUser?: number
  liquidBps?: number
  vaultBps?: number
  dailyGlobalBudget?: number
  weeklyUnlockRequiredDays?: number
  dailyBudget?: {
    limit: number
    issued: number
    remaining: number
    claims: number
  }
  currentWeekWindow?: {
    start: string
    end: string
  }
}

export interface RewardsStatus {
  enabled: boolean
  wallet: string
  currentStreak: number
  maxStreak: number
  nextReward: number
  estimatedReward: number
  estimatedRewardAfterFee: number
  trustTier: number
  multiplier: number
  canClaim: boolean
  cooldownMinutes: number
  lastClaimAt: string | null
  totalClaimed: number
  totalClaims: number
  rewardSchedule: number[]
  circuitBreakerLevel: string
  hasActivePosition: boolean
  rewardMode?: 'streak' | 'capped-hybrid'
  liquidReward?: number
  vaultReward?: number
  dailyBudget?: {
    limit: number
    issued: number
    remaining: number
    claims: number
  }
}

export interface ClaimResult {
  txId: string
  actualReward: number
  baseReward: number
  trustTier?: number
  multiplier?: number
  streakDay: number
  currentStreak: number
  feeAmount?: number
  feePercent?: number
  rewardMode?: 'streak' | 'capped-hybrid'
  grossReward?: number
  liquidReward?: number
  vaultReward?: number
}

export interface LeaderboardEntry {
  wallet: string
  totalClaimed: number
  totalClaims: number
  currentStreak: number
  trustTier: number
}

export interface VaultStatus {
  enabled: boolean
  totalLocked: number
  totalUnlockable: number
  totalClaimed: number
  totalExpired: number
  currentWeek: {
    start: string
    end: string
    checkIns: number
    requiredForUnlock: number
  }
  unlockableAmount: number
}

export interface DailyBudgetInfo {
  enabled: boolean
  date: string
  budgetLimit: number
  totalIssued: number
  remaining: number
  claimCount: number
  maxPerUser: number
}

export interface VaultClaimResult {
  txId: string
  amount: number
  entriesClaimed: number
}

export async function fetchRewardsConfig(): Promise<RewardsConfig> {
  const { data } = await api.get('/rewards/config')
  return data.data
}

export async function fetchRewardsStatus(wallet: string): Promise<RewardsStatus> {
  const { data } = await api.get('/rewards/status', { params: { wallet } })
  return data.data
}

export async function claimReward(
  wallet: string,
  fingerprint: string,
  turnstileToken?: string
): Promise<ClaimResult> {
  const { data } = await authAxios.post('/rewards/claim', {
    wallet,
    fingerprint,
    turnstileToken,
  })
  return data.data
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data } = await api.get('/rewards/leaderboard')
  return data.data
}

export async function fetchVaultStatus(wallet: string): Promise<VaultStatus> {
  const { data } = await api.get('/rewards/vault-status', { params: { wallet } })
  return data.data
}

export async function claimVaultReward(
  fingerprint: string,
  turnstileToken?: string
): Promise<VaultClaimResult> {
  const { data } = await authAxios.post('/rewards/vault-claim', {
    fingerprint,
    turnstileToken,
  })
  return data.data
}

export async function fetchDailyBudget(): Promise<DailyBudgetInfo> {
  const { data } = await api.get('/rewards/daily-budget')
  return data.data
}
