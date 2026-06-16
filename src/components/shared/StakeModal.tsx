import React, { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import Button from './button'
import { stakeTokens as stakeFarmTokens } from '../../farming_func'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { useChain } from '../../context/ChainContext'
import { stakeTokens as stakePoolTokens } from '../../staking_func'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import { loadMarketData, findPool } from '../../contracts/nomadex/api'
import { useAuth } from '../../hooks/useAuth'
import { authAxios } from '../../services/apiClient'
import {
  getPool,
  getZapQuote,
  buildAddLiquidityTxns,
  signAndSubmitAddLiquidity,
  getAssetBalance,
  getLpTokensReceived,
  isOptedIn,
  optInToAsset,
} from '../../services/ZapService'
import type { ZapQuote } from '../../services/ZapService'
import type { V2PoolInfo } from '@tinymanorg/tinyman-js-sdk'

interface StakeModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  appId: number
  stakeTokenId: number
  stakeTokenName: string
  isLpFarm: boolean
  stakeTokenBId?: number
  pairName?: string
  contractVersion?: number
}

type StakeStep = 'input' | 'confirm' | 'adding-liquidity' | 'staking' | 'success' | 'error'

const StakeModal: React.FC<StakeModalProps> = ({
  visible,
  onClose,
  onSuccess,
  appId,
  stakeTokenId,
  stakeTokenName,
  isLpFarm,
  stakeTokenBId,
  pairName,
  contractVersion,
}) => {
  const { activeAddress, signer, signTransactions } = useMultiChainWallet()
  const { getAlgodClient, activeChain, chainId } = useChain()
  const { ensureAuth } = useAuth()

  // Build algod config for chain-aware staking functions
  const chainAlgodConfig = 'algodServer' in (activeChain.connection as any)
    ? { server: (activeChain.connection as any).algodServer, port: (activeChain.connection as any).algodPort, token: (activeChain.connection as any).algodToken }
    : undefined

  const [step, setStep] = useState<StakeStep>('input')
  const [selectedSide, setSelectedSide] = useState<'A' | 'B'>('B')
  const [inputAmount, setInputAmount] = useState('')
  const [slippage, setSlippage] = useState(0.5)
  const [quote, setQuote] = useState<ZapQuote | null>(null)
  const [pool, setPool] = useState<V2PoolInfo | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [balance, setBalance] = useState<bigint>(0n)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [error, setError] = useState('')
  const [lpReceived, setLpReceived] = useState(0)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolFailed, setPoolFailed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [lpStakeAmount, setLpStakeAmount] = useState('')
  const [lpBalance, setLpBalance] = useState<bigint>(0n)
  const [lpBalanceLoading, setLpBalanceLoading] = useState(false)

  // Calculate max stakeable amount after fee deduction
  const getMaxStakeAmount = useCallback(async (rawBalance: bigint, decimals: number): Promise<string> => {
    const feeType = isLpFarm ? 'farmingDeposit' : 'stakingDeposit'
    try {
      const feeConfig = await fetchFeeConfig()
      const configKey = feeType === 'farmingDeposit' ? 'farmingDepositFeePercent' : 'stakingDepositFeePercent'
      const feePercent = (feeConfig[configKey as keyof typeof feeConfig] as number) ?? 0
      if (feePercent > 0) {
        const maxMicro = Math.floor(Number(rawBalance) * 100 / (100 + feePercent))
        return (maxMicro / Math.pow(10, decimals)).toString()
      }
    } catch (e) {
      console.warn('Fee config fetch failed for MAX, using raw balance:', e)
    }
    return (Number(rawBalance) / Math.pow(10, decimals)).toString()
  }, [isLpFarm])

  const displayName = isLpFarm ? (pairName || stakeTokenName) : stakeTokenName
  const tokenNames = isLpFarm ? (pairName || '').split('/') : []
  const tokenAName = tokenNames[0]?.trim() || 'Token A'
  const tokenBName = tokenNames[1]?.trim() || 'Token B'
  const inputAssetId = isLpFarm ? (selectedSide === 'A' ? stakeTokenId : stakeTokenBId!) : stakeTokenId
  const inputTokenName = isLpFarm ? (selectedSide === 'A' ? tokenAName : tokenBName) : stakeTokenName
  const inputDecimals = 6

  const algod = getAlgodClient()

  const refreshBalance = useCallback(async () => {
    if (!activeAddress) return 0n
    setBalanceLoading(true)
    try {
      const fresh = await getAssetBalance(algod, activeAddress, inputAssetId)
      setBalance(fresh)
      return fresh
    } finally {
      setBalanceLoading(false)
    }
  }, [activeAddress, inputAssetId])

  const refreshLpBalance = useCallback(async () => {
    if (!activeAddress || !pool) return 0n
    setLpBalanceLoading(true)
    try {
      const fresh = await getAssetBalance(algod, activeAddress, pool.poolTokenID!)
      setLpBalance(fresh)
      return fresh
    } finally {
      setLpBalanceLoading(false)
    }
  }, [activeAddress, pool])

  // Fetch pool info on open (LP farm only)
  useEffect(() => {
    if (!visible || !isLpFarm || !stakeTokenBId) return
    setPoolLoading(true)
    getPool(algod, stakeTokenId, stakeTokenBId)
      .then(setPool)
      .catch((e) => {
        console.error('Pool fetch error:', e)
        setPoolFailed(true)
      })
      .finally(() => setPoolLoading(false))
  }, [visible, stakeTokenId, stakeTokenBId, isLpFarm])

  // Fetch user balance when asset changes
  useEffect(() => {
    if (!visible || !activeAddress) return
    setBalanceLoading(true)
    getAssetBalance(algod, activeAddress, inputAssetId)
      .then(setBalance)
      .finally(() => setBalanceLoading(false))
  }, [visible, activeAddress, inputAssetId])

  // Reset input state when modal opens to prevent stale max/balance desync
  useEffect(() => {
    if (visible) {
      setInputAmount('')
      setLpStakeAmount('')
      setStep('input')
      setQuote(null)
      setQuoteError('')
      setError('')
      setLpReceived(0)
      setShowAdvanced(false)
    }
  }, [visible])

  // Fetch quote when input changes (LP farm ZAP mode only)
  useEffect(() => {
    if (!isLpFarm || showAdvanced || !pool || !inputAmount) {
      setQuote(null)
      setQuoteError('')
      return
    }

    const amount = parseFloat(inputAmount)
    if (isNaN(amount) || amount <= 0) {
      setQuote(null)
      return
    }

    const amountMicro = BigInt(Math.floor(amount * Math.pow(10, inputDecimals)))
    if (amountMicro <= 0n) {
      setQuote(null)
      return
    }

    setQuoteLoading(true)
    setQuoteError('')

    try {
      const q = getZapQuote(
        pool,
        inputAssetId,
        amountMicro,
        { asset1: inputDecimals, asset2: inputDecimals },
        slippage / 100,
      )
      setQuote(q)
    } catch (e: any) {
      console.error('Quote error:', e)
      setQuoteError(e.message || 'Could not get quote')
      setQuote(null)
    } finally {
      setQuoteLoading(false)
    }
  }, [pool, inputAmount, inputAssetId, slippage, isLpFarm, showAdvanced])

  const inputAmountMicro = (() => {
    const v = parseFloat(inputAmount)
    if (isNaN(v) || v <= 0) return 0n
    return BigInt(Math.floor(v * Math.pow(10, inputDecimals)))
  })()

  const insufficientBalance = inputAmountMicro > 0n && inputAmountMicro > balance

  // For simple staking pools
  const canStakeSimple = inputAmountMicro > 0n && !insufficientBalance && !!activeAddress && !!signer
  // For LP farm ZAP mode
  const canZap = !!quote && inputAmountMicro > 0n && !insufficientBalance && !!activeAddress && !!signer && !!pool

  // Fetch LP balance when advanced mode toggled
  useEffect(() => {
    if (!showAdvanced || !activeAddress || !pool) return
    setLpBalanceLoading(true)
    getAssetBalance(algod, activeAddress, pool.poolTokenID!)
      .then(setLpBalance)
      .finally(() => setLpBalanceLoading(false))
  }, [showAdvanced, activeAddress, pool])

  // Simple stake (staking pools or LP farm advanced)
  const handleSimpleStake = useCallback(async () => {
    const isAdvancedLp = isLpFarm && showAdvanced
    const amountStr = isAdvancedLp ? lpStakeAmount : inputAmount
    const amount = parseFloat(amountStr)
    if (!activeAddress || !signer || isNaN(amount) || amount <= 0) return

    // Pre-flight: verify balance is still sufficient
    const stakeAmountMicroBig = BigInt(Math.floor(amount * 1_000_000))
    const freshBal = isAdvancedLp ? await refreshLpBalance() : await refreshBalance()
    if (stakeAmountMicroBig > freshBal) {
      toast.error('Balance changed — please adjust your amount and try again')
      return
    }

    setStep('staking')
    const stakeAmountMicro = Math.floor(amount * 1_000_000)

    try {
      await ensureAuth()
      const feeType = isLpFarm ? 'farmingDeposit' : 'stakingDeposit'
      const feeConfig = await fetchFeeConfig()
      const fee = calculateFeeSimple(feeType, stakeAmountMicro, feeConfig, activeChain.feeRecipient)

      const tokenId = isAdvancedLp ? pool!.poolTokenID! : stakeTokenId

      // Determine fee mode: percentage in staking token (LP exists) or flat VOI (no LP)
      let actualFeeAmount = fee.feeAmount
      let actualFeeTokenId = tokenId
      if (chainId === 'voi-mainnet' && activeChain.flatFeeNative) {
        await loadMarketData()
        const hasLP = findPool(tokenId, 0) || findPool(tokenId, 395614)
        if (!hasLP) {
          actualFeeAmount = activeChain.flatFeeNative.stake
          actualFeeTokenId = 0
        }
      }

      let feeTxId: string | undefined
      let feeTokenId: number | undefined

      if (isLpFarm) {
        const farmResult = await stakeFarmTokens(appId, stakeAmountMicro, activeAddress, signer, actualFeeAmount, actualFeeTokenId, fee.feeRecipient) as any
        feeTxId = farmResult.feeTxId
        feeTokenId = farmResult.feeTokenId
      } else {
        const poolResult = await stakePoolTokens(appId, stakeAmountMicro, activeAddress, signer, actualFeeAmount, actualFeeTokenId, fee.feeRecipient, chainAlgodConfig, contractVersion) as any
        feeTxId = poolResult.feeTxId
        feeTokenId = poolResult.feeTokenId
      }

      // Log staking to backend (record net amount after fee deduction)
      const feeDeducted = actualFeeTokenId === 0 ? 0 : actualFeeAmount
      const netAmount = amount - (feeDeducted / 1_000_000)
      const netAmountMicro = stakeAmountMicro - feeDeducted
      try {
        if (isLpFarm) {
          await authAxios.post('/stakingfarmingtoken/add', {
            tokens: netAmount,
            wallet: activeAddress,
            poolId: appId,
            stakedAmount: netAmount,
            earnedReward: 0,
            lastStakedAt: Date.now(),
            claimedAt: null,
            feeTxId,
            feeAssetId: feeTokenId,
          })
        } else {
          await authAxios.post('/stakingtoken/add', {
            stakeTokens: stakeTokenId,
            totalStaked: netAmountMicro,
            appId: appId,
            poolId: String(appId),
            wallet: activeAddress,
            feeTxId,
            feeAssetId: feeTokenId,
          })
        }
      } catch (e) {
        console.warn('Failed to log staking data:', e)
      }

      setLpReceived(amount)
      setStep('success')
    } catch (e: any) {
      console.error('Stake error:', e)
      const msg = e?.message || 'Staking failed'
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else {
        setError(msg)
      }
      setStep('error')
    }
  }, [inputAmount, lpStakeAmount, activeAddress, signer, appId, pool, isLpFarm, showAdvanced, stakeTokenId, refreshBalance, refreshLpBalance])

  // Execute ZAP (LP farm default mode)
  const handleExecuteZap = useCallback(async () => {
    if (!quote || !pool || !activeAddress || !signer || !signTransactions) return

    // Pre-flight: verify balance is still sufficient
    const freshBal = await refreshBalance()
    if (inputAmountMicro > freshBal) {
      toast.error('Balance changed — please adjust your amount and try again')
      return
    }

    setError('')

    try {
      await ensureAuth()

      // Step 1: Add liquidity
      setStep('adding-liquidity')

      const lpOptedIn = await isOptedIn(algod, activeAddress, quote.poolTokenId)
      if (!lpOptedIn) {
        await optInToAsset(algod, activeAddress, quote.poolTokenId, signer)
      }

      const lpBefore = await getLpTokensReceived(algod, activeAddress, quote.poolTokenId)

      const txnGroup = await buildAddLiquidityTxns(
        algod,
        pool,
        inputAssetId,
        inputAmountMicro,
        activeAddress,
        quote.minLpMicro,
      )

      await signAndSubmitAddLiquidity(algod, pool, txnGroup, signTransactions)

      const lpAfter = await getLpTokensReceived(algod, activeAddress, quote.poolTokenId)
      const lpDelta = lpAfter - lpBefore
      const lpDeltaNum = Number(lpDelta)

      if (lpDeltaNum <= 0) {
        throw new Error('No LP tokens received from add-liquidity')
      }

      setLpReceived(lpDeltaNum / Math.pow(10, inputDecimals))

      // Step 2: Stake LP tokens in farm
      setStep('staking')

      const feeConfig = await fetchFeeConfig()
      const fee = calculateFeeSimple('farmingDeposit', lpDeltaNum, feeConfig, activeChain.feeRecipient)

      // Determine fee mode for ZAP
      let zapFeeAmount = fee.feeAmount
      let zapFeeTokenId: number = quote.poolTokenId
      if (chainId === 'voi-mainnet' && activeChain.flatFeeNative) {
        await loadMarketData()
        const hasLP = findPool(quote.poolTokenId, 0) || findPool(quote.poolTokenId, 395614)
        if (!hasLP) {
          zapFeeAmount = activeChain.flatFeeNative.stake
          zapFeeTokenId = 0
        }
      }

      const zapFarmResult = await stakeFarmTokens(
        appId,
        lpDeltaNum,
        activeAddress,
        signer,
        zapFeeAmount,
        zapFeeTokenId,
        fee.feeRecipient,
      ) as any

      const netLpFloat = (lpDeltaNum - fee.feeAmount) / Math.pow(10, inputDecimals)
      try {
        await authAxios.post('/stakingfarmingtoken/add', {
          tokens: netLpFloat,
          wallet: activeAddress,
          poolId: appId,
          stakedAmount: netLpFloat,
          earnedReward: 0,
          lastStakedAt: Date.now(),
          claimedAt: null,
          feeTxId: zapFarmResult.feeTxId,
          feeAssetId: zapFarmResult.feeTokenId,
        })
      } catch (e) {
        console.warn('Failed to log staking data:', e)
      }

      setStep('success')
    } catch (e: any) {
      console.error('ZAP error:', e)
      const msg = e?.message || 'Transaction failed'

      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else if (step === 'staking') {
        setError(`Liquidity added successfully, but staking failed: ${msg}. Your LP tokens are in your wallet — you can stake them manually on the Farm page.`)
      } else {
        setError(msg)
      }

      setStep('error')
    }
  }, [quote, pool, activeAddress, signer, signTransactions, inputAssetId, inputAmountMicro, appId, refreshBalance])

  const handleClose = () => {
    setStep('input')
    setInputAmount('')
    setQuote(null)
    setQuoteError('')
    setError('')
    setLpReceived(0)
    setShowAdvanced(false)
    setLpStakeAmount('')
    setLpBalance(0n)
    setPool(null)
    setPoolFailed(false)
    onClose()
  }

  const handleSuccessClose = () => {
    handleClose()
    onSuccess()
  }

  if (!visible) return null

  // ─── Staking Pool (simple) input ────────────────────────────────────────────
  const renderSimpleInput = () => (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex justify-between mb-2">
          <p className="text-sm text-[var(--text-secondary)]">Amount</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Balance:{' '}
            {balanceLoading ? (
              <Icon icon="eos-icons:loading" width={12} className="inline" />
            ) : (
              <span
                className="cursor-pointer hover:text-[var(--text-primary)]"
                onClick={async () => { const f = await refreshBalance(); setInputAmount(await getMaxStakeAmount(f, inputDecimals)) }}
              >
                {(Number(balance) / Math.pow(10, inputDecimals)).toFixed(2)} {stakeTokenName}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5">
          <input
            type="number"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            placeholder="0.00"
            max={balance > 0n ? Number(balance) / Math.pow(10, inputDecimals) : undefined}
            className="flex-1 bg-transparent focus:outline-none text-[var(--text-primary)] text-lg"
          />
          <button
            onClick={async () => { const f = await refreshBalance(); setInputAmount(await getMaxStakeAmount(f, inputDecimals)) }}
            className="text-sm text-blue-500 font-medium hover:text-blue-400"
          >
            MAX
          </button>
        </div>
        {insufficientBalance && (
          <p className="text-red-500 text-sm mt-1">Insufficient balance</p>
        )}
      </div>

      <button
        onClick={() => {
          if (!activeAddress) { window.dispatchEvent(new Event('openConnectWallet')); return }
          handleSimpleStake()
        }}
        disabled={activeAddress ? !canStakeSimple : false}
        className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {!activeAddress ? 'Connect Wallet' : insufficientBalance ? 'Insufficient Balance' : 'Stake'}
      </button>
    </div>
  )

  // ─── LP Farm input (ZAP mode) ──────────────────────────────────────────────
  const renderLpInput = () => {
    if (poolFailed) {
      return (
        <div className="flex flex-col gap-4">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-4 text-center">
            <Icon icon="mdi:information-outline" width={28} className="text-blue-500 mx-auto mb-2" />
            <p className="text-[var(--text-primary)] font-medium mb-1">ZAP Not Available</p>
            <p className="text-sm text-[var(--text-secondary)]">
              No Tinyman V2 pool found for this pair. Single-token deposit is not supported.
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Get LP tokens from Tinyman directly, then stake them on the Farm page.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      )
    }

    return (
    <div className="flex flex-col gap-4">
      {/* Token selector */}
      <div>
        <p className="text-sm text-[var(--text-secondary)] mb-2">Deposit Token</p>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedSide('A')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              selectedSide === 'A'
                ? 'bg-red text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
            }`}
          >
            {tokenAName}
          </button>
          <button
            onClick={() => setSelectedSide('B')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              selectedSide === 'B'
                ? 'bg-red text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
            }`}
          >
            {tokenBName}
          </button>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <div className="flex justify-between mb-2">
          <p className="text-sm text-[var(--text-secondary)]">Amount</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Balance:{' '}
            {balanceLoading ? (
              <Icon icon="eos-icons:loading" width={12} className="inline" />
            ) : (
              <span
                className="cursor-pointer hover:text-[var(--text-primary)]"
                onClick={async () => { const f = await refreshBalance(); setInputAmount(await getMaxStakeAmount(f, inputDecimals)) }}
              >
                {(Number(balance) / Math.pow(10, inputDecimals)).toFixed(2)} {inputTokenName}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5">
          <input
            type="number"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            placeholder="0.00"
            max={balance > 0n ? Number(balance) / Math.pow(10, inputDecimals) : undefined}
            className="flex-1 bg-transparent focus:outline-none text-[var(--text-primary)] text-lg"
          />
          <button
            onClick={async () => { const f = await refreshBalance(); setInputAmount(await getMaxStakeAmount(f, inputDecimals)) }}
            className="text-sm text-blue-500 font-medium hover:text-blue-400"
          >
            MAX
          </button>
        </div>
        {insufficientBalance && (
          <p className="text-red-500 text-sm mt-1">Insufficient balance</p>
        )}
      </div>

      {/* Slippage */}
      <div>
        <p className="text-sm text-[var(--text-secondary)] mb-2">Slippage Tolerance</p>
        <div className="flex gap-2">
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                slippage === s
                  ? 'bg-red text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* Quote */}
      {quoteLoading && (
        <div className="flex items-center justify-center py-3 text-blue-500 text-sm gap-2">
          <Icon icon="eos-icons:loading" width={16} />
          Getting quote...
        </div>
      )}

      {quoteError && (
        <p className="text-red-500 text-sm text-center">{quoteError}</p>
      )}

      {quote && !quoteLoading && (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">You deposit</span>
            <span className="text-[var(--text-primary)]">
              {inputAmount} {inputTokenName}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Expected LP tokens</span>
            <span className="text-[var(--text-primary)]">
              ~{(Number(quote.expectedLpMicro) / Math.pow(10, inputDecimals)).toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Min LP (after slippage)</span>
            <span className="text-[var(--text-primary)]">
              {(Number(quote.minLpMicro) / Math.pow(10, inputDecimals)).toFixed(4)}
            </span>
          </div>
          {quote.priceImpact > 0.02 && (
            <div className="flex justify-between text-sm text-yellow-500">
              <span>Price impact</span>
              <span>{(quote.priceImpact * 100).toFixed(2)}%</span>
            </div>
          )}
        </div>
      )}

      {/* ZAP button */}
      <button
        onClick={() => {
          if (!activeAddress) { window.dispatchEvent(new Event('openConnectWallet')); return }
          setStep('confirm')
        }}
        disabled={activeAddress ? !canZap : false}
        className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {!activeAddress ? 'Connect Wallet' : insufficientBalance ? 'Insufficient Balance' : 'Deposit'}
      </button>

      <p className="text-xs text-[var(--text-secondary)] text-center">
        You will be asked to sign 2 transactions
      </p>

      {/* Advanced: direct LP stake */}
      <div className="mt-2 pt-3 border-t border-[var(--border-color)]">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
        >
          <Icon icon={showAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={16} />
          I already have LP tokens
        </button>
        {showAdvanced && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-[var(--text-secondary)]">LP Token Amount</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Balance:{' '}
                  {lpBalanceLoading ? (
                    <Icon icon="eos-icons:loading" width={12} className="inline" />
                  ) : (
                    <span
                      className="cursor-pointer hover:text-[var(--text-primary)]"
                      onClick={async () => { const f = await refreshLpBalance(); setLpStakeAmount(await getMaxStakeAmount(f, 6)) }}
                    >
                      {(Number(lpBalance) / 1e6).toFixed(4)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5">
                <input
                  type="number"
                  value={lpStakeAmount}
                  onChange={(e) => setLpStakeAmount(e.target.value)}
                  placeholder="0.00"
                  max={lpBalance > 0n ? Number(lpBalance) / 1e6 : undefined}
                  className="flex-1 bg-transparent focus:outline-none text-[var(--text-primary)] text-lg"
                />
                <button
                  onClick={async () => { const f = await refreshLpBalance(); setLpStakeAmount(await getMaxStakeAmount(f, 6)) }}
                  className="text-sm text-blue-500 font-medium hover:text-blue-400"
                >
                  MAX
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                if (!activeAddress) { window.dispatchEvent(new Event('openConnectWallet')); return }
                handleSimpleStake()
              }}
              disabled={activeAddress ? (!lpStakeAmount || parseFloat(lpStakeAmount) <= 0) : false}
              className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!activeAddress ? 'Connect Wallet' : 'Stake LP Tokens'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={step === 'input' || step === 'success' || step === 'error' ? handleClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[440px] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:arrow-down-circle" className="text-blue-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Stake in {displayName}</h3>
          </div>
          {(step === 'input' || step === 'success' || step === 'error') && (
            <button onClick={handleClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Loading pool (LP farm only) */}
          {isLpFarm && poolLoading && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Icon icon="eos-icons:loading" width={32} className="text-blue-500" />
              <p className="text-[var(--text-secondary)]">Finding Tinyman pool...</p>
            </div>
          )}

          {/* Input step */}
          {step === 'input' && !(isLpFarm && poolLoading) && (
            isLpFarm ? renderLpInput() : renderSimpleInput()
          )}

          {/* Confirm step (LP farm ZAP only) */}
          {step === 'confirm' && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <Icon icon="mdi:arrow-down-circle" width={48} className="text-blue-500 mx-auto" />
                <h4 className="text-[var(--text-primary)] font-bold text-lg mt-2">Confirm Deposit</h4>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-3">
                <p className="text-sm text-[var(--text-secondary)]">This will:</p>
                <ol className="list-decimal list-inside text-sm text-[var(--text-primary)] space-y-2">
                  <li>
                    Deposit {inputAmount} {inputTokenName} into the {pairName} Tinyman pool
                  </li>
                  <li>Stake the received LP tokens in this farm</li>
                </ol>
                {quote && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Expected: ~{(Number(quote.expectedLpMicro) / Math.pow(10, inputDecimals)).toFixed(4)} LP tokens
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 py-3 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleExecuteZap}
                  className="flex-1 py-3 rounded-lg font-bold text-white linearGradient transition-colors"
                >
                  Confirm Deposit
                </button>
              </div>
            </div>
          )}

          {/* Progress steps */}
          {(step === 'adding-liquidity' || step === 'staking') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-blue-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {isLpFarm && !showAdvanced && step === 'adding-liquidity'
                    ? 'Step 1/2: Adding Liquidity'
                    : isLpFarm && !showAdvanced && step === 'staking'
                    ? 'Step 2/2: Staking LP Tokens'
                    : 'Staking...'}
                </p>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  Please confirm in your wallet
                </p>
              </div>

              {isLpFarm && !showAdvanced && (
                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step === 'adding-liquidity' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'
                  }`}>
                    {step === 'adding-liquidity' ? '1' : <Icon icon="mdi:check" width={18} />}
                  </div>
                  <div className={`w-12 h-0.5 ${step === 'staking' ? 'bg-green-500' : 'bg-gray-600'}`} />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step === 'staking' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-400'
                  }`}>
                    2
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:check-circle" width={64} className="text-green-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Stake Successful!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  {lpReceived.toFixed(4)} {isLpFarm ? 'LP tokens' : stakeTokenName} staked
                </p>
              </div>
              <button
                onClick={handleSuccessClose}
                className="mt-2 px-8 py-3 rounded-lg font-bold text-white linearGradient transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:alert-circle" width={64} className="text-red-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Stake Failed</h4>
                <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-[350px]">{error}</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setStep('input'); setError('') }}
                  className="px-6 py-2.5 rounded-lg font-medium text-white linearGradient transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StakeModal
