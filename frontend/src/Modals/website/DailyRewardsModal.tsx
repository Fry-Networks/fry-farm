import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import { Modal, Spin } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../hooks/useAuth'
import { getFingerprint } from '../../services/fingerprintService'
import { usePreferences } from '../../contexts/PreferencesContext'
import {
  ClaimResult,
  fetchLeaderboard,
  fetchRewardsConfig,
  fetchRewardsStatus,
  claimReward,
  fetchVaultStatus,
  claimVaultReward,
  LeaderboardEntry,
  RewardsConfig,
  RewardsStatus,
  VaultStatus,
} from '../../services/rewardsApi'

interface DailyRewardsModalProps {
  open: boolean
  onClose: () => void
}

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const TRUST_TIERS: { label: string; color: string; icon: string }[] = [
  { label: 'Newcomer', color: '#888', icon: 'mdi:shield-outline' },
  { label: 'Building', color: '#3B82F6', icon: 'mdi:shield-half-full' },
  { label: 'Established', color: '#22C55E', icon: 'mdi:shield-check' },
  { label: 'Veteran', color: '#EAB308', icon: 'mdi:shield-star' },
]

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatFry(amount: number): string {
  if (amount >= 1000) return `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`
  return String(amount)
}

const DailyRewardsModal: React.FC<DailyRewardsModalProps> = ({ open, onClose }) => {
  const { activeAddress } = useWallet()
  const { ensureAuth } = useAuth()
  const { isSimpleMode } = usePreferences()

  const [config, setConfig] = useState<RewardsConfig | null>(null)
  const [status, setStatus] = useState<RewardsStatus | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null)
  const [activeTab, setActiveTab] = useState<'rewards' | 'leaderboard'>('rewards')
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [eligibilityExpanded, setEligibilityExpanded] = useState(false)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null)
  const [vaultClaiming, setVaultClaiming] = useState(false)

  const turnstileRef = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetId = useRef<string | null>(null)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const claimingRef = useRef(false)

  const isCappedHybrid = config?.cappedHybridEnabled ?? false

  // Fetch config + status on open
  useEffect(() => {
    if (!open || !activeAddress) return
    setLoading(true)
    setClaimResult(null)
    setActiveTab('rewards')

    Promise.all([fetchRewardsConfig(), fetchRewardsStatus(activeAddress)])
      .then(([cfg, sts]) => {
        setConfig(cfg)
        setStatus(sts)
        if (!sts.canClaim && sts.cooldownMinutes > 0) {
          setCooldownSeconds(Math.ceil(sts.cooldownMinutes * 60))
        } else {
          setCooldownSeconds(0)
        }
        // Fetch vault status if capped-hybrid
        if (cfg.cappedHybridEnabled) {
          fetchVaultStatus(activeAddress).then(setVaultStatus).catch(() => {})
        }
      })
      .catch((err) => {
        console.error('Failed to load rewards data:', err)
        toast.error('Failed to load rewards data')
      })
      .finally(() => setLoading(false))
  }, [open, activeAddress])

  // Countdown timer
  useEffect(() => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    if (cooldownSeconds <= 0) return

    cooldownTimer.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current)
          if (activeAddress) {
            fetchRewardsStatus(activeAddress)
              .then((sts) => {
                setStatus(sts)
                if (!sts.canClaim && sts.cooldownMinutes > 0) {
                  setCooldownSeconds(Math.ceil(sts.cooldownMinutes * 60))
                }
              })
              .catch(() => {})
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    }
  }, [cooldownSeconds > 0, activeAddress])

  // Turnstile callback ref
  const turnstileCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (turnstileWidgetId.current && (window as any).turnstile) {
      try {
        ;(window as any).turnstile.remove(turnstileWidgetId.current)
      } catch (_) {}
      turnstileWidgetId.current = null
    }

    turnstileRef.current = node
    setTurnstileToken(null)
    if (!node || !TURNSTILE_SITE_KEY) return

    const doRender = () => {
      if (!turnstileRef.current || !(window as any).turnstile) return
      if (turnstileWidgetId.current) {
        try { ;(window as any).turnstile.remove(turnstileWidgetId.current) } catch (_) {}
        turnstileWidgetId.current = null
      }
      const isDark = document.documentElement.classList.contains('dark')
      turnstileWidgetId.current = (window as any).turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => {
          setTurnstileToken(null)
          if (turnstileWidgetId.current && (window as any).turnstile) {
            try { ;(window as any).turnstile.reset(turnstileWidgetId.current) } catch (_) {}
          }
        },
        theme: isDark ? 'dark' : 'light',
      })
    }

    if ((window as any).turnstile) {
      doRender()
    } else {
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        if ((window as any).turnstile) {
          clearInterval(poll)
          doRender()
        } else if (attempts >= 50) {
          clearInterval(poll)
        }
      }, 100)

      const existing = document.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"]'
      ) as HTMLScriptElement | null
      if (!existing) {
        const script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        document.head.appendChild(script)
      }
    }
  }, [])

  // Fetch leaderboard on tab switch
  useEffect(() => {
    if (activeTab !== 'leaderboard' || leaderboard.length > 0) return
    setLeaderboardLoading(true)
    fetchLeaderboard()
      .then(setLeaderboard)
      .catch(() => toast.error('Failed to load leaderboard'))
      .finally(() => setLeaderboardLoading(false))
  }, [activeTab])

  const handleClaim = useCallback(async () => {
    if (claimingRef.current) return
    if (!activeAddress || !status?.canClaim || claiming) return
    claimingRef.current = true
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error('Please complete the CAPTCHA verification')
      claimingRef.current = false
      return
    }

    setClaiming(true)
    try {
      await ensureAuth()
      const fingerprint = await getFingerprint()
      const result = await claimReward(
        activeAddress,
        fingerprint,
        turnstileToken || undefined
      )
      setClaimResult(result)
      if (isCappedHybrid && result.grossReward) {
        toast.success(`Claimed ${result.grossReward} FRY (${result.liquidReward} liquid + ${result.vaultReward} vault)!`)
      } else {
        toast.success(`Claimed ${result.actualReward} FRY!`)
      }

      const sts = await fetchRewardsStatus(activeAddress)
      setStatus(sts)
      if (!sts.canClaim && sts.cooldownMinutes > 0) {
        setCooldownSeconds(Math.ceil(sts.cooldownMinutes * 60))
      }
      // Refresh vault status after claim
      if (isCappedHybrid) {
        fetchVaultStatus(activeAddress).then(setVaultStatus).catch(() => {})
      }

      setTurnstileToken(null)
      if (turnstileWidgetId.current && (window as any).turnstile) {
        try {
          ;(window as any).turnstile.reset(turnstileWidgetId.current)
        } catch (_) {}
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to claim reward'
      if (!msg.includes('cancelled') && !msg.includes('CANCELLED')) {
        toast.error(msg)
      }
    } finally {
      setClaiming(false)
      claimingRef.current = false
    }
  }, [activeAddress, status, claiming, turnstileToken, ensureAuth, isCappedHybrid])

  const handleVaultClaim = useCallback(async () => {
    if (!activeAddress || vaultClaiming) return
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error('Please complete the CAPTCHA verification')
      return
    }
    setVaultClaiming(true)
    try {
      await ensureAuth()
      const fingerprint = await getFingerprint()
      const result = await claimVaultReward(fingerprint, turnstileToken || undefined)
      toast.success(`Claimed ${result.amount} FRY from vault!`)
      const vs = await fetchVaultStatus(activeAddress)
      setVaultStatus(vs)
      setTurnstileToken(null)
      if (turnstileWidgetId.current && (window as any).turnstile) {
        try { ;(window as any).turnstile.reset(turnstileWidgetId.current) } catch (_) {}
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Failed to claim vault'
      if (!msg.includes('cancelled') && !msg.includes('CANCELLED')) toast.error(msg)
    } finally {
      setVaultClaiming(false)
    }
  }, [activeAddress, vaultClaiming, turnstileToken, ensureAuth])

  const rewardSchedule = status?.rewardSchedule || config?.rewardSchedule || []
  const tier = TRUST_TIERS[status?.trustTier ?? 0] || TRUST_TIERS[0]
  const circuitLevel = status?.circuitBreakerLevel || config?.circuitBreakerLevel || 'green'

  const isYou = (entryWallet: string) => {
    if (!activeAddress) return false
    const truncated = activeAddress.slice(0, 6) + '...' + activeAddress.slice(-4)
    return entryWallet === truncated
  }

  // Rewards tab content
  const renderRewardsTab = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <Spin size="large" />
        </div>
      )
    }

    if (!status) {
      return (
        <div className="text-center py-8 text-[var(--text-secondary)]">
          Connect your wallet to view rewards
        </div>
      )
    }

    if (!status.enabled) {
      return (
        <div className="text-center py-8 text-[var(--text-secondary)]">
          Daily rewards are currently disabled
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-4">
        {/* Circuit breaker banner */}
        {circuitLevel !== 'green' && (
          <div
            className="rounded-lg px-3 py-2 text-sm font-medium text-center"
            style={{
              backgroundColor:
                circuitLevel === 'yellow'
                  ? '#F59E0B22'
                  : circuitLevel === 'orange'
                    ? '#F9731622'
                    : '#EF444422',
              color:
                circuitLevel === 'yellow'
                  ? '#F59E0B'
                  : circuitLevel === 'orange'
                    ? '#F97316'
                    : '#EF4444',
              border: `1px solid ${
                circuitLevel === 'yellow'
                  ? '#F59E0B44'
                  : circuitLevel === 'orange'
                    ? '#F9731644'
                    : '#EF444444'
              }`,
            }}
          >
            {circuitLevel === 'yellow' && 'High activity \u2014 rewards may be slower'}
            {circuitLevel === 'orange' && 'Rewards limited to trusted wallets'}
            {circuitLevel === 'red' && 'Rewards temporarily paused'}
          </div>
        )}

        {/* ── CAPPED-HYBRID MODE ── */}
        {isCappedHybrid ? (
          <>
            {/* Daily budget bar */}
            {status.dailyBudget && (
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span>Daily Pool</span>
                  <span>{formatFry(status.dailyBudget.issued)} / {formatFry(status.dailyBudget.limit)} FRY</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (status.dailyBudget.issued / status.dailyBudget.limit) * 100)}%`,
                      backgroundColor: status.dailyBudget.remaining > 0 ? '#22C55E' : '#EF4444',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Reward display */}
            <div className="text-center py-2">
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Today&apos;s Reward
              </div>
              <div className="text-2xl font-bold font-apex" style={{ color: 'var(--text-heading)' }}>
                {status.estimatedReward} FRY
              </div>
              <div className="flex justify-center gap-3 mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: '#22C55E' }}>
                  <Icon icon="mdi:water" width={14} className="inline mr-1" />
                  {status.liquidReward ?? Math.floor(status.estimatedReward * (config?.liquidBps ?? 2000) / 10000)} liquid
                </span>
                <span style={{ color: '#3B82F6' }}>
                  <Icon icon="mdi:safe" width={14} className="inline mr-1" />
                  {status.vaultReward ?? status.estimatedReward - Math.floor(status.estimatedReward * (config?.liquidBps ?? 2000) / 10000)} vault
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── LEGACY STREAK MODE ── */}
            {/* Streak calendar */}
            <div className="grid grid-cols-7 gap-2">
              {rewardSchedule.slice(0, 7).map((amount, i) => {
                const normalizedStreak = status.currentStreak % (status.maxStreak || 7)
                const isCompleted = i < normalizedStreak
                const isCurrent = i === normalizedStreak
                const isFuture = i > normalizedStreak

                return (
                  <div
                    key={i}
                    className="relative flex flex-col items-center justify-center rounded-lg p-2 min-h-[72px] transition-all"
                    style={{
                      border: `2px solid ${
                        isCompleted
                          ? '#22C55E'
                          : isCurrent
                            ? '#EF4444'
                            : 'var(--border-color)'
                      }`,
                      backgroundColor: isCompleted
                        ? '#22C55E18'
                        : isCurrent
                          ? '#EF444418'
                          : 'var(--bg-secondary)',
                      ...(isCurrent
                        ? {
                            boxShadow: '0 0 0 2px #EF444444',
                            animation: 'pulse 2s infinite',
                          }
                        : {}),
                    }}
                  >
                    {isCompleted && (
                      <Icon
                        icon="mdi:check-circle"
                        width={14}
                        className="absolute top-1 right-1"
                        style={{ color: '#22C55E' }}
                      />
                    )}
                    <span
                      className="text-xs font-bold"
                      style={{
                        color: isCompleted
                          ? '#22C55E'
                          : isCurrent
                            ? '#EF4444'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {isCurrent ? 'NOW' : `D${i + 1}`}
                    </span>
                    {isFuture && (
                      <Icon
                        icon="mdi:lock"
                        width={12}
                        style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                      />
                    )}
                    <span
                      className="text-xs mt-1"
                      style={{
                        color: isFuture ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}
                    >
                      {formatFry(amount)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Trust tier */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <Icon icon={tier.icon} width={20} style={{ color: tier.color }} />
              <span className="text-sm font-medium" style={{ color: tier.color }}>
                {tier.label}
              </span>
              {!isSimpleMode && (
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  &middot; {status.multiplier}x multiplier
                </span>
              )}
            </div>

            {/* Estimated reward */}
            <div className="text-center">
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Estimated Next Reward
              </div>
              <div className="text-2xl font-bold font-apex" style={{ color: 'var(--text-heading)' }}>
                {status.estimatedReward} FRY
              </div>
            </div>
          </>
        )}

        {/* Eligibility requirements (collapsible) */}
        {config && (
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-color)' }}
          >
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium cursor-pointer"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-secondary)',
                border: 'none',
              }}
              onClick={() => setEligibilityExpanded(!eligibilityExpanded)}
            >
              <span>Eligibility Requirements</span>
              <Icon
                icon={eligibilityExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                width={18}
              />
            </button>
            {eligibilityExpanded && (
              <div className="px-3 py-2 flex flex-col gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isSimpleMode ? (
                  <div>Meet basic wallet and balance requirements to claim daily rewards</div>
                ) : (
                  <>
                    <div>Min ALGO balance: {config.minAlgoBalance} ALGO</div>
                    <div>Min FRY balance: {(config.minFryBalance ?? 0).toLocaleString()} FRY</div>
                    <div>Min wallet age: {config.minWalletAgeDays} days</div>
                    <div>Claim cooldown: {config.claimCooldownHours}h</div>
                    <div>Streak resets after: {config.streakResetHours}h</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Turnstile */}
        {TURNSTILE_SITE_KEY && (
          <div className="flex justify-center">
            <div ref={turnstileCallbackRef} />
          </div>
        )}

        {/* Claim button / Countdown / Success */}
        {claimResult ? (
          <div
            className="flex flex-col items-center gap-2 py-4 rounded-lg"
            style={{ backgroundColor: '#22C55E18', border: '1px solid #22C55E44' }}
          >
            <Icon icon="mdi:party-popper" width={32} style={{ color: '#22C55E' }} />
            {isCappedHybrid && claimResult.grossReward ? (
              <>
                <span className="text-lg font-bold" style={{ color: '#22C55E' }}>
                  +{claimResult.grossReward} FRY
                </span>
                <div className="flex gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#22C55E' }}>{claimResult.liquidReward} liquid</span>
                  <span style={{ color: '#3B82F6' }}>{claimResult.vaultReward} vault</span>
                </div>
              </>
            ) : (
              <span className="text-lg font-bold" style={{ color: '#22C55E' }}>
                +{claimResult.actualReward} FRY
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Day {claimResult.streakDay}{!isSimpleMode && !isCappedHybrid && <> &middot; {claimResult.multiplier}x multiplier</>}
            </span>
            {claimResult.txId && claimResult.txId !== 'vault-only' && (
              <a
                href={`https://allo.info/tx/${claimResult.txId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: '#3B82F6' }}
              >
                View transaction
              </a>
            )}
          </div>
        ) : cooldownSeconds > 0 ? (
          <div className="text-center py-3">
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Next claim in
            </div>
            <div className="text-xl font-bold font-apex" style={{ color: 'var(--text-heading)' }}>
              {formatCountdown(cooldownSeconds)}
            </div>
          </div>
        ) : status.hasActivePosition === false ? (
          <div className="text-center py-4">
            <div className="flex flex-col items-center gap-3">
              <Icon icon="mdi:lock-outline" width={32} style={{ color: 'var(--text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Stake or farm any amount to unlock daily FRY rewards.
              </p>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: '#EF4444', border: 'none' }}
                  onClick={() => { onClose(); window.location.href = '/token-stake'; }}
                >
                  Start Staking
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                  style={{ borderColor: '#EF4444', color: '#EF4444', border: '2px solid #EF4444', background: 'transparent' }}
                  onClick={() => { onClose(); window.location.href = '/farm'; }}
                >
                  Start Farming
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            className="w-full py-3 rounded-lg font-bold font-apex text-white text-base transition-all cursor-pointer"
            style={{
              backgroundColor: status.canClaim && !claiming ? '#EF4444' : '#666',
              border: 'none',
              opacity: status.canClaim && !claiming ? 1 : 0.6,
            }}
            disabled={!status.canClaim || claiming}
            onClick={handleClaim}
          >
            {claiming ? (
              <span className="flex items-center justify-center gap-2">
                <Spin size="small" />
                Claiming...
              </span>
            ) : status.canClaim ? (
              isCappedHybrid
                ? `Claim ${status.estimatedReward} FRY`
                : `Claim Day ${status.currentStreak + 1} \u2014 ${status.estimatedReward} FRY`
            ) : (
              'Cannot claim yet'
            )}
          </button>
        )}

        {/* ── Vault Section (capped-hybrid only) ── */}
        {isCappedHybrid && vaultStatus?.enabled && (
          <div
            className="rounded-lg p-3 flex flex-col gap-2"
            style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-2">
              <Icon icon="mdi:safe" width={18} style={{ color: '#3B82F6' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>
                Weekly Vault
              </span>
            </div>

            {/* Weekly progress */}
            <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>This week: {vaultStatus.currentWeek.checkIns}/{vaultStatus.currentWeek.requiredForUnlock} check-ins</span>
              <span>{vaultStatus.currentWeek.checkIns >= vaultStatus.currentWeek.requiredForUnlock ? '✓ Qualified' : `${vaultStatus.currentWeek.requiredForUnlock - vaultStatus.currentWeek.checkIns} more needed`}</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-color)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (vaultStatus.currentWeek.checkIns / vaultStatus.currentWeek.requiredForUnlock) * 100)}%`,
                  backgroundColor: vaultStatus.currentWeek.checkIns >= vaultStatus.currentWeek.requiredForUnlock ? '#22C55E' : '#3B82F6',
                }}
              />
            </div>

            {/* Vault balances */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs mt-1">
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Locked</div>
                <div className="font-bold" style={{ color: '#3B82F6' }}>{formatFry(vaultStatus.totalLocked)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Claimable</div>
                <div className="font-bold" style={{ color: '#22C55E' }}>{formatFry(vaultStatus.unlockableAmount)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)' }}>Claimed</div>
                <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatFry(vaultStatus.totalClaimed)}</div>
              </div>
            </div>

            {/* Vault claim button */}
            {vaultStatus.unlockableAmount > 0 && (
              <button
                className="w-full py-2 rounded-lg font-bold text-white text-sm transition-all cursor-pointer mt-1"
                style={{ backgroundColor: vaultClaiming ? '#666' : '#3B82F6', border: 'none' }}
                disabled={vaultClaiming}
                onClick={handleVaultClaim}
              >
                {vaultClaiming ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spin size="small" /> Claiming vault...
                  </span>
                ) : (
                  `Claim ${vaultStatus.unlockableAmount} FRY from Vault`
                )}
              </button>
            )}
          </div>
        )}

        {/* Stats footer */}
        <div
          className="flex justify-center gap-4 text-xs pt-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>
            Streak: {status.currentStreak}/{status.maxStreak}
          </span>
          <span>&middot;</span>
          <span>Total: {(status.totalClaimed ?? 0).toLocaleString()} FRY</span>
        </div>
      </div>
    )
  }

  // Leaderboard tab content
  const renderLeaderboardTab = () => {
    if (leaderboardLoading) {
      return (
        <div className="flex justify-center items-center py-12">
          <Spin size="large" />
        </div>
      )
    }

    if (leaderboard.length === 0) {
      return (
        <div className="text-center py-8 text-[var(--text-secondary)]">No leaderboard data yet</div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr
              className="text-xs uppercase"
              style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}
            >
              <th className="text-left py-2 px-1">#</th>
              <th className="text-left py-2 px-1">Wallet</th>
              <th className="text-right py-2 px-1">Claimed (FRY)</th>
              <th className="text-right py-2 px-1">Streak</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, i) => {
              const you = isYou(entry.wallet)
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: you ? '#EF444412' : 'transparent',
                  }}
                >
                  <td className="py-2 px-1 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {i + 1}
                  </td>
                  <td className="py-2 px-1 font-mono text-xs" style={{ color: you ? '#EF4444' : 'var(--text-primary)' }}>
                    {entry.wallet}
                    {you && (
                      <span className="ml-1 text-[10px] font-bold" style={{ color: '#EF4444' }}>
                        (YOU)
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-1 text-right" style={{ color: 'var(--text-primary)' }}>
                    {(entry.totalClaimed ?? 0).toLocaleString()}
                  </td>
                  <td className="py-2 px-1 text-right" style={{ color: 'var(--text-primary)' }}>
                    {entry.currentStreak}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={520}
      footer={null}
      destroyOnClose
    >
      <div
        className="flex flex-col pt-5 pb-5 px-5"
        style={{ backgroundColor: 'var(--modal-bg)', borderRadius: '12px' }}
      >
        {/* Header */}
        <h3
          className="text-center font-apex uppercase text-lg font-bold mb-4"
          style={{ color: 'var(--text-heading)' }}
        >
          Daily Rewards
        </h3>

        {/* Tab switcher */}
        <div
          className="flex mb-4 rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-color)' }}
        >
          <button
            className="flex-1 py-2 text-sm font-bold font-apex uppercase cursor-pointer transition-all"
            style={{
              backgroundColor: activeTab === 'rewards' ? '#EF4444' : 'var(--bg-secondary)',
              color: activeTab === 'rewards' ? 'white' : 'var(--text-secondary)',
              border: 'none',
            }}
            onClick={() => setActiveTab('rewards')}
          >
            Rewards
          </button>
          <button
            className="flex-1 py-2 text-sm font-bold font-apex uppercase cursor-pointer transition-all"
            style={{
              backgroundColor: activeTab === 'leaderboard' ? '#EF4444' : 'var(--bg-secondary)',
              color: activeTab === 'leaderboard' ? 'white' : 'var(--text-secondary)',
              border: 'none',
            }}
            onClick={() => setActiveTab('leaderboard')}
          >
            Leaderboard
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'rewards' ? renderRewardsTab() : renderLeaderboardTab()}
      </div>

      {/* Pulse animation for current day */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 #EF444444; }
          50% { box-shadow: 0 0 0 4px #EF444422; }
        }
      `}</style>
    </Modal>
  )
}

export default DailyRewardsModal
