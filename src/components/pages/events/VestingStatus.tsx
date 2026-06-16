import { Icon } from '@iconify/react'
import { useCallback, useEffect, useState } from 'react'
import { fetchVestingStatus } from '../../../services/eventService'
import type { VestingStatus as VestingStatusData } from '../../../services/eventService'
import VestingClaimModal from './VestingClaimModal'
import { useChain } from '../../../context/ChainContext'

interface VestingStatusProps {
  eventId: string
  wallet: string
}

// FRY 2.0 ASA 2485314946 is 6-decimal. All vesting events currently use FRY.
const FRY_DECIMALS = 6

const fry = (micro: number) =>
  (micro / 10 ** FRY_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })

const Stat: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div>
    <p className="text-text_clr text-xs mb-1">{label}</p>
    <p
      className={`font-apex font-bold text-lg ${
        highlight ? 'text-green' : 'text-[var(--text-heading)]'
      }`}
    >
      {value}
    </p>
  </div>
)

const VestingStatus: React.FC<VestingStatusProps> = ({ eventId, wallet }) => {
  const { activeChain } = useChain()
  const [status, setStatus] = useState<VestingStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const refetch = useCallback(() => {
    setLoading(true)
    fetchVestingStatus(eventId, wallet)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [eventId, wallet])

  useEffect(() => {
    refetch()
  }, [refetch])

  if (loading) {
    return (
      <div className="mt-4 bg-[var(--bg-card)] rounded-[18px] p-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)] animate-pulse">
        <div className="h-6 bg-[var(--bg-secondary)] rounded w-1/3 mb-4" />
        <div className="h-2 bg-[var(--bg-secondary)] rounded w-full mb-4" />
        <div className="h-10 bg-[var(--bg-secondary)] rounded w-1/2" />
      </div>
    )
  }

  // Non-vesting events: invisible
  if (!status || status.enabled === false) {
    return null
  }

  // Enabled but wallet has no allocation
  if (status.qualified === false) {
    return (
      <div className="mt-4 bg-[var(--bg-card)] rounded-[18px] p-4 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="flex items-center gap-2">
          <Icon
            icon="mdi:information-outline"
            width={18}
            className="text-text_clr"
          />
          <span className="text-text_clr text-sm">
            Not eligible for vesting rewards
          </span>
        </div>
      </div>
    )
  }

  // Qualified: full card
  return (
    <>
      <div className="mt-4 bg-[var(--bg-card)] rounded-[18px] p-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[var(--text-heading)] font-apex font-bold uppercase">
            Vesting
          </h4>
          {status.isFullyVested && (
            <span className="text-xs text-green bg-green/10 px-2 py-1 rounded">
              Fully Vested
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-text_clr mb-1">
            <span>{status.percentVested.toFixed(1)}% unlocked</span>
            <span>{status.percentClaimed.toFixed(1)}% claimed</span>
          </div>
          <div className="w-full h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-green/40"
              style={{ width: `${Math.min(100, status.percentVested)}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-green"
              style={{ width: `${Math.min(100, status.percentClaimed)}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Stat label="Total Allocation" value={fry(status.totalAllocation)} />
          <Stat label="Vested" value={fry(status.vestedAmount)} />
          <Stat label="Claimed" value={fry(status.claimedAmount)} />
          <Stat
            label="Claimable"
            value={fry(status.claimableAmount)}
            highlight
          />
        </div>

        {/* Metadata line */}
        <p className="text-xs text-text_clr mb-4">
          {status.vestingModel === 'linear' ? 'Linear' : 'Cliff + Linear'}{' '}
          vesting · {status.durationDays} days · Ends{' '}
          {new Date(status.vestingEndDate).toLocaleDateString()}
        </p>

        {/* Last claim (if any) */}
        {status.lastClaimTxId && status.lastClaimAt && (
          <p className="text-xs text-text_clr mb-4">
            Last claimed{' '}
            {new Date(status.lastClaimAt).toLocaleDateString()} ·{' '}
            <a
              href={`${activeChain.explorerBaseUrl}/tx/${status.lastClaimTxId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-green"
            >
              view tx
            </a>
          </p>
        )}

        {/* Claim button */}
        <button
          onClick={() => setModalOpen(true)}
          disabled={status.claimableAmount <= 0}
          className="w-full py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status.claimableAmount > 0
            ? `Claim ${fry(status.claimableAmount)} FRY`
            : 'Nothing to claim yet'}
        </button>
      </div>

      <VestingClaimModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        eventId={eventId}
        claimableAmount={status.claimableAmount}
        onSuccess={() => {
          setModalOpen(false)
          refetch()
        }}
      />
    </>
  )
}

export default VestingStatus
