import React, { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import algosdk from 'algosdk'
import { toast } from 'react-toastify'
import { useAuth } from '../../../hooks/useAuth'
import { useChain } from '../../../context/ChainContext'
import {
  buildCommunityFunding,
  confirmCommunityFunding,
  type FryEvent,
  type FundingResult,
} from '../../../services/eventService'

interface FundingModalProps {
  visible: boolean
  event: FryEvent | null
  onClose: () => void
  onSuccess: () => void
}

type FundingStep = 'review' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error'

const FundingModal: React.FC<FundingModalProps> = ({ visible, event, onClose, onSuccess }) => {
  const { activeAddress, signTransactions } = useMultiChainWallet()
  const { ensureAuth } = useAuth()
  const { activeChain, getAlgodClient } = useChain()

  const [step, setStep] = useState<FundingStep>('review')
  const [error, setError] = useState('')
  const [txId, setTxId] = useState('')

  const algod = getAlgodClient()

  const decimals = event?.rewardAsaDecimals || 6
  const divisor = Math.pow(10, decimals)
  const grossAmount = event ? (event.rewardPool || 0) + (event.fundingFeeAmount || 0) : 0
  const feeAmount = event?.fundingFeeAmount || 0
  const netAmount = event?.rewardPool || 0

  const handleFund = useCallback(async () => {
    if (!activeAddress || !event || !signTransactions) return

    setError('')

    try {
      setStep('signing')
      await ensureAuth()

      const result: FundingResult = await buildCommunityFunding(event._id)

      // Decode and sign
      const txnBytes = result.unsignedTxns.map((b64: string) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        return algosdk.decodeUnsignedTransaction(bytes)
      })

      const encodedUnsigned = txnBytes.map(txn => algosdk.encodeUnsignedTransaction(txn))
      const signed = await signTransactions(encodedUnsigned)

      // Submit
      setStep('submitting')
      const { txId: confirmedTxId } = await algod.sendRawTransaction(signed).do()
      await algosdk.waitForConfirmation(algod, confirmedTxId, 4)
      setTxId(confirmedTxId)

      // Fee txn (best-effort)
      let feeTxId = ''
      if (result.feeTxn) {
        try {
          const feeBytes = Uint8Array.from(atob(result.feeTxn), c => c.charCodeAt(0))
          const feeTxnDecoded = algosdk.decodeUnsignedTransaction(feeBytes)
          const feeEncoded = [algosdk.encodeUnsignedTransaction(feeTxnDecoded)]
          const feeSigned = await signTransactions(feeEncoded)
          const { txId: fTxId } = await algod.sendRawTransaction(feeSigned).do()
          feeTxId = fTxId
        } catch (feeErr) {
          console.warn('Fee transaction failed (funding succeeded):', feeErr)
        }
      }

      // Confirm with backend
      setStep('confirming')
      await confirmCommunityFunding(event._id, confirmedTxId, feeTxId)

      setStep('success')
    } catch (e: any) {
      console.error('Funding error:', e)
      const msg = e?.message || 'Funding failed'
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else {
        setError(msg)
      }
      setStep('error')
    }
  }, [activeAddress, event, signTransactions, ensureAuth, algod])

  const handleClose = () => {
    setStep('review')
    setError('')
    setTxId('')
    onClose()
  }

  const handleSuccessClose = () => {
    handleClose()
    onSuccess()
  }

  if (!visible || !event) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={step === 'review' || step === 'success' || step === 'error' ? handleClose : undefined}
      />

      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[440px] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:safe" className="text-green-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">Fund Event</h3>
          </div>
          {(step === 'review' || step === 'success' || step === 'error') && (
            <button onClick={handleClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* Review step */}
          {step === 'review' && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <Icon icon="mdi:safe" width={48} className="text-green-500 mx-auto" />
                <h4 className="text-[var(--text-primary)] font-bold text-lg mt-2">Fund Escrow</h4>
                <p className="text-[var(--text-secondary)] text-sm mt-1">{event.name}</p>
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Reward Token</span>
                  <span className="text-[var(--text-primary)]">
                    {event.rewardAsaName || `ASA #${event.rewardAsaId}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Total Deposit</span>
                  <span className="text-[var(--text-primary)]">
                    {(grossAmount / divisor).toLocaleString()} {event.rewardAsaName}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Platform Fee (2%)</span>
                  <span className="text-red-400">
                    -{(feeAmount / divisor).toLocaleString()} {event.rewardAsaName}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-[var(--text-secondary)]">Reward Pool</span>
                  <span className="text-green-500">
                    {(netAmount / divisor).toLocaleString()} {event.rewardAsaName}
                  </span>
                </div>
              </div>

              <button
                onClick={handleFund}
                className="w-full py-3 rounded-lg font-bold text-white transition-colors linearGradient"
              >
                Fund Event
              </button>
            </div>
          )}

          {/* Progress steps */}
          {(step === 'signing' || step === 'submitting' || step === 'confirming') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="eos-icons:loading" width={48} className="text-blue-500" />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  {step === 'signing' && 'Building & Signing...'}
                  {step === 'submitting' && 'Submitting Transaction...'}
                  {step === 'confirming' && 'Confirming Escrow...'}
                </p>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  {step === 'signing' && 'Please confirm in your wallet'}
                  {step === 'submitting' && 'Waiting for on-chain confirmation'}
                  {step === 'confirming' && 'Almost done'}
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon icon="mdi:check-circle" width={64} className="text-green-500" />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Event Funded!</h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  Your event is now scheduled and will activate on the start date.
                </p>
                {txId && (
                  <a
                    href={`${activeChain.explorerBaseUrl}/tx/${txId}`}
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
                <h4 className="text-[var(--text-primary)] font-bold text-xl">Funding Failed</h4>
                <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-[350px]">{error}</p>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setStep('review'); setError('') }}
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

export default FundingModal
