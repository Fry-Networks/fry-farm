import React, { useState } from 'react'
import { Icon } from '@iconify/react'
import { claimVesting } from '../../../services/eventService'
import { useAuth } from '../../../hooks/useAuth'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useChain } from '../../../context/ChainContext'

interface VestingClaimModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  claimableAmount: number // microFRY, for display
  onSuccess: () => void
}

type ClaimStep = 'confirm' | 'submitting' | 'success' | 'error'

const FRY_DECIMALS = 6
const fry = (micro: number) =>
  (micro / 10 ** FRY_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })

const VestingClaimModal: React.FC<VestingClaimModalProps> = ({
  isOpen,
  onClose,
  eventId,
  claimableAmount,
  onSuccess,
}) => {
  const [step, setStep] = useState<ClaimStep>('confirm')
  const [error, setError] = useState('')
  const [txId, setTxId] = useState('')
  const [claimedAmount, setClaimedAmount] = useState(0)

  const { ensureAuth } = useAuth()
  const { activeChain } = useChain()
  const { signer } = useMultiChainWallet()

  const handleClaim = async () => {
    if (!signer) {
      setError('Wallet not ready — signer unavailable. Wait a moment and retry.')
      setStep('error')
      return
    }
    setStep('submitting')
    setError('')
    try {
      try {
        await ensureAuth()
      } catch (err: any) {
        setError(err?.message || 'Please sign in to claim (wallet signature required).')
        setStep('error')
        return
      }
      const result = await claimVesting(eventId)
      setTxId(result.txId)
      setClaimedAmount(result.claimedAmount)
      setStep('success')
      onSuccess()
    } catch (e: any) {
      const msg =
        e?.response?.data?.message || e?.message || 'Claim failed'
      setError(msg)
      setStep('error')
    }
  }

  const handleClose = () => {
    setStep('confirm')
    setError('')
    setTxId('')
    setClaimedAmount(0)
    onClose()
  }

  const handleSuccessClose = () => {
    setStep('confirm')
    setError('')
    setTxId('')
    setClaimedAmount(0)
    onSuccess()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={
          step === 'confirm' || step === 'success' || step === 'error'
            ? handleClose
            : undefined
        }
      />

      <div className="relative bg-[var(--bg-card)] rounded-[16px] w-full max-w-[440px] mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:trophy" className="text-green-500" width={22} />
            <h3 className="text-[var(--text-primary)] font-bold text-lg">
              Claim Vesting
            </h3>
          </div>
          {(step === 'confirm' || step === 'success' || step === 'error') && (
            <button
              onClick={handleClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Icon icon="mdi:close" width={22} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* Confirm step */}
          {step === 'confirm' && (
            <div className="flex flex-col gap-4">
              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col gap-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">
                    Ready to claim
                  </span>
                  <span className="text-[var(--text-primary)] font-bold">
                    {fry(claimableAmount)} FRY
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                <Icon
                  icon="mdi:information"
                  width={16}
                  className="text-green-500 shrink-0"
                />
                <p className="text-xs text-green-500">
                  This will send vested FRY directly to your wallet.
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
                  className="flex-1 py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors"
                >
                  Claim FRY
                </button>
              </div>
            </div>
          )}

          {/* Submitting */}
          {step === 'submitting' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon
                icon="eos-icons:loading"
                width={48}
                className="text-green-500"
              />
              <div className="text-center">
                <p className="text-[var(--text-primary)] font-bold text-lg">
                  Processing Claim...
                </p>
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  Backend is sending your FRY
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Icon
                icon="mdi:check-circle"
                width={64}
                className="text-green-500"
              />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">
                  Claim Successful!
                </h4>
                <p className="text-[var(--text-secondary)] mt-2">
                  {fry(claimedAmount)} FRY sent to your wallet.
                </p>
                {txId && (
                  <a
                    href={`${activeChain.explorerBaseUrl}/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 text-sm mt-1 inline-flex items-center gap-1 hover:underline"
                  >
                    View transaction{' '}
                    <Icon icon="mdi:open-in-new" width={14} />
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
              <Icon
                icon="mdi:alert-circle"
                width={64}
                className="text-red-500"
              />
              <div className="text-center">
                <h4 className="text-[var(--text-primary)] font-bold text-xl">
                  Claim Failed
                </h4>
                <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-[350px]">
                  {error}
                </p>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => {
                    setStep('confirm')
                    setError('')
                  }}
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

export default VestingClaimModal
