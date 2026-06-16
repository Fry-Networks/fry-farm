import algosdk from 'algosdk'
import type { TransactionSigner } from 'algosdk'
import { AddLiquidity, RemoveLiquidity, poolUtils, PoolStatus } from '@tinymanorg/tinyman-js-sdk'
import type { V2PoolInfo, V2SingleAssetInAddLiquidityQuote, SignerTransaction } from '@tinymanorg/tinyman-js-sdk'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ZapQuote {
  /** Expected LP tokens in micro-units */
  expectedLpMicro: bigint
  /** Min LP tokens after slippage, in micro-units */
  minLpMicro: bigint
  /** Price impact of the internal swap (0-1) */
  priceImpact: number
  /** Internal swap fee in micro-units */
  swapFees: bigint
  /** LP token ASA ID */
  poolTokenId: number
  /** Raw SDK quote for building transactions */
  _raw: V2SingleAssetInAddLiquidityQuote
}

// ─── Pool ────────────────────────────────────────────────────────────────────

export async function getPool(
  algod: algosdk.Algodv2,
  asset1Id: number,
  asset2Id: number,
): Promise<V2PoolInfo> {
  const pool = await poolUtils.v2.getPoolInfo({
    client: algod as any,
    network: 'mainnet',
    asset1ID: asset1Id,
    asset2ID: asset2Id,
  })

  if (pool.status !== PoolStatus.READY) {
    throw new Error(`Tinyman pool is not ready (status: ${pool.status})`)
  }

  if (!pool.poolTokenID) {
    throw new Error('Pool has no LP token ID')
  }

  return pool
}

// ─── Quote ───────────────────────────────────────────────────────────────────

export function getZapQuote(
  pool: V2PoolInfo,
  inputAssetId: number,
  inputAmountMicro: bigint,
  decimals: { asset1: number; asset2: number },
  slippage = 0.005,
): ZapQuote {
  const quote = AddLiquidity.v2.withSingleAsset.getQuote({
    pool,
    assetIn: { id: inputAssetId, amount: inputAmountMicro },
    decimals,
    slippage,
  })

  return {
    expectedLpMicro: quote.poolTokenOut.amount,
    minLpMicro: quote.minPoolTokenAssetAmountWithSlippage,
    priceImpact: quote.internalSwapQuote.priceImpact,
    swapFees: quote.internalSwapQuote.swapFees,
    poolTokenId: quote.poolTokenOut.id,
    _raw: quote,
  }
}

// ─── Build Transactions ──────────────────────────────────────────────────────

export async function buildAddLiquidityTxns(
  algod: algosdk.Algodv2,
  pool: V2PoolInfo,
  inputAssetId: number,
  inputAmountMicro: bigint,
  userAddress: string,
  minPoolTokenAmount: bigint,
): Promise<SignerTransaction[]> {
  const txnGroup = await AddLiquidity.v2.withSingleAsset.generateTxns({
    client: algod as any,
    network: 'mainnet',
    poolAddress: String(pool.account.address()),
    assetIn: { id: inputAssetId, amount: inputAmountMicro },
    poolTokenId: pool.poolTokenID!,
    initiatorAddr: userAddress,
    minPoolTokenAssetAmount: minPoolTokenAmount,
  })

  return txnGroup
}

// ─── Sign & Submit ───────────────────────────────────────────────────────────

export async function signAndSubmitAddLiquidity(
  algod: algosdk.Algodv2,
  pool: V2PoolInfo,
  txnGroup: SignerTransaction[],
  signTransactions: (txns: Uint8Array[], indexesToSign?: number[], returnGroup?: boolean) => Promise<Uint8Array[]>,
): Promise<{ txId: string; confirmedRound: number }> {
  // SDK already assigns group IDs in generateTxns — do NOT call assignGroupID again
  // For V2 single-asset add-liquidity, all txns are user-signed (no logicsig)
  const encodedTxns = txnGroup.map((st) => algosdk.encodeUnsignedTransaction(st.txn))
  const signedTxns = await signTransactions(encodedTxns)

  const { txId } = await algod.sendRawTransaction(signedTxns).do()
  const result = await algosdk.waitForConfirmation(algod, txId, 4)

  return { txId, confirmedRound: result['confirmed-round'] as number }
}

