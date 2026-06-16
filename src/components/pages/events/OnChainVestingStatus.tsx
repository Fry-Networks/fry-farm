import { Icon } from '@iconify/react'
import { useCallback, useEffect, useState } from 'react'
import { getVestingInfo, getParticipantInfo } from '../../../vesting_func'
import OnChainVestingClaimModal from './OnChainVestingClaimModal'

interface OnChainVestingStatusProps {
  appId: number
  wallet: string
}

type VestingInfoData = Awaited<ReturnType<typeof getVestingInfo>>
type ParticipantInfoData = NonNullable<Awaited<ReturnType<typeof getParticipantInfo>>>

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

const OnChainVestingStatus: React.FC<OnChainVestingStatusProps> = ({ appId, wallet }) => {
  const [vestingInfo, setVestingInfo] = useState<VestingInfoData | null>(null)
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showClaimModal, setShowClaimModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [vInfo, pInfo] = await Promise.all([
        getVestingInfo(appId),
        getParticipantInfo(appId, wallet),
      ])
      setVestingInfo(vInfo)
      setParticipantInfo(pInfo)
    } catch (e: any) {
      setError(e?.message || 'Failed to load vesting data')
      setVestingInfo(null)
      setParticipantInfo(null)
    } finally {
      setLoading(false)
    }
  }, [appId, wallet])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="mt-4 bg-[var(--bg-card)] rounded-[18px] p-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)] animate-pulse">
        <div className="h-6 bg-[var(--bg-secondary)] rounded w-1/3 mb-4" />
        <div className="h-2 bg-[var(--bg-secondary)] rounded w-full mb-4" />
        <div className="h-10 bg-[var(--bg-secondary)] rounded w-1/2" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 bg-[var(--bg-card)] rounded-[18px] p-4 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="flex items-center gap-2 mb-3">
          <Icon icon="mdi:alert-circle" width={18} className="text-darkRed" />
          <span className="text-darkRed text-sm">{error}</span>
        </div>
        <button
          onClick={fetchData}
          className="text-sm text-text_clr underline hover:text-green"
        >
          Retry
        </button>
      </div>
    )
  }

  // Non-participant (strict null check)
  if (participantInfo === null || vestingInfo === null) {
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

  const percentClaimed =
    participantInfo.allocation > 0
      ? Math.min(100, (participantInfo.claimed / participantInfo.allocation) * 100)
      : 0
  const percentVested =
    participantInfo.allocation > 0
      ? Math.min(100, (participantInfo.vested / participantInfo.allocation) * 100)
      : 0
  const isFullyVested =
    participantInfo.vested >= participantInfo.allocation && participantInfo.allocation > 0

  const startDate = new Date(vestingInfo.vestingStart * 1000)
  const endDate = new Date(vestingInfo.vestingEnd * 1000)
  const cliffSeconds = vestingInfo.cliffPeriod
  const cliffDays = cliffSeconds > 0 ? Math.round(cliffSeconds / 86400) : 0
  const durationDays = Math.round(
    (vestingInfo.vestingEnd - vestingInfo.vestingStart) / 86400,
  )

  return (
    <>
      <div className="mt-4 bg-[var(--bg-card)] rounded-[18px] p-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[var(--text-heading)] font-apex font-bold uppercase">
            Vesting (On-Chain)
          </h4>
          {isFullyVested && (
            <span className="text-xs text-green bg-green/10 px-2 py-1 rounded">
              Fully Vested
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-text_clr mb-1">
            <span>{percentVested.toFixed(1)}% unlocked</span>
            <span>{percentClaimed.toFixed(1)}% claimed</span>
          </div>
          <div className="w-full h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-green/40"
              style={{ width: `${percentVested}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-green"
              style={{ width: `${percentClaimed}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Stat label="Total Allocation" value={fry(participantInfo.allocation)} />
          <Stat label="Vested" value={fry(participantInfo.vested)} />
          <Stat label="Claimed" value={fry(participantInfo.claimed)} />
          <Stat
            label="Claimable"
            value={fry(participantInfo.claimable)}
            highlight
          />
        </div>

        {/* Metadata line */}
        <p className="text-xs text-text_clr mb-4">
          {cliffDays > 0 ? 'Cliff + Linear' : 'Linear'} vesting · {durationDays} days
          {cliffDays > 0 && ` · ${cliffDays}d cliff`} · Ends{' '}
          {endDate.toLocaleDateString()}
        </p>

        {/* Claim button */}
        <button
          onClick={() => setShowClaimModal(true)}
          disabled={participantInfo.claimable <= 0}
          className="w-full py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {participantInfo.claimable > 0
            ? `Claim ${fry(participantInfo.claimable)} FRY`
            : 'Nothing to claim yet'}
        </button>
      </div>

      {showClaimModal && (
        <OnChainVestingClaimModal
          appId={appId}
          wallet={wallet}
          claimableAmount={participantInfo.claimable}
          rewardTokenId={vestingInfo.rewardToken}
          onClose={() => setShowClaimModal(false)}
          onSuccess={() => {
            setShowClaimModal(false)
            fetchData()
          }}
        />
      )}
    </>
  )
}

export default OnChainVestingStatus
