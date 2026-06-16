import React, { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import { toast } from 'react-toastify'
import algosdk from 'algosdk'
import { useAuth } from '../../../hooks/useAuth'
import { buildDeposit, recordDeposit } from '../../../services/alphaArcadeApi'
import { getAlgodClient } from '../../../farming_func'
import type { AlphaArcadeMarket, AlphaArcadePool } from '../../../types/alphaArcade'

interface DepositModalProps {
  visible: boolean
  market: AlphaArcadeMarket | null
  pool?: AlphaArcadePool
  onClose: () => void
  onSuccess: () => void
}

type DepositStep = 'input' | 'confirm' | 'signing' | 'submitting' | 'recording' | 'success' | 'error'

const DepositModal: React.FC<DepositModalProps> = ({ visible, market, pool, onClose, onSuccess }) => {
  const { activeAddress, signTransactions } = useWallet()
  const { ensureAuth } = useAuth()

  const [step, setStep] = useState<DepositStep>('input')
  const [inputAmount, setInputAmount] = useState('')
  const [error, setError] = useState('')
  const [txId, setTxId] = useState('')
  const [feeInfo, setFeeInfo] = useState<{ fee: number; netAmount: number; feePercent: number } | null>(null)

  const algod = getAlgodClient()

  const usdcAmountMicro = (() => {
    const v = parseFloat(inputAmount)
    if (isNaN(v) || v <= 0) return 0
    return Math.floor(v * 1_000_000)
  })()

  const canDeposit = usdcAmountMicro >= 1_000_000 && !!activeAddress

  const yesPercent = market ? Math.round(market.yesProb ?? 50) : 50

  const resolutionDate = market?.endTs
    ? new Date(market.endTs * 1000)
    : null
  const resolvingSoon = resolutionDate
    ? resolutionDate.getTime() - Date.now() < 24 * 60 * 60 * 1000 && resolutionDate.getTime() > Date.now()
    : false

  const handleDeposit = useCallback(async () => {
    if (!activeAddress || !market || !signTransactions || usdcAmountMicro < 1_000_000) return

    setError('')

    try {
      // Step 1: Authenticate
      setStep('signing')
      await ensureAuth()

      // Step 2: Build unsigned transactions from backend
      const result = await buildDeposit({
        wallet: activeAddress,
        marketAppId: market.marketAppId,
        usdcAmount: usdcAmountMicro,
      })

      // Capture fee info for display
      if (result.fee !== undefined) {
        setFeeInfo({ fee: result.fee, netAmount: result.netAmount || 0, feePercent: result.feePercent || 0 })
      }

      // Step 3: Decode and sign split group
      const txnBytes = result.unsignedTxns.map((b64: string) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        return algosdk.decodeUnsignedTransaction(bytes)
      })

      const encodedUnsigned = txnBytes.map(txn => algosdk.encodeUnsignedTransaction(txn))
      const signed = await signTransactions(encodedUnsigned)

      // Step 4: Submit split group
      setStep('submitting')
      const { txId: confirmedTxId } = await algod.sendRawTransaction(signed).do()
      await algosdk.waitForConfirmation(algod, confirmedTxId, 4)
      setTxId(confirmedTxId)

      // Step 4b: Submit fee transaction separately (best-effort)
      if (result.feeTxn) {
        try {
          const feeBytes = Uint8Array.from(atob(result.feeTxn), c => c.charCodeAt(0))
          const feeTxnDecoded = algosdk.decodeUnsignedTransaction(feeBytes)
          const feeEncoded = [algosdk.encodeUnsignedTransaction(feeTxnDecoded)]
          const feeSigned = await signTransactions(feeEncoded)
          await algod.sendRawTransaction(feeSigned).do()
        } catch (feeErr) {
          console.warn('Fee transaction failed (deposit succeeded):', feeErr)
        }
      }

      // Step 5: Record in backend
      setStep('recording')
      await recordDeposit({
        wallet: activeAddress,
        marketAppId: market.marketAppId,
        poolId: result.poolId,
        usdcDeposited: usdcAmountMicro,
        yesEscrowAppIds: [],
        noEscrowAppIds: [],
        spreadUsed: result.pool?.spreadBps ?? 50,
        entryMidPrice: (market.yesProb ?? 50) / 100,
        txId: confirmedTxId,
        depositFee: result.fee || 0,
      })

      setStep('success')
    } catch (e: any) {
      console.error('Deposit error:', e)
      const msg = e?.message || 'Deposit failed'
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else {
        setError(msg)
      }
      setStep('error')
    }
  }, [activeAddress, market, signTransactions, usdcAmountMicro, ensureAuth, algod])

  const handleClose = () => {
    setStep('input')
    setInputAmount('')
    setError('')
    setTxId('')
    setFeeInfo(null)
    onClose()
  }

  const handleSuccessClose = () => {
    handleClose()
    onSuccess()
  }

  if (!visible || !market) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={step === 'input' || step === 'confirm' || step === 'success' || step === 'error' ? handleClose : undefined}
      />

      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[440px] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:cash-plus" className="text-green-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Provide Liquidity</h3>
          </div>
          {(step === 'input' || step === 'confirm' || step === 'success' || step === 'error') && (
            <button onClick={handleClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* Input step */}
          {step === 'input' && (
            <div className="flex flex-col gap-4">
              {/* Market info */}
              <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
                <p className="text-[var(--text-primary)] font-bold text-sm leading-tight">
                  {market.title || `Market #${market.marketAppId}`}
                </p>
                <div className="flex justify-between text-xs mt-2">
                  <span className="text-green-500">Yes {yesPercent}%</span>
                  <span className="text-red-500">No {100 - yesPercent}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex bg-[var(--bg-card)] mt-1">
                  <div className="bg-green-500" style={{ width: `${yesPercent}%` }} />
                  <div className="bg-red-500" style={{ width: `${100 - yesPercent}%` }} />
                </div>
              </div>

              {/* Resolution warning */}
              {resolvingSoon && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                  <Icon icon="mdi:clock-alert" width={18} className="text-yellow-500 shrink-0" />
                  <p className="text-xs text-yellow-500">
                    This market resolves within 24 hours. Your liquidity may be locked through resolution.
                  </p>
                </div>
              )}

              {/* Amount input */}
              <div>
                <p className="text-sm text-[var(--text-secondary)] mb-2">USDC Amount</p>
                <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[10px] px-3 py-2.5">
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    placeholder="0.00"
                    min="1"
                    step="0.01"
                    className="flex-1 bg-transparent focus:outline-none text-[var(--text-primary)] text-lg"
                  />
                  <span className="text-sm text-[var(--text-secondary)] font-medium">USDC</span>
                </div>
                {usdcAmountMicro > 0 && usdcAmountMicro < 1_000_000 && (
                  <p className="text-red-500 text-sm mt-1">Minimum deposit is 1 USDC</p>
                )}
              </div>

              {/* Spread info */}
              <div className="bg-[var(--bg-secondary)] rounded-lg p-3 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Spread</span>
                  <span className="text-[var(--text-primary)]">0.5%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Strategy</span>
                  <span className="text-[var(--text-primary)]">Split + Limit Orders</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Platform Fee</span>
                  <span className="text-[var(--text-primary)]">0.5%</span>
                </div>
              </div>

              {/* Reward market qualification info */}
              {pool?.aprDisplay?.isRewardMarket && pool?.aprMeta && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  <p className="text-xs font-medium text-amber-500 flex items-center gap-1 mb-1">
                    <Icon icon="mdi:star" width={14} />
                    Reward Market — additional LP rewards available
                  </p>
                  <div className="text-xs text-[var(--text-secondary)] flex flex-col gap-0.5">
                    <p>Required spread: {(pool.aprMeta.rewardsSpreadDistance / 10000).toFixed(1)}%</p>
                    <p>Min order: {(pool.aprMeta.rewardsMinContracts / 1e6).toFixed(0)} contracts</p>
                    <p>Current rate: ~${(pool.aprMeta.lastRewardAmount / 1e6).toFixed(2)}/hour</p>
                  </div>
                  <p className="text-[10px] text-amber-500/70 mt-1">
                    Rewards not guaranteed if orders fall outside required spread range
                  </p>
                </div>
              )}

              {/* Confirm button */}
              <button
                onClick={() => setStep('confirm')}
                disabled={!canDeposit}
                className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!activeAddress ? 'Connect Wallet' : !canDeposit ? 'Enter Amount (min 1 USDC)' : 'Review Deposit'}
              </button>
            </div>
          )}

          {/* Confirm step */}
          {step === 'confirm' && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <Icon icon="mdi:cash-plus" width={48} className="text-green-500 mx-auto" />
                <h4 className="text-[var(--text-primary)] font-bold text-lg mt-2">Confirm Deposit</h4>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Market</span>
                  <span className="text-[var(--text-primary)] text-right max-w-[200px] truncate">
                    {market.title}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Amount</span>
                  <span className="text-[var(--text-primary)]">{inputAmount} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Platform Fee ({feeInfo?.feePercent ?? 0.5}%)</span>
                  <span className="text-red-400">-${feeInfo ? (feeInfo.fee / 1_000_000).toFixed(2) : (usdcAmountMicro * 0.005 / 1_000_000).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Net Deposit</span>
                  <span className="text-green-500">${feeInfo ? (feeInfo.netAmount / 1_000_000).toFixed(2) : (usdcAmountMicro * 0.995 / 1_000_000).toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Spread</span>
                  <span className="text-[var(--text-primary)]">0.5%</span>
                </div>
                {resolutionDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Resolves</span>
                    <span className="text-[var(--text-primary)]">
                      {resolutionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  USDC will be split into YES/NO shares and placed as limit orders around the mid-price.
                </p>
              </div>

              {resolvingSoon && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                  <Icon icon="mdi:alert" width={16} className="text-yellow-500 shrink-0" />
                  <p className="text-xs text-yellow-500">Market resolves within 24 hours!</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 py-3 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleDeposit}
                  className="flex-1 py-3 rounded-lg font-bold text-white linearGradient transition-colors"
                >
                  Confirm Deposit
                </button>
              </div>
            </div>
          )}

          {/* Progress steps */}
          {(step === 'signing' || step === 'submitting' || step === 'recording') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-blue-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {step === 'signing' && 'Building & Signing...'}
                  {step === 'submitting' && 'Submitting Transaction...'}
                  {step === 'recording' && 'Recording Position...'}
                </p>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  {step === 'signing' && 'Please confirm in your wallet'}
                  {step === 'submitting' && 'Waiting for confirmation'}
                  {step === 'recording' && 'Almost done'}
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:check-circle" width={64} className="text-green-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Deposit Successful!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  {inputAmount} USDC deposited as liquidity
                </p>
                {txId && (
                  <a
                    href={`https://allo.info/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 text-sm mt-1 inline-flex items-center gap-1 hover:underline"
                  >
                    View transaction <Icon icon="mdi:open-in-new" width={14} />
                  </a>
                )}
              </div>
              <button
                onClick={handleSuccessClose}
                className="mt-2 px-8 py-3 rounded-lg font-bold text-white linearGradient transition-colors"
              >
                View Positions
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:alert-circle" width={64} className="text-red-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Deposit Failed</h4>
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

export default DepositModal