// ─── Get LP Tokens Received ──────────────────────────────────────────────────

export async function getLpTokensReceived(
  algod: algosdk.Algodv2,
  userAddress: string,
  poolTokenId: number,
): Promise<bigint> {
  try {
    const info = await algod.accountAssetInformation(userAddress, poolTokenId).do()
    return BigInt(info['asset-holding']?.amount ?? 0)
  } catch {
    return 0n
  }
}

// ─── Balance Helpers ─────────────────────────────────────────────────────────

export async function getAssetBalance(
  algod: algosdk.Algodv2,
  userAddress: string,
  assetId: number,
): Promise<bigint> {
  try {
    if (assetId === 0) {
      const info = await algod.accountInformation(userAddress).do()
      const total = BigInt(info.amount ?? 0)
      const minBal = BigInt(info['min-balance'] ?? 0)
      const buffer = 1_000_000n // 1 ALGO/VOI safety buffer for fees
      const available = total - minBal - buffer
      return available > 0n ? available : 0n
    }
    const info = await algod.accountAssetInformation(userAddress, assetId).do()
    return BigInt(info['asset-holding']?.amount ?? 0)
  } catch {
    return 0n
  }
}

export async function isOptedIn(
  algod: algosdk.Algodv2,
  userAddress: string,
  assetId: number,
): Promise<boolean> {
  try {
    await algod.accountAssetInformation(userAddress, assetId).do()
    return true
  } catch {
    return false
  }
}

export async function optInToAsset(
  algod: algosdk.Algodv2,
  userAddress: string,
  assetId: number,
  signer: TransactionSigner,
): Promise<void> {
  const params = await algod.getTransactionParams().do()
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    from: userAddress,
    to: userAddress,
    assetIndex: assetId,
    amount: 0,
    suggestedParams: params,
  })
  const signed = await signer([txn], [0])
  const { txId } = await algod.sendRawTransaction(signed).do()
  await algosdk.waitForConfirmation(algod, txId, 4)
}

// ─── Remove Liquidity ─────────────────────────────────────────────────────

export function getRemoveLiquidityQuote(
  pool: V2PoolInfo,
  poolTokenInMicro: bigint,
  assetOutId: number,
  decimals: { assetIn: number; assetOut: number },
): { expectedOutputMicro: bigint; priceImpact: number } {
  const reserves = {
    asset1: pool.asset1Reserves!,
    asset2: pool.asset2Reserves!,
    issuedLiquidity: pool.issuedPoolTokens!,
    round: 0,
  }
  const quote = RemoveLiquidity.v2.getSingleAssetRemoveLiquidityQuote({
    pool,
    reserves,
    poolTokenIn: poolTokenInMicro,
    assetOutID: assetOutId,
    decimals,
  })
  return {
    expectedOutputMicro: quote.assetOut.amount,
    priceImpact: quote.internalSwapQuote.priceImpact,
  }
}

export async function buildRemoveLiquidityTxns(
  algod: algosdk.Algodv2,
  pool: V2PoolInfo,
  poolTokenInMicro: bigint,
  outputAssetId: number,
  userAddress: string,
  minOutputMicro: bigint,
  slippage: number,
): Promise<SignerTransaction[]> {
  return RemoveLiquidity.v2.generateSingleAssetOutTxns({
    client: algod as any,
    pool,
    outputAssetId,
    poolTokenIn: poolTokenInMicro,
    initiatorAddr: userAddress,
    minOutputAssetAmount: minOutputMicro,
    slippage,
  })
}
