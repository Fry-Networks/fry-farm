import algosdk from 'algosdk'

// Haystack Staking Constants
export const HAYSTACK_STAKING_APP_ID = 3321763884
export const HAYSTACK_ORACLE_APP_ID = 3016268320
export const HAY_ASA_ID = 3160000000
export const USDC_ASA_ID = 31566704

// ARC-4 Method Selectors (first 4 bytes of method signature hash)
export const HAYSTACK_SELECTORS = {
  stake: new Uint8Array([0xdb, 0x6c, 0x1f, 0x5e]),
  unstake: new Uint8Array([0xcd, 0xae, 0x2c, 0x16]),
  claim: new Uint8Array([0x3b, 0x4b, 0x55, 0x15]),
}

// User stake data from box storage
export interface HaystackStakeData {
  stakedAmount: bigint
  rewardDebtHay: bigint
  rewardDebtUsdc: bigint
  lastClaimTs: bigint
  field5: bigint
  field6: bigint
  field7: bigint
}

// Pool state from global state
export interface HaystackPoolState {
  totalStaked: number
  emaAPRHay: number
  emaAPRUsdc: number
  epochLenSecs: number
  lastEpoch: number
  paused: boolean
}

function readUint64BE(buf: Uint8Array, offset: number): bigint {
  let val = 0n
  for (let i = 0; i < 8; i++) {
    val = (val << 8n) | BigInt(buf[offset + i])
  }
  return val
}

export async function getUserStakeData(
  algodClient: algosdk.Algodv2,
  userAddress: string,
): Promise<HaystackStakeData | null> {
  const boxKey = algosdk.decodeAddress(userAddress).publicKey
  try {
    const boxResponse = await algodClient.getApplicationBoxByName(HAYSTACK_STAKING_APP_ID, boxKey).do()
    const data = new Uint8Array(boxResponse.value)
    if (data.length < 56) return null
    return {
      stakedAmount: readUint64BE(data, 0),
      rewardDebtHay: readUint64BE(data, 8),
      rewardDebtUsdc: readUint64BE(data, 16),
      lastClaimTs: readUint64BE(data, 24),
      field5: readUint64BE(data, 32),
      field6: readUint64BE(data, 40),
      field7: readUint64BE(data, 48),
    }
  } catch {
    return null // Box doesn't exist = user hasn't staked
  }
}

export async function getHaystackPoolState(
  algodClient: algosdk.Algodv2,
): Promise<HaystackPoolState> {
  const appInfo = await algodClient.getApplicationByID(HAYSTACK_STAKING_APP_ID).do()
  const gs = appInfo.params['global-state'] || []
  const state: Record<string, number> = {}
  for (const item of gs) {
    const key = Buffer.from(item.key, 'base64').toString('utf8')
    if (item.value.type === 2) {
      state[key] = item.value.uint
    }
  }
  return {
    totalStaked: state.staked || 0,
    emaAPRHay: state.emaAPRHay || 0,
    emaAPRUsdc: state.emaAPRUsdc || 0,
    epochLenSecs: state.epochLenSecs || 0,
    lastEpoch: state.lastEpoch || 0,
    paused: state.paus === 1,
  }
}

// Haystack transaction builders
export async function buildHaystackStakeTxns(
  sender: string,
  stakeAmount: number,
  algodClient: any,
): Promise<algosdk.Transaction[]> {
  const appAddress = algosdk.getApplicationAddress(HAYSTACK_STAKING_APP_ID)
  const usdcAmount = BigInt(stakeAmount)
  
  const params = await algodClient.getTransactionParams().do()
  params.fee = 2000
  params.flatFee = true

  // App call with stake selector
  const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
    from: sender,
    appIndex: HAYSTACK_STAKING_APP_ID,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    appArgs: [HAYSTACK_SELECTORS.stake],
    foreignAssets: [USDC_ASA_ID, HAY_ASA_ID],
    foreignApps: [HAYSTACK_ORACLE_APP_ID],
    suggestedParams: params,
  })

  // USDC asset transfer to app
  const usdcTransferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: sender,
    to: appAddress,
    amount: usdcAmount,
    assetIndex: USDC_ASA_ID,
    suggestedParams: params,
  })

  return [usdcTransferTxn, appCallTxn]
}

export async function buildHaystackUnstakeTxns(
  sender: string,
  unstakeAmount: number,
  algodClient: any,
): Promise<algosdk.Transaction[]> {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 9000 // Higher fee for inner transactions
  params.flatFee = true

  // Encode unstake amount as uint64 big-endian
  const amountBuffer = new ArrayBuffer(8)
  const view = new BigUint64Array(amountBuffer)
  view[0] = BigInt(unstakeAmount)
  const amountBytes = new Uint8Array(amountBuffer)
  const amountArg = new Uint8Array(8)
  for (let i = 0; i < 8; i++) {
    amountArg[i] = amountBytes[7 - i] // Reverse for big-endian
  }

  const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
    from: sender,
    appIndex: HAYSTACK_STAKING_APP_ID,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    appArgs: [HAYSTACK_SELECTORS.unstake, amountArg],
    foreignAssets: [USDC_ASA_ID, HAY_ASA_ID],
    foreignApps: [HAYSTACK_ORACLE_APP_ID],
    suggestedParams: params,
  })

  return [appCallTxn]
}

export async function buildHaystackClaimTxns(
  sender: string,
  algodClient: any,
): Promise<algosdk.Transaction[]> {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 6000 // Higher fee for inner transactions
  params.flatFee = true

  const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
    from: sender,
    appIndex: HAYSTACK_STAKING_APP_ID,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    appArgs: [HAYSTACK_SELECTORS.claim],
    foreignAssets: [USDC_ASA_ID, HAY_ASA_ID],
    foreignApps: [HAYSTACK_ORACLE_APP_ID],
    suggestedParams: params,
  })

  return [appCallTxn]
}
