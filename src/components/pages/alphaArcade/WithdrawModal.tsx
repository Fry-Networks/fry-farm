import React, { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import algosdk from 'algosdk'
import { useAuth } from '../../../hooks/useAuth'
import { buildWithdraw, recordWithdraw } from '../../../services/alphaArcadeApi'
import { getAlgodClient } from '../../../farming_func'
import type { AlphaArcadePosition } from '../../../types/alphaArcade'

interface WithdrawModalProps {
  visible: boolean
  position: AlphaArcadePosition | null
  marketQuestion?: string
  onClose: () => void
  onSuccess: () => void
}

type WithdrawStep = 'confirm' | 'signing' | 'submitting' | 'recording' | 'success' | 'error'

const WithdrawModal: React.FC<WithdrawModalProps> = ({ visible, position, marketQuestion, onClose, onSuccess }) => {
  const { activeAddress, signTransactions } = useWallet()
  const { ensureAuth } = useAuth()

  const [step, setStep] = useState<WithdrawStep>('confirm')
  const [error, setError] = useState('')
  const [txId, setTxId] = useState('')
  const [feeInfo, setFeeInfo] = useState<{ fee: number; feePercent: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const algod = getAlgodClient()

  const depositedUsdc = position ? (position.usdcDeposited / 1_000_000).toFixed(2) : '0'
  const escrowCount = position
    ? (position.yesEscrowAppIds?.length || 0) + (position.noEscrowAppIds?.length || 0)
    : 0

  const handleWithdraw = useCallback(async () => {
    if (!activeAddress || !position || !signTransactions || isSubmitting) return
    setIsSubmitting(true)

    setError('')

    try {
      // Step 1: Authenticate
      setStep('signing')
      await ensureAuth()

      // Step 2: Build unsigned transactions
      const result = await buildWithdraw({
        wallet: activeAddress,
        poolId: position.poolId,
      })

      // Capture fee info
      if (result.fee !== undefined) {
        setFeeInfo({ fee: result.fee, feePercent: result.feePercent || 0 })
      }

      // Step 3: Decode and sign
      const txnBytes = result.unsignedTxns.map((b64: string) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        return algosdk.decodeUnsignedTransaction(bytes)
      })

      const encodedUnsigned = txnBytes.map(txn => algosdk.encodeUnsignedTransaction(txn))
      const signed = await signTransactions(encodedUnsigned)

      // Step 4: Submit
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
          console.warn('Fee transaction failed (withdraw succeeded):', feeErr)
        }
      }

      // Step 5: Record
      setStep('recording')
      await recordWithdraw({
        wallet: activeAddress,
        poolId: position.poolId,
        positionId: position._id,
        usdcRecovered: 0,
        remainingYesTokens: 0,
        remainingNoTokens: 0,
        txId: confirmedTxId,
        withdrawFee: result.fee || 0,
      })

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
    } finally {
      setIsSubmitting(false)
    }
  }, [activeAddress, position, signTransactions, isSubmitting, ensureAuth, algod])

  const handleClose = () => {
    setStep('confirm')
    setError('')
    setTxId('')
    setFeeInfo(null)
    setIsSubmitting(false)
    onClose()
  }

  const handleSuccessClose = () => {
    handleClose()
    onSuccess()
  }

  if (!visible || !position) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={step === 'confirm' || step === 'success' || step === 'error' ? handleClose : undefined}
      />

      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[440px] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:cash-minus" className="text-red-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Withdraw Liquidity</h3>
          </div>
          {(step === 'confirm' || step === 'success' || step === 'error') && (
            <button onClick={handleClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* Confirm step */}
          {step === 'confirm' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-3">
                <p className="text-[var(--text-primary)] font-bold text-sm">
                  {marketQuestion || `Market #${position.marketAppId}`}
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Deposited</span>
                  <span className="text-[var(--text-primary)]">{depositedUsdc} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Open Orders</span>
                  <span className="text-[var(--text-primary)]">{escrowCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Entry Price</span>
                  <span className="text-[var(--text-primary)]">
                    {position.entryMidPrice ? `${(position.entryMidPrice * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Platform Fee (0.25%)</span>
                  {/* TODO: pull withdraw fee rate from fee config instead of hardcoding 0.0025 */}
                  <span className="text-red-400">
                    ${((position.usdcDeposited - (position.feesPaid?.depositFee || 0)) * 0.0025 / 1_000_000).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Based on your deposited amount
                </p>
              </div>

              <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                <Icon icon="mdi:alert" width={16} className="text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-500">
                  Withdrawing will cancel all open orders and merge remaining shares back to USDC where possible.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-lg font-medium text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-lg font-bold text-white linearGradient transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Withdraw'}
                </button>
              </div>
            </div>
          )}

          {/* Progress */}
          {(step === 'signing' || step === 'submitting' || step === 'recording') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-blue-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {step === 'signing' && 'Building & Signing...'}
                  {step === 'submitting' && 'Submitting Transaction...'}
                  {step === 'recording' && 'Recording Withdrawal...'}
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
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Withdrawal Successful!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  Your liquidity position has been closed.
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
                  onClick={() => { setStep('confirm'); setError('') }}
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
