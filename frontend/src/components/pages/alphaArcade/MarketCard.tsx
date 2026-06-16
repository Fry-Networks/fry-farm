import React from 'react'
import { Icon } from '@iconify/react'
import type { AlphaArcadeMarket, AlphaArcadePool } from '../../../types/alphaArcade'
import { usePreferences } from '../../../contexts/PreferencesContext'
import { friendlyApr, friendlyVolume, friendlyProbability } from '../../../utils/grandmaLabels'

interface MarketCardProps {
  market: AlphaArcadeMarket
  onDeposit: (market: AlphaArcadeMarket) => void
  pool?: AlphaArcadePool
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onDeposit, pool }) => {
  const { isSimpleMode } = usePreferences()
  const yesPercent = Math.round(market.yesProb ?? 50)
  const noPercent = 100 - yesPercent
  const isResolved = market.endTs > 0 && market.endTs * 1000 < Date.now()

  const resolutionDate = market.endTs
    ? new Date(market.endTs * 1000)
    : null
  const now = Date.now()
  const msRemaining = resolutionDate ? resolutionDate.getTime() - now : Infinity
  const hoursRemaining = msRemaining / 3600000

  const resolvingIn6h = hoursRemaining > 0 && hoursRemaining < 6
  const resolvingIn48h = hoursRemaining > 0 && hoursRemaining < 48
  const depositsDisabled = isResolved || !market.yesAssetId || resolvingIn6h

  const formatVolume = (v: number) => {
    if (!v) return '$0'
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }

  const getUrgencyBadge = () => {
    if (isResolved) {
      return (
        <span className="absolute top-2 right-2 bg-blue-500/90 text-white text-xs px-2 py-0.5 rounded-full">
          Resolved
        </span>
      )
    }
    if (resolvingIn6h) {
      return (
        <span className="absolute top-2 right-2 bg-red-500/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
          <Icon icon="mdi:alert" width={12} />
          Resolving in {Math.max(0, hoursRemaining).toFixed(0)}h
        </span>
      )
    }
    if (resolvingIn48h) {
      return (
        <span className="absolute top-2 right-2 bg-yellow-500/90 text-black text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
          <Icon icon="mdi:clock-alert" width={12} />
          Resolving soon
        </span>
      )
    }
    return null
  }

  const getButtonLabel = () => {
    if (isResolved) return 'Market Resolved'
    if (resolvingIn6h) return 'Deposits Disabled — Resolving Soon'
    return 'Provide Liquidity'
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[16px] overflow-hidden shadow-[0px_4px_24.2px_0px_var(--shadow-color)] flex flex-col">
      {/* Image */}
      <div className="relative h-[140px] bg-[var(--bg-secondary)] overflow-hidden">
        {market.image ? (
          <img
            src={market.image}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon icon="mdi:chart-timeline-variant" width={48} className="text-[var(--text-secondary)] opacity-30" />
          </div>
        )}
        {/* Category badge */}
        {market.categories?.[0] && (
          <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
            {market.categories[0]}
          </span>
        )}
        {/* Resolution urgency badge */}
        {getUrgencyBadge()}
        {/* Reward market badge — show when no urgency badge */}
        {!getUrgencyBadge() && pool?.aprDisplay?.isRewardMarket && (
          <span className="absolute top-2 right-2 bg-amber-500/90 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <Icon icon="mdi:star" width={12} />
            Reward Market
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Question */}
        <p className="text-[var(--text-primary)] font-bold text-sm leading-tight line-clamp-2 min-h-[40px]">
          {market.title || `Market #${market.marketAppId}`}
        </p>

        {/* Probability bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            {isSimpleMode ? (
              <span className="text-[var(--text-primary)] font-medium w-full text-center">{friendlyProbability(yesPercent)}</span>
            ) : (
              <>
                <span className="text-green-500 font-medium">Yes {yesPercent}%</span>
                <span className="text-red-500 font-medium">No {noPercent}%</span>
              </>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-[var(--bg-secondary)]">
            <div
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${yesPercent}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${noPercent}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        {isSimpleMode ? (
          <div className="text-xs text-[var(--text-secondary)]">
            <span>{friendlyVolume(market.twentyFourHrVolume)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-xs text-[var(--text-secondary)]">
            <span>24h: {formatVolume(market.twentyFourHrVolume)}</span>
            <span>Vol: {formatVolume(market.volume)}</span>
          </div>
        )}

        {/* APR display */}
        {pool?.aprDisplay?.isRewardMarket ? (
          isSimpleMode ? (
            <div>
              <p className="text-xs font-medium text-green-500">{friendlyApr(pool.aprDisplay.combinedApr)}</p>
              <p className="text-[10px] text-amber-500 font-medium">Bonus earnings available</p>
            </div>
          ) : (
            <div className="text-xs flex flex-col gap-0.5">
              <p className="text-green-500 font-medium">
                Spread: {pool.aprDisplay.spreadApr != null ? `${pool.aprDisplay.spreadApr.toFixed(1)}%` : 'N/A'}
                {' + '}Rewards: {pool.aprDisplay.rewardApr != null ? `${pool.aprDisplay.rewardApr.toFixed(1)}%` : 'N/A'}
              </p>
              {pool.aprDisplay.combinedApr != null && (
                <p className="text-green-400 font-medium">Total Est. APR: {pool.aprDisplay.combinedApr.toFixed(1)}%</p>
              )}
            </div>
          )
        ) : (
          <div>
            <p className="text-xs font-medium text-green-500">
              {isSimpleMode
                ? friendlyApr(pool?.aprDisplay?.spreadApr)
                : pool?.aprDisplay?.spreadApr != null
                  ? `Est. APR: ${pool.aprDisplay.spreadApr.toFixed(1)}%`
                  : 'APR: N/A'}
            </p>
            {!isSimpleMode && (
              <p className="text-[10px] text-[var(--text-secondary)]">Spread profit only — no LP rewards</p>
            )}
          </div>
        )}

        {/* Reward qualification (on card face, reward markets only) */}
        {!isSimpleMode && pool?.aprDisplay?.isRewardMarket && pool?.aprMeta && (
          <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded px-2 py-1.5">
            <p>Max spread: {(pool.aprMeta.rewardsSpreadDistance / 10000).toFixed(1)}%</p>
            <p>Min order: {(pool.aprMeta.rewardsMinContracts / 1e6).toFixed(0)} contracts</p>
            <p className="text-[10px] mt-0.5 opacity-70">Must maintain orders within spread range to qualify</p>
          </div>
        )}

        {/* Resolution date */}
        {resolutionDate && (
          <p className="text-xs text-[var(--text-secondary)]">
            Resolves: {resolutionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}

        {/* Deposit button */}
        <button
          onClick={() => onDeposit(market)}
          disabled={depositsDisabled}
          className="mt-auto w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors linearGradient disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {getButtonLabel()}
        </button>
      </div>
    </div>
  )
}

export default MarketCard
