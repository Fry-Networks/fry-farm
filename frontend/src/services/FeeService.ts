import { authAxios } from './apiClient'
import algosdk, { TransactionSigner } from 'algosdk'

const API_BASE = import.meta.env.VITE_API_BASE_URL
const FEE_RECIPIENT = import.meta.env.VITE_FEE_RECIPIENT
const FEE_ROUTER_APP_ID = Number(import.meta.env.VITE_FEE_ROUTER_APP_ID) || 3509411111
const FEE_ROUTER_ADDR = import.meta.env.VITE_FEE_ROUTER_ADDR || 'AM53XSHRSSSZMNFAMKVAJFXHPMIYYUUBOVCODJ2LQY3D27CVXAHAPIXYXQ'
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
  p2pCreateFeePercent: number
  p2pAcceptFeePercent: number
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
  p2pCreate: 'p2pCreateFeePercent',
  p2pAccept: 'p2pAcceptFeePercent',
  swap: 'swapFeePercent',
}

export async function fetchFeeConfig(): Promise<FeeConfig> {
  const now = Date.now()
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig
  }
  const res = await authAxios.get(`/feeconfig?_t=${Date.now()}`)
  cachedConfig = res.data.data as FeeConfig
  cacheTimestamp = now
  return cachedConfig
}

export function calculateFeeSimple(
  actionType: string,
  baseAmountMicro: number,
  feeConfig: FeeConfig,
  feeRecipientOverride?: string | null
): FeeCalculation {
  const configKey = ACTION_TYPE_MAP[actionType]
  if (!configKey) throw new Error(`Unknown action type: ${actionType}`)

  const feePercent = (feeConfig[configKey] as number) ?? 0
  const feeAmount = Math.floor(baseAmountMicro * feePercent / 100)
  const netAmount = baseAmountMicro - feeAmount

  return {
    feePercent,
    baseAmount: baseAmountMicro,
    feeAmount,
    netAmount,
    feeRecipient: feeRecipientOverride || FEE_RECIPIENT,
  }
}

/**
 * Route a fee through the on-chain FeeRouter (app 3509411111).
 * Constructs an atomic group of [pay/axfer -> FeeRouter] + [app call route_*_fee].
 * Fee budget: app call = sp.fee * 3, transfer = sp.fee, total group = 0.004 ALGO.
 */
export async function routeFeeViaRouter(
  sender: string,
  signer: TransactionSigner,
  feeAmount: number,
  feeTokenId: number,
  algodClient: algosdk.Algodv2,
  feeRouterAppIdOverride?: number | null,
  feeRouterAddrOverride?: string | null
): Promise<{ txId: string }> {
  const sp = await algodClient.getTransactionParams().do()
  const baseFee = Math.max(sp.fee, 1000)

  const feeRouterAddr = feeRouterAddrOverride ?? FEE_ROUTER_ADDR
  const feeRouterAppId = feeRouterAppIdOverride ?? FEE_ROUTER_APP_ID

  const atc = new algosdk.AtomicTransactionComposer()

  if (feeTokenId === 0) {
    // ALGO route: PaymentTxn + AppCallTxn(route_algo_fee)
    const selector = Buffer.from('7b260fc0', 'hex')
    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: sender,
      to: feeRouterAddr,
      amount: BigInt(feeAmount),
      suggestedParams: sp,
    })
    payTxn.fee = baseFee

    const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
      from: sender,
      suggestedParams: sp,
      appIndex: feeRouterAppId,
      appArgs: [selector],
    })
    appCallTxn.fee = baseFee * 3

    atc.addTransaction({ txn: payTxn, signer })
    atc.addTransaction({ txn: appCallTxn, signer })
  } else {
    // ASA route: AssetTransferTxn + AppCallTxn(route_asa_fee)
    const selector = Buffer.from('f9d8a6a7', 'hex')
    const axferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      from: sender,
      to: feeRouterAddr,
      amount: BigInt(feeAmount),
      assetIndex: feeTokenId,
      suggestedParams: sp,
    })
    axferTxn.fee = baseFee

    const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
      from: sender,
      suggestedParams: sp,
      appIndex: feeRouterAppId,
      appArgs: [selector],
      foreignAssets: [feeTokenId],
    })
    appCallTxn.fee = baseFee * 3

    atc.addTransaction({ txn: axferTxn, signer })
    atc.addTransaction({ txn: appCallTxn, signer })
  }

  const result = await atc.execute(algodClient, 4)
  const txId = result.txIDs[0] ?? result.txIDs[1]
  if (!txId) {
    throw new Error('FeeRouter group did not return a txID')
  }
  return { txId }
}

export { FEE_RECIPIENT, FEE_ROUTER_ADDR }
