import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL
const FEE_RECIPIENT = import.meta.env.VITE_FEE_RECIPIENT
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface FeeConfig {
  stakingDepositFeePercent: number
  stakingWithdrawFeePercent: number
  stakingClaimFeePercent: number
  farmingDepositFeePercent: number
  farmingWithdrawFeePercent: number
  farmingClaimFeePercent: number
  swapFeePercent: number
  dailyClaimFeePercent: number
  poolCreationFeePercent: number
  poolCreationFeeUsd: number
  feeRecipient: string
}

export interface FeeCalculation {
  feePercent: number
  baseAmount: number
  feeAmount: number
  netAmount: number
  feeRecipient: string
}

// Module-level cache
let cachedConfig: FeeConfig | null = null
let cacheTimestamp = 0

const ACTION_TYPE_MAP: Record<string, keyof FeeConfig> = {
  stakingDeposit: 'stakingDepositFeePercent',
  stakingWithdraw: 'stakingWithdrawFeePercent',
  stakingClaim: 'stakingClaimFeePercent',
  farmingDeposit: 'farmingDepositFeePercent',
  farmingWithdraw: 'farmingWithdrawFeePercent',
  farmingClaim: 'farmingClaimFeePercent',
  poolCreation: 'poolCreationFeePercent',
}

export async function fetchFeeConfig(): Promise<FeeConfig> {
  const now = Date.now()
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig
  }
  const res = await axios.get(`${API_BASE}/feeconfig`)
  cachedConfig = res.data.data as FeeConfig
  cacheTimestamp = now
  return cachedConfig
}

export function calculateFeeSimple(
  actionType: string,
  baseAmountMicro: number,
  feeConfig: FeeConfig
): FeeCalculation {
  const configKey = ACTION_TYPE_MAP[actionType]
  if (!configKey) throw new Error(`Unknown action type: ${actionType}`)

  const feePercent = feeConfig[configKey] as number
  const feeAmount = Math.floor(baseAmountMicro * feePercent / 100)
  const netAmount = baseAmountMicro - feeAmount

  return {
    feePercent,
    baseAmount: baseAmountMicro,
    feeAmount,
    netAmount,
    feeRecipient: FEE_RECIPIENT,
  }
}

export { FEE_RECIPIENT }
