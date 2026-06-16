import React, { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import algosdk from 'algosdk'
import { useAuth } from '../../../hooks/useAuth'
import { buildClaim, recordClaim } from '../../../services/alphaArcadeApi'
import { getAlgodClient } from '../../../farming_func'
import type { AlphaArcadePosition } from '../../../types/alphaArcade'

interface ClaimModalProps {
  visible: boolean
  position: AlphaArcadePosition | null
  marketQuestion?: string
  onClose: () => void
  onSuccess: () => void
}

type ClaimStep = 'confirm' | 'signing' | 'submitting' | 'recording' | 'success' | 'error'

const ClaimModal: React.FC<ClaimModalProps> = ({ visible, position, marketQuestion, onClose, onSuccess }) => {
  const { activeAddress, signTransactions } = useWallet()
  const { ensureAuth } = useAuth()

  const [step, setStep] = useState<ClaimStep>('confirm')
  const [error, setError] = useState('')
  const [txId, setTxId] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const algod = getAlgodClient()

  const depositedUsdc = position ? (position.usdcDeposited / 1_000_000).toFixed(2) : '0'

  const handleClaim = useCallback(async () => {
    if (!activeAddress || !position || !signTransactions || isSubmitting) return
    setIsSubmitting(true)

    setError('')

    try {
      // Step 1: Authenticate
      setStep('signing')
      await ensureAuth()

      // Step 2: Build unsigned transactions
      const result = await buildClaim({
        wallet: activeAddress,
        poolId: position.poolId,
      })

      if (result.outcome) setOutcome(result.outcome)

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
          console.warn('Fee transaction failed (claim succeeded):', feeErr)
        }
      }

      // Step 5: Record
      setStep('recording')
      await recordClaim({
        wallet: activeAddress,
        poolId: position.poolId,
        positionId: result.positionId || position._id,
        amountClaimed: position.usdcDeposited,
        txId: confirmedTxId,
      })

      setStep('success')
    } catch (e: any) {
      console.error('Claim error:', e)
      const msg = e?.message || 'Claim failed'
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
    setOutcome(null)
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
            <Icon icon="mdi:trophy" className="text-green-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Claim Winnings</h3>
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
                  <span className="text-[var(--text-secondary)]">Original Deposit</span>
                  <span className="text-[var(--text-primary)]">{depositedUsdc} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Status</span>
                  <span className="text-blue-400">Market Resolved</span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                <Icon icon="mdi:information" width={16} className="text-green-500 shrink-0" />
                <p className="text-xs text-green-500">
                  This will redeem your winning outcome tokens for USDC.
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
                  onClick={handleClaim}
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : 'Claim Winnings'}
                </button>
              </div>
            </div>
          )}

          {/* Progress */}
          {(step === 'signing' || step === 'submitting' || step === 'recording') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-green-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {step === 'signing' && 'Building & Signing...'}
                  {step === 'submitting' && 'Submitting Transaction...'}
                  {step === 'recording' && 'Recording Claim...'}
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
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Claim Successful!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  Your winnings have been redeemed for USDC.
                </p>
                {txId && (
                  <a
                    href={`https://allo.info/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 text-sm mt-1 inline-flex items-center gap-1 hover:underline"
                  >
                    View transaction <Icon icon="mdi:open-in-new" width={14} />
                  </a>
                )}
              </div>
              <button
                onClick={handleSuccessClose}
                className="mt-2 px-8 py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors"
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
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Claim Failed</h4>
                <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-[350px]">{error}</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setStep('confirm'); setError('') }}
                  className="px-6 py-2.5 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
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

export default ClaimModal
