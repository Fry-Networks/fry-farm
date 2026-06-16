import React from 'react'
import { Icon } from '@iconify/react'
import type { AlphaArcadePosition } from '../../../types/alphaArcade'
import { usePreferences } from '../../../contexts/PreferencesContext'

interface PositionCardProps {
  position: AlphaArcadePosition
  marketQuestion?: string
  resolutionTime?: number
  isRewardMarket?: boolean
  onWithdraw: (position: AlphaArcadePosition) => void
  onClaim?: (position: AlphaArcadePosition) => void
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  active: { label: 'Active', color: 'bg-green-500', icon: 'mdi:check-circle' },
  pending_withdrawal: { label: 'Withdraw Now', color: 'bg-orange-500', icon: 'mdi:alert' },
  withdrawing: { label: 'Withdrawing', color: 'bg-yellow-500', icon: 'mdi:clock' },
  withdrawn: { label: 'Withdrawn', color: 'bg-gray-500', icon: 'mdi:logout' },
  auto_withdrawn: { label: 'Auto Withdrawn', color: 'bg-gray-500', icon: 'mdi:logout' },
  resolved: { label: 'Resolved', color: 'bg-blue-500', icon: 'mdi:flag-checkered' },
  claimed: { label: 'Claimed', color: 'bg-green-600', icon: 'mdi:check-decagram' },
}

const PositionCard: React.FC<PositionCardProps> = ({ position, marketQuestion, resolutionTime, isRewardMarket, onWithdraw, onClaim }) => {
  const { isSimpleMode } = usePreferences()
  const status = statusConfig[position.status] || statusConfig.active
  const depositedUsdc = (position.usdcDeposited / 1_000_000).toFixed(2)
  const recoveredUsdc = (position.usdcRecovered / 1_000_000).toFixed(2)
  const entryPrice = position.entryMidPrice ? (position.entryMidPrice * 100).toFixed(1) : '—'
  const escrowCount = (position.yesEscrowAppIds?.length || 0) + (position.noEscrowAppIds?.length || 0)

  // Compute resolution urgency
  const hoursUntilResolution = resolutionTime && resolutionTime > 0
    ? (resolutionTime * 1000 - Date.now()) / 3600000
    : null

  const isActive = position.status === 'active'
  const isPendingWithdrawal = position.status === 'pending_withdrawal'
  const canWithdraw = isActive || isPendingWithdrawal

  return (
    <div className="bg-[var(--bg-card)] rounded-[16px] p-5 shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[var(--text-primary)] font-bold text-sm leading-tight flex-1">
          {marketQuestion || `Market #${position.marketAppId}`}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {isRewardMarket && (
            <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <Icon icon="mdi:star" width={12} />
              Reward
            </span>
          )}
          <span className={`${status.color} text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1`}>
            <Icon icon={status.icon} width={12} />
            {status.label}
          </span>
        </div>
      </div>

      {/* Pending withdrawal banner */}
      {isPendingWithdrawal && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 mb-3 text-orange-400 text-xs flex items-center gap-2">
          <Icon icon="mdi:alert" width={16} />
          Withdraw now — market resolving soon
        </div>
      )}

      {/* Active + resolving soon warning */}
      {isActive && hoursUntilResolution !== null && hoursUntilResolution > 0 && hoursUntilResolution < 24 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3 text-red-400 text-xs flex items-center gap-2">
          <Icon icon="mdi:clock-alert" width={16} />
          Market resolves in {Math.ceil(hoursUntilResolution)} hours — withdraw to protect funds
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <p className="text-[var(--text-secondary)] text-xs">{isSimpleMode ? 'Your Investment' : 'Deposited'}</p>
          <p className="text-[var(--text-primary)] font-medium">{depositedUsdc} USDC</p>
        </div>
        {!isSimpleMode && (
          <div>
            <p className="text-[var(--text-secondary)] text-xs">Entry Mid-Price</p>
            <p className="text-[var(--text-primary)] font-medium">{entryPrice}%</p>
          </div>
        )}
        {!isSimpleMode && (
          <div>
            <p className="text-[var(--text-secondary)] text-xs">Spread</p>
            <p className="text-[var(--text-primary)] font-medium">{((position.spreadUsed || 50) / 100).toFixed(2)}%</p>
          </div>
        )}
        <div>
          <p className="text-[var(--text-secondary)] text-xs">{isSimpleMode ? 'Active Trades' : 'Open Orders'}</p>
          <p className="text-[var(--text-primary)] font-medium">{escrowCount}</p>
        </div>
      </div>

      {/* Withdrawn stats */}
      {(position.status === 'withdrawn' || position.status === 'auto_withdrawn' || position.status === 'resolved') && (
        <div className="border-t border-[var(--border-color)] pt-3 mb-4">
          <div className={`grid ${isSimpleMode ? 'grid-cols-1' : 'grid-cols-3'} gap-3 text-sm`}>
            <div>
              <p className="text-[var(--text-secondary)] text-xs">{isSimpleMode ? 'Money Returned' : 'Recovered'}</p>
              <p className="text-[var(--text-primary)] font-medium">{recoveredUsdc} USDC</p>
            </div>
            {!isSimpleMode && (
              <div>
                <p className="text-[var(--text-secondary)] text-xs">YES Remaining</p>
                <p className="text-[var(--text-primary)] font-medium">{position.remainingYesTokens || 0}</p>
              </div>
            )}
            {!isSimpleMode && (
              <div>
                <p className="text-[var(--text-secondary)] text-xs">NO Remaining</p>
                <p className="text-[var(--text-primary)] font-medium">{position.remainingNoTokens || 0}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Withdraw button for active/pending_withdrawal positions */}
      {canWithdraw && (
        <button
          onClick={() => onWithdraw(position)}
          className="w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors linearGradient"
        >
          Withdraw
        </button>
      )}

      {/* Claim button for resolved positions */}
      {position.status === 'resolved' && onClaim && (
        <button
          onClick={() => onClaim(position)}
          className="w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors bg-green-600 hover:bg-green-700"
        >
          Claim Winnings
        </button>
      )}

      {/* Date */}
      <p className="text-xs text-[var(--text-secondary)] mt-2">
        Opened: {new Date(position.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

export default PositionCard
