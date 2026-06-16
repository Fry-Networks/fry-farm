import React, { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { toast } from 'react-toastify'
import { unstakeTokens as unstakeFarmTokens, getAlgodClient, getUserData as getFarmUserData } from '../../farming_func'
import { unstakeTokens as unstakePoolTokens, checkPoolRewardBalance, estimateStakingReward, getUserData as getPoolUserData } from '../../staking_func'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import { useAuth } from '../../hooks/useAuth'
import { useChain } from '../../context/ChainContext'
import { authAxios } from '../../services/apiClient'
import {
  getPool,
  getAssetBalance,
  signAndSubmitAddLiquidity,
  getRemoveLiquidityQuote,
  buildRemoveLiquidityTxns,
} from '../../services/ZapService'
import type { V2PoolInfo } from '@tinymanorg/tinyman-js-sdk'

interface WithdrawModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  appId: number
  stakeTokenId: number
  stakeTokenName: string
  userStake: number
  isLpFarm: boolean
  stakeTokenBId?: number
  pairName?: string
  rewardTokenId?: number
  contractVersion?: number
}

type WithdrawStep = 'input' | 'confirm' | 'unstaking' | 'removing-liquidity' | 'success' | 'error'

const WithdrawModal: React.FC<WithdrawModalProps> = ({
  visible,
  onClose,
  onSuccess,
  appId,
  stakeTokenId,
  stakeTokenName,
  userStake,
  isLpFarm,
  stakeTokenBId,
  pairName,
  rewardTokenId,
  contractVersion,
}) => {
  const { activeAddress, signer: multiSigner, signTransactions: multiSignTxns } = useMultiChainWallet()
  const signer = multiSigner!
  const signTransactions = multiSignTxns!
  const { ensureAuth } = useAuth()
  const { activeChain } = useChain()

  // Build chain-aware algod config (same pattern as StakeModal)
  const chainAlgodConfig = 'algodServer' in (activeChain?.connection as any || {})
    ? { server: (activeChain.connection as any).algodServer, port: (activeChain.connection as any).algodPort, token: (activeChain.connection as any).algodToken }
    : undefined

  const [step, setStep] = useState<WithdrawStep>('input')
  const [inputAmount, setInputAmount] = useState('')
  const [error, setError] = useState('')
  const [withdrawnAmount, setWithdrawnAmount] = useState(0)

  // Reverse ZAP state (LP farm advanced)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedSide, setSelectedSide] = useState<'A' | 'B'>('A')
  const [slippage, setSlippage] = useState(0.5)
  const [pool, setPool] = useState<V2PoolInfo | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [quoteOutput, setQuoteOutput] = useState<{ expectedOutputMicro: bigint; priceImpact: number } | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [poolFailed, setPoolFailed] = useState(false)
  const [fetchedStake, setFetchedStake] = useState<number | null>(null)
  const [stakeLoading, setStakeLoading] = useState(false)
  const effectiveStake = fetchedStake ?? userStake

  const displayName = isLpFarm ? (pairName || stakeTokenName) : stakeTokenName
  const tokenNames = isLpFarm ? (pairName || '').split('/') : []
  const tokenAName = tokenNames[0]?.trim() || 'Token A'
  const tokenBName = tokenNames[1]?.trim() || 'Token B'
  const outputAssetId = selectedSide === 'A' ? stakeTokenId : stakeTokenBId!
  const outputTokenName = selectedSide === 'A' ? tokenAName : tokenBName
  const inputDecimals = 6

  const algod = getAlgodClient()

  const inputAmountMicro = (() => {
    const v = parseFloat(inputAmount)
    if (isNaN(v) || v <= 0) return 0n
    return BigInt(Math.floor(v * Math.pow(10, inputDecimals)))
  })()

  const exceedsStake = parseFloat(inputAmount) > 0 && parseFloat(inputAmount) > effectiveStake
  const canWithdraw = inputAmountMicro > 0n && !exceedsStake && !!activeAddress && !!signer

  // Fetch pool info when advanced mode toggled (LP farm only)
  useEffect(() => {
    if (!visible || !isLpFarm || !stakeTokenBId || !showAdvanced) return
    if (pool) return // already fetched
    setPoolLoading(true)
    getPool(algod, stakeTokenId, stakeTokenBId)
      .then(setPool)
      .catch((e) => {
        console.error('Pool fetch error:', e)
        setPoolFailed(true)
        setShowAdvanced(false)
      })
      .finally(() => setPoolLoading(false))
  }, [visible, stakeTokenId, stakeTokenBId, isLpFarm, showAdvanced])

  // Fetch reverse-ZAP quote
  useEffect(() => {
    if (!isLpFarm || !showAdvanced || !pool || !inputAmount) {
      setQuoteOutput(null)
      setQuoteError('')
      return
    }

    const amount = parseFloat(inputAmount)
    if (isNaN(amount) || amount <= 0) {
      setQuoteOutput(null)
      return
    }

    const amountMicro = BigInt(Math.floor(amount * Math.pow(10, inputDecimals)))
    if (amountMicro <= 0n) {
      setQuoteOutput(null)
      return
    }

    setQuoteLoading(true)
    setQuoteError('')

    try {
      const q = getRemoveLiquidityQuote(
        pool,
        amountMicro,
        outputAssetId,
        { assetIn: inputDecimals, assetOut: inputDecimals },
      )
      setQuoteOutput(q)
    } catch (e: any) {
      console.error('Remove liquidity quote error:', e)
      setQuoteError(e.message || 'Could not get quote')
      setQuoteOutput(null)
    } finally {
      setQuoteLoading(false)
    }
  }, [pool, inputAmount, outputAssetId, isLpFarm, showAdvanced])

  // Self-healing: fetch on-chain stake if parent passed 0
  useEffect(() => {
    if (!visible || userStake > 0 || !appId || !activeAddress) return
    if (fetchedStake !== null) return // already fetched this session

    let cancelled = false
    setStakeLoading(true)

    const fetch = async () => {
      try {
        const data = isLpFarm
          ? await getFarmUserData(appId, activeAddress)
          : await getPoolUserData(appId, activeAddress)
        if (!cancelled && data) {
          setFetchedStake(Number(data.stakedAmount || 0) / 1_000_000)
        }
      } catch (e) {
        console.warn('WithdrawModal: self-heal stake fetch failed', e)
      } finally {
        if (!cancelled) setStakeLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [visible, userStake, appId, activeAddress, isLpFarm, fetchedStake])

  // Simple withdraw (staking pool or LP farm default)
  const handleSimpleWithdraw = useCallback(async () => {
    const amount = parseFloat(inputAmount)
    if (!activeAddress || !signer || isNaN(amount) || amount <= 0) return

    setStep('unstaking')
    const withdrawAmountMicro = Math.floor(amount * 1_000_000)

    try {
      // Pre-flight check: verify contract has enough reward tokens for staking pools
      if (!isLpFarm && rewardTokenId) {
        try {
          const rewardBalance = await checkPoolRewardBalance(appId, rewardTokenId, chainAlgodConfig)
          if (rewardBalance <= 0n) {
            setError('This pool\'s rewards are depleted. Withdrawals are temporarily unavailable — contact the pool creator.')
            setStep('error')
            return
          }
        } catch (e) {
          console.warn('Could not check pool reward balance:', e)
        }
      }

      await ensureAuth()
      const feeType = isLpFarm ? 'farmingWithdraw' : 'stakingWithdraw'
      const feeConfig = await fetchFeeConfig()
      const fee = calculateFeeSimple(feeType, withdrawAmountMicro, feeConfig, activeChain?.feeRecipient)

      if (isLpFarm) {
        const farmResult = await unstakeFarmTokens(appId, withdrawAmountMicro, activeAddress, signer, fee.feeAmount, stakeTokenId, fee.feeRecipient) as any

        try {
          await authAxios.post('/farmingwithdraw/add', {
            amount: amount,
            userWallet: activeAddress,
            poolId: String(appId),
            farmingTokenId: String(appId),
            feeTxId: farmResult.feeTxId,
            feeAssetId: farmResult.feeTokenId,
          })
        } catch (e) {
          console.warn('Failed to log withdraw data:', e)
        }
      } else {
        const poolResult = await unstakePoolTokens(appId, withdrawAmountMicro, activeAddress, signer, fee.feeAmount, stakeTokenId, fee.feeRecipient, chainAlgodConfig, contractVersion) as any

        try {
          await authAxios.post('/withdraw/add', {
            tokens: amount,
            wallet: activeAddress,
            poolId: appId,
            appId: appId,
            feeTxId: poolResult.feeTxId,
            feeAssetId: poolResult.feeTokenId,
          })
        } catch (e) {
          console.warn('Failed to log withdraw data:', e)
        }
      }

      setWithdrawnAmount(amount)
      setStep('success')
    } catch (e: any) {
      console.error('Withdraw error:', e)
      const msg = e?.message || 'Withdrawal failed'
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else {
        setError(msg)
      }
      setStep('error')
    }
  }, [inputAmount, activeAddress, signer, appId, isLpFarm, stakeTokenId])

  // Reverse ZAP withdraw (LP farm advanced)
  const handleReverseZapWithdraw = useCallback(async () => {
    const amount = parseFloat(inputAmount)
    if (!activeAddress || !signer || !pool || !quoteOutput || isNaN(amount) || amount <= 0) return

    setError('')
    const withdrawAmountMicro = Math.floor(amount * 1_000_000)

    try {
      await ensureAuth()

      // Step 1: Unstake LP from farm
      setStep('unstaking')
      const feeConfig = await fetchFeeConfig()
      const fee = calculateFeeSimple('farmingWithdraw', withdrawAmountMicro, feeConfig, activeChain?.feeRecipient)

      const zapFarmResult = await unstakeFarmTokens(appId, withdrawAmountMicro, activeAddress, signer, fee.feeAmount, stakeTokenId, fee.feeRecipient)

      try {
        await authAxios.post('/farmingwithdraw/add', {
          amount: amount,
          userWallet: activeAddress,
          poolId: String(appId),
          farmingTokenId: String(appId),
          feeTxId: zapFarmResult.feeTxId,
          feeAssetId: zapFarmResult.feeTokenId,
        })
      } catch (e) {
        console.warn('Failed to log withdraw data:', e)
      }

      // Step 2: Remove liquidity to single token
      setStep('removing-liquidity')

      const minOutput = BigInt(Math.floor(Number(quoteOutput.expectedOutputMicro) * (1 - slippage / 100)))

      const txnGroup = await buildRemoveLiquidityTxns(
        algod,
        pool,
        BigInt(withdrawAmountMicro),
        outputAssetId,
        activeAddress,
        minOutput,
        slippage / 100,
      )

      await signAndSubmitAddLiquidity(algod, pool, txnGroup, signTransactions)

      const outputAmount = Number(quoteOutput.expectedOutputMicro) / Math.pow(10, inputDecimals)
      setWithdrawnAmount(outputAmount)
      setStep('success')
    } catch (e: any) {
      console.error('Reverse ZAP error:', e)
      const msg = e?.message || 'Transaction failed'

      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else if (step === 'removing-liquidity') {
        setError(`LP tokens withdrawn from farm successfully, but remove-liquidity failed: ${msg}. Your LP tokens are in your wallet.`)
      } else {
        setError(msg)
      }

      setStep('error')
    }
  }, [inputAmount, activeAddress, signer, appId, pool, quoteOutput, outputAssetId, slippage])

  const handleClose = () => {
    setStep('input')
    setInputAmount('')
    setError('')
    setWithdrawnAmount(0)
    setShowAdvanced(false)
    setQuoteOutput(null)
    setQuoteError('')
    setPool(null)
    setPoolFailed(false)
    setFetchedStake(null)
    onClose()
  }

  const handleSuccessClose = () => {
    handleClose()
    onSuccess()
  }

  if (!visible) return null

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
            <Icon icon="mdi:arrow-up-circle" className="text-orange-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Withdraw from {displayName}</h3>
          </div>
          {(step === 'input' || step === 'success' || step === 'error') && (
            <button onClick={handleClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Input step */}
          {step === 'input' && (
            <div className="flex flex-col gap-4">
              {/* Amount input */}
              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-sm text-[var(--text-secondary)]">Amount</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Your Stake:{' '}
                    <span
                      className="cursor-pointer hover:text-[var(--text-primary)]"
                      onClick={() => setInputAmount(effectiveStake.toString())}
                    >
                      {stakeLoading ? 'Loading...' : `${effectiveStake.toFixed(2)} ${isLpFarm ? 'LP' : stakeTokenName}`}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5">
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent focus:outline-none text-[var(--text-primary)] text-lg"
                  />
                  <button
                    onClick={() => setInputAmount(effectiveStake.toString())}
                    disabled={stakeLoading}
                    className="text-sm text-blue-500 font-medium hover:text-blue-400 disabled:opacity-40"
                  >
                    MAX
                  </button>
                </div>
                {exceedsStake && (
                  <p className="text-red-500 text-sm mt-1">Amount exceeds your stake</p>
                )}
              </div>

              {/* Reverse ZAP options (LP farm only) */}
              {isLpFarm && stakeTokenBId && !poolFailed && (
                <div className="pt-3 border-t border-[var(--border-color)]">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    <Icon icon={showAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={16} />
                    Withdraw to single token
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 flex flex-col gap-3">
                      {/* Output token selector */}
                      <div>
                        <p className="text-sm text-[var(--text-secondary)] mb-2">Receive Token</p>
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
                      {poolLoading && (
                        <div className="flex items-center justify-center py-3 text-blue-500 text-sm gap-2">
                          <Icon icon="eos-icons:loading" width={16} />
                          Finding pool...
                        </div>
                      )}

                      {quoteLoading && (
                        <div className="flex items-center justify-center py-3 text-blue-500 text-sm gap-2">
                          <Icon icon="eos-icons:loading" width={16} />
                          Getting quote...
                        </div>
                      )}

                      {quoteError && (
                        <p className="text-red-500 text-sm text-center">{quoteError}</p>
                      )}

                      {quoteOutput && !quoteLoading && (
                        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)]">You withdraw</span>
                            <span className="text-[var(--text-primary)]">
                              {inputAmount} LP
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)]">Expected output</span>
                            <span className="text-[var(--text-primary)]">
                              ~{(Number(quoteOutput.expectedOutputMicro) / Math.pow(10, inputDecimals)).toFixed(4)} {outputTokenName}
                            </span>
                          </div>
                          {quoteOutput.priceImpact > 0.02 && (
                            <div className="flex justify-between text-sm text-yellow-500">
                              <span>Price impact</span>
                              <span>{(quoteOutput.priceImpact * 100).toFixed(2)}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-[var(--text-secondary)] text-center">
                        You will be asked to sign 2 transactions
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Withdraw button */}
              <button
                onClick={() => {
                  if (!activeAddress) { window.dispatchEvent(new Event('openConnectWallet')); return }
                  ;(isLpFarm && showAdvanced ? handleReverseZapWithdraw : handleSimpleWithdraw)()
                }}
                disabled={activeAddress ? (stakeLoading || !canWithdraw || (isLpFarm && showAdvanced && (!pool || !quoteOutput))) : false}
                className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!activeAddress ? 'Connect Wallet' : exceedsStake ? 'Exceeds Stake' : 'Withdraw'}
              </button>
            </div>
          )}

          {/* Progress steps */}
          {(step === 'unstaking' || step === 'removing-liquidity') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-blue-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {isLpFarm && showAdvanced && step === 'unstaking'
                    ? 'Step 1/2: Withdrawing LP'
                    : isLpFarm && showAdvanced && step === 'removing-liquidity'
                    ? 'Step 2/2: Removing Liquidity'
                    : 'Withdrawing...'}
                </p>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  Please confirm in your wallet
                </p>
              </div>

              {isLpFarm && showAdvanced && (
                <div className="flex items-center gap-3 mt-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step === 'unstaking' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'
                  }`}>
                    {step === 'unstaking' ? '1' : <Icon icon="mdi:check" width={18} />}
                  </div>
                  <div className={`w-12 h-0.5 ${step === 'removing-liquidity' ? 'bg-green-500' : 'bg-gray-600'}`} />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step === 'removing-liquidity' ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-400'
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
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Withdrawal Successful!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  {withdrawnAmount.toFixed(4)} {isLpFarm && showAdvanced ? outputTokenName : isLpFarm ? 'LP tokens' : stakeTokenName} withdrawn
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
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Withdrawal Failed</h4>
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

export default WithdrawModal
