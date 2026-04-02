import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { fetchUserPoints } from '../../../services/eventService'
import type { UserPoints } from '../../../services/eventService'
import { getChallengeConfig } from '../../../utils/challengeUtils'

interface UserStatsProps {
  eventId: string
  wallet: string
}

const UserStats: React.FC<UserStatsProps> = ({ eventId, wallet }) => {
  const [points, setPoints] = useState<UserPoints | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchUserPoints(eventId, wallet)
      .then(setPoints)
      .catch(() => setPoints(null))
      .finally(() => setLoading(false))
  }, [eventId, wallet])

  if (loading) {
    return (
      <div className="bg-[var(--bg-card)] rounded-[18px] p-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)] animate-pulse">
        <div className="h-6 bg-[var(--bg-secondary)] rounded w-1/3 mb-4" />
        <div className="h-10 bg-[var(--bg-secondary)] rounded w-1/4" />
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[18px] p-6 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
      <h4 className="text-[var(--text-heading)] font-apex font-bold uppercase mb-4">Your Stats</h4>

      <div className="flex flex-wrap gap-6 mb-6">
        <div className="text-center">
          <p className="text-text_clr text-sm mb-1">Rank</p>
          <p className="text-[var(--text-heading)] text-3xl font-bold font-apex">
            {points?.rank ? `#${points.rank}` : '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-text_clr text-sm mb-1">Total Points</p>
          <p className="text-[var(--text-heading)] text-3xl font-bold font-apex">
            {points?.totalPoints ? Math.floor(points.totalPoints).toLocaleString() : '0'}
          </p>
        </div>
      </div>

      {points?.challengePoints && points.challengePoints.length > 0 && (
        <div>
          <p className="text-text_clr text-sm mb-3">Breakdown</p>
          <div className="space-y-2">
            {points.challengePoints.map((cp) => {
              const config = getChallengeConfig(cp.challengeType)
              return (
                <div key={cp.challengeId} className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-[8px] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Icon icon={config.icon} width={16} color="#DE0308" />
                    <span className="text-[var(--text-heading)] text-sm">{config.name}</span>
                  </div>
                  <span className="text-[var(--text-heading)] font-medium text-sm">
                    {Math.floor(cp.points).toLocaleString()} pts
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {points?.airdropStatus === 'sent' && points.airdropAmount && (
        <div className="mt-4 p-3 bg-green/10 rounded-[8px]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:check-circle" width={18} className="text-green" />
            <span className="text-green font-medium">
              Airdrop received: {points.airdropAmount.toLocaleString()} FRY
            </span>
          </div>
          {points.airdropTxId && (
            <a
              href={`https://allo.info/tx/${points.airdropTxId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text_clr underline mt-1 inline-block"
            >
              View transaction
            </a>
          )}
        </div>
      )}

      {points?.airdropStatus === 'failed' && (
        <div className="mt-4 p-3 bg-red/10 rounded-[8px]">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:alert-circle" width={18} className="text-darkRed" />
            <span className="text-darkRed font-medium">Airdrop failed — contact support</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserStats
