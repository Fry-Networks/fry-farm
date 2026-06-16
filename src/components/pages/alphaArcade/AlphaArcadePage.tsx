import React, { useEffect, useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import { Tabs, Spin, Input, Select, Alert, Table, Tooltip } from 'antd'
import MarketCard from './MarketCard'
import PositionCard from './PositionCard'
import DepositModal from './DepositModal'
import WithdrawModal from './WithdrawModal'
import ClaimModal from './ClaimModal'
import { getMarkets, getPositionsByWallet, getPools, getStats } from '../../../services/alphaArcadeApi'
import type { AlphaArcadeMarket, AlphaArcadePosition, AlphaArcadePool, AlphaArcadeStats } from '../../../types/alphaArcade'
import { usePreferences } from '../../../contexts/PreferencesContext'
import { friendlyApr } from '../../../utils/grandmaLabels'

const SIMPLE_SORT_KEYS = ['top', 'popular', 'newest']

const AlphaArcadePage: React.FC = () => {
  const { activeAddress } = useWallet()
  const { isSimpleMode } = usePreferences()

  const [markets, setMarkets] = useState<AlphaArcadeMarket[]>([])
  const [positions, setPositions] = useState<AlphaArcadePosition[]>([])
  const [pools, setPools] = useState<AlphaArcadePool[]>([])
  const [stats, setStats] = useState<AlphaArcadeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [rewardOnly, setRewardOnly] = useState(false)
  const [sortBy, setSortBy] = useState<string>('volume-desc')
  const [activeTab, setActiveTab] = useState<string>('markets')

  const [depositModal, setDepositModal] = useState<{ visible: boolean; market: AlphaArcadeMarket | null }>({
    visible: false,
    market: null,
  })
  const [withdrawModal, setWithdrawModal] = useState<{ visible: boolean; position: AlphaArcadePosition | null }>({
    visible: false,
    position: null,
  })
  const [claimModal, setClaimModal] = useState<{ visible: boolean; position: AlphaArcadePosition | null }>({
    visible: false,
    position: null,
  })
  const [showHowItWorks, setShowHowItWorks] = useState(false)

  // Reset sort to a valid option when entering simple mode
  useEffect(() => {
    if (isSimpleMode && !SIMPLE_SORT_KEYS.includes(sortBy)) {
      setSortBy('top')
    }
  }, [isSimpleMode])

  // Fetch markets and pools on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [marketsData, poolsData, statsData] = await Promise.all([
          getMarkets().catch(() => []),
          getPools().catch(() => []),
          getStats().catch(() => null),
        ])
        setMarkets(marketsData || [])
        setPools(poolsData || [])
        if (statsData) setStats(statsData)
      } catch (e) {
        console.error('Failed to fetch market data:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Fetch positions when wallet changes
  useEffect(() => {
    if (!activeAddress) {
      setPositions([])
      return
    }
    const fetchPositions = async () => {
      setPositionsLoading(true)
      try {
        const data = await getPositionsByWallet(activeAddress)
        setPositions(data || [])
      } catch (e) {
        console.error('Failed to fetch positions:', e)
      } finally {
        setPositionsLoading(false)
      }
    }
    fetchPositions()
  }, [activeAddress])

  // Build pool lookup map
  const poolMap = useMemo(() => {
    const map = new Map<number, AlphaArcadePool>()
    for (const p of pools) {
      map.set(p.marketAppId, p)
    }
    return map
  }, [pools])

  // Build market lookup map for endTs
  const marketMap = useMemo(() => {
    const map = new Map<number, AlphaArcadeMarket>()
    for (const m of markets) {
      map.set(m.marketAppId, m)
    }
    return map
  }, [markets])

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const m of markets) {
      for (const c of m.categories || []) {
        if (c) cats.add(c)
      }
    }
    return ['all', ...Array.from(cats).sort()]
  }, [markets])

  // Filter markets
  const rewardMarketCount = useMemo(() => {
    return pools.filter(p => p.aprDisplay?.isRewardMarket).length
  }, [pools])

  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      const matchesSearch = !searchQuery ||
        (m.title || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || (m.categories || []).includes(categoryFilter)
      const matchesReward = !rewardOnly || poolMap.get(m.marketAppId)?.aprDisplay?.isRewardMarket
      return matchesSearch && matchesCategory && matchesReward
    })
  }, [markets, searchQuery, categoryFilter, rewardOnly, poolMap])

  // Sort filtered markets
  const sortedMarkets = useMemo(() => {
    const sorted = [...filteredMarkets]
    sorted.sort((a, b) => {
      const poolA = poolMap.get(a.marketAppId)
      const poolB = poolMap.get(b.marketAppId)
      switch (sortBy) {
        case 'apr-desc': {
          const aprA = poolA?.aprDisplay?.combinedApr ?? 0
          const aprB = poolB?.aprDisplay?.combinedApr ?? 0
          return aprB - aprA
        }
        case 'reward-apr-desc': {
          const rA = poolA?.aprDisplay?.rewardApr ?? 0
          const rB = poolB?.aprDisplay?.rewardApr ?? 0
          return rB - rA
        }
        case 'tvl-desc': {
          const tvlA = poolA?.totalUsdcDeposited ?? 0
          const tvlB = poolB?.totalUsdcDeposited ?? 0
          return tvlB - tvlA
        }
        case 'volume-desc':
          return (b.twentyFourHrVolume || 0) - (a.twentyFourHrVolume || 0)
        case 'resolution-asc': {
          const endA = a.endTs || Infinity
          const endB = b.endTs || Infinity
          return endA - endB
        }
        case 'top': {
          const featA = a.featured ? 1 : 0
          const featB = b.featured ? 1 : 0
          if (featB !== featA) return featB - featA
          return (b.twentyFourHrVolume || 0) - (a.twentyFourHrVolume || 0)
        }
        case 'popular':
          return (b.volume || 0) - (a.volume || 0)
        case 'newest':
          return (b.createdAt || 0) - (a.createdAt || 0)
        default:
          return 0
      }
    })
    return sorted
  }, [filteredMarkets, sortBy, poolMap])

  const activePositionsCount = useMemo(() => {
    return positions.filter((p) => p.status === 'active' || p.status === 'pending_withdrawal').length
  }, [positions])

  // Check if any active position has a market resolving within 48h
  const urgentPositions = useMemo(() => {
    const now = Date.now()
    return positions.filter((p) => {
      if (p.status !== 'active' && p.status !== 'pending_withdrawal') return false
      const pool = poolMap.get(p.marketAppId)
      const market = marketMap.get(p.marketAppId)
      const resTime = pool?.marketResolutionTime || market?.endTs || 0
      if (resTime <= 0) return false
      const msRemaining = resTime * 1000 - now
      return msRemaining > 0 && msRemaining < 48 * 3600000
    })
  }, [positions, poolMap, marketMap])

  // Get resolution time for a position (from pool or market)
  const getResolutionTime = (pos: AlphaArcadePosition): number => {
    const pool = poolMap.get(pos.marketAppId)
    if (pool?.marketResolutionTime && pool.marketResolutionTime > 0) return pool.marketResolutionTime
    const market = marketMap.get(pos.marketAppId)
    return market?.endTs || 0
  }

  const refreshAll = async () => {
    try {
      const [marketsData, poolsData, statsData] = await Promise.all([
        getMarkets().catch(() => []),
        getPools().catch(() => []),
        getStats().catch(() => null),
      ])
      setMarkets(marketsData || [])
      setPools(poolsData || [])
      if (statsData) setStats(statsData)
      if (activeAddress) {
        const posData = await getPositionsByWallet(activeAddress).catch(() => [])
        setPositions(posData || [])
      }
    } catch (e) {
      console.error('Refresh failed:', e)
    }
  }

  const getMarketQuestion = (position: AlphaArcadePosition): string => {
    const pool = poolMap.get(position.marketAppId)
    if (pool?.marketQuestion) return pool.marketQuestion
    const market = markets.find((m) => m.marketAppId === position.marketAppId)
    return market?.title || ''
  }

  const fmtUsd = (v: number) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Pools table data
  const poolsTableData = useMemo(() => {
    return pools.map(pool => {
      const market = marketMap.get(pool.marketAppId)
      const userPos = positions.find(p => p.marketAppId === pool.marketAppId && (p.status === 'active' || p.status === 'pending_withdrawal'))
      const resTime = pool.marketResolutionTime || market?.endTs || 0
      return {
        key: pool._id,
        market: pool.marketQuestion || market?.title || `Market #${pool.marketAppId}`,
        tvl: pool.totalUsdcDeposited || 0,
        providers: pool.totalProviders || 0,
        combinedApr: pool.aprDisplay?.combinedApr ?? 0,
        isRewardMarket: pool.aprDisplay?.isRewardMarket || false,
        userPosition: userPos?.usdcDeposited || 0,
        resolutionTime: resTime,
        marketAppId: pool.marketAppId,
        marketObj: market,
      }
    }).filter(p => p.tvl > 0)
  }, [pools, positions, marketMap])

  return (
    <div className="max-xxxl:w-[95%] w-[80%] m-auto pt-[30px] pb-[60px] flex-1 relative z-[2]">
      {/* Resolution warning banner */}
      {urgentPositions.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message={
            urgentPositions.length === 1
              ? 'You have 1 position in a market resolving within 48 hours. Withdraw to protect your funds.'
              : `You have ${urgentPositions.length} positions in markets resolving within 48 hours. Withdraw to protect your funds.`
          }
        />
      )}

      {/* Stats banner */}
      <div className="w-full mb-[30px]">
        <div className="flex sm-s:flex-col justify-between gap-[10px] sm-s:gap-[20px] bg-[var(--bg-card)] rounded-[18px] py-[32px] px-[60px] max-sm:!px-[30px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">Active Markets</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : stats?.activePools ?? markets.length}
            </h3>
          </div>
          {!isSimpleMode && (
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">Reward Markets</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : rewardMarketCount}
            </h3>
          </div>
          )}
          {!isSimpleMode && (
            <div className="flex flex-col items-center gap-[6px]">
              <p className="text-text_clr tracking-[0.54px] large">Total TVL</p>
              <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
                {loading ? '...' : fmtUsd((stats?.tvl ?? 0) / 1_000_000)}
              </h3>
            </div>
          )}
          {!isSimpleMode && (
            <div className="flex flex-col items-center gap-[6px]">
              <p className="text-text_clr tracking-[0.54px] large">Total Providers</p>
              <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
                {loading ? '...' : stats?.totalProviders ?? 0}
              </h3>
            </div>
          )}
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">{isSimpleMode ? 'People Participating' : 'Active Positions'}</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {loading ? '...' : stats?.totalPositions ?? 0}
            </h3>
          </div>
          <div className="flex flex-col items-center gap-[6px]">
            <p className="text-text_clr tracking-[0.54px] large">My Positions</p>
            <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
              {!activeAddress ? '—' : positionsLoading ? '...' : activePositionsCount}
            </h3>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Icon icon="mdi:information-outline" width={16} />
          How Prediction Market LP Works
          <Icon icon={showHowItWorks ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={16} />
        </button>
        {showHowItWorks && (
          <div className="mt-2 bg-[var(--bg-secondary)] rounded-xl p-4 text-sm text-[var(--text-secondary)] flex flex-col gap-3">
            <div>
              <p className="font-medium text-[var(--text-primary)]">How you earn</p>
              <p>Every trade pays a spread (the difference between buy and sell prices). With a 0.5% spread, a $100 trade earns you $0.50. More trading activity means more earnings.</p>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">Your risk</p>
              <p>If the market resolves while you hold an imbalanced position (more YES than NO or vice versa), you may lose capital. Markets near 50/50 are lower risk.</p>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">When you get paid</p>
              <p>Spread revenue accumulates in your position. Withdraw anytime before resolution, or your position settles automatically at resolution.</p>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">Tips</p>
              <p>Higher spread = more per trade but less volume. More time to resolution = more time to earn. Diversify across markets to reduce directional risk.</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'markets',
            label: 'Markets',
            children: (
              <div>
                {/* Search & filter */}
                <div className="flex flex-wrap gap-3 mb-5">
                  <Input
                    placeholder="Search markets..."
                    prefix={<Icon icon="mdi:magnify" width={18} className="text-[var(--text-secondary)]" />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-[300px]"
                    allowClear
                  />
                  {categories.length > 2 && (
                    <Select
                      value={categoryFilter}
                      onChange={setCategoryFilter}
                      options={categories.map((c) => ({
                        value: c,
                        label: c === 'all' ? 'All Categories' : c,
                      }))}
                      className="min-w-[160px]"
                    />
                  )}
                  {!isSimpleMode && (
                    <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rewardOnly}
                        onChange={(e) => setRewardOnly(e.target.checked)}
                        className="accent-amber-500"
                      />
                      Reward Markets Only
                    </label>
                  )}
                  <Select
                    value={sortBy}
                    onChange={setSortBy}
                    options={isSimpleMode ? [
                      { value: 'top', label: 'Recommended' },
                      { value: 'popular', label: 'Most Popular' },
                      { value: 'newest', label: 'Newest' },
                    ] : [
                      { value: 'top', label: 'Top Markets' },
                      { value: 'popular', label: 'Most Popular' },
                      { value: 'volume-desc', label: 'Highest 24h Volume' },
                      { value: 'apr-desc', label: 'Highest APR' },
                      { value: 'reward-apr-desc', label: 'Highest Reward APR' },
                      { value: 'tvl-desc', label: 'Highest TVL' },
                      { value: 'resolution-asc', label: 'Soonest Resolution' },
                      { value: 'newest', label: 'Newest' },
                    ]}
                    className="min-w-[180px]"
                  />
                </div>

                {loading ? (
                  <div className="flex justify-center py-20">
                    <Spin size="large" />
                  </div>
                ) : sortedMarkets.length === 0 ? (
                  <div className="text-center py-20">
                    <Icon icon="mdi:chart-timeline-variant" width={48} className="text-[var(--text-secondary)] opacity-30 mx-auto mb-3" />
                    <p className="text-[var(--text-secondary)]">
                      {searchQuery || categoryFilter !== 'all'
                        ? 'No markets match your filters'
                        : 'No markets available'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedMarkets.map((market) => (
                      <MarketCard
                        key={market.marketAppId}
                        market={market}
                        pool={poolMap.get(market.marketAppId)}
                        onDeposit={(m) => setDepositModal({ visible: true, market: m })}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'pools',
            label: isSimpleMode ? `All Pools (${poolsTableData.length})` : `Community Positions (${poolsTableData.length})`,
            children: (
              <Table
                dataSource={poolsTableData}
                pagination={false}
                className="web-table"
                columns={[
                  { title: 'MARKET', dataIndex: 'market', render: (v: string) => <span className="text-[var(--text-primary)] font-medium text-sm">{v}</span> },
                  { title: isSimpleMode ? 'POOL SIZE' : 'TVL', dataIndex: 'tvl', sorter: (a: any, b: any) => a.tvl - b.tvl, defaultSortOrder: 'descend' as const, render: (v: number) => `$${(v / 1e6).toFixed(2)}` },
                  ...(!isSimpleMode ? [{ title: () => <span className="flex items-center gap-1">EST. APR <Tooltip title="Estimated annual return from spread fees and LP rewards. Based on real 24h trading volume and reward payout data. Actual returns vary with market activity."><Icon icon="mdi:information-outline" width={14} className="cursor-help text-[var(--text-secondary)]" /></Tooltip></span>, dataIndex: 'combinedApr', sorter: (a: any, b: any) => a.combinedApr - b.combinedApr, render: (v: number) => v > 0 ? <span className="text-green-500 font-medium">{v.toFixed(1)}%</span> : <span className="text-[var(--text-secondary)]">N/A</span> }] : []),
                  ...(!isSimpleMode ? [{ title: 'REWARDS', dataIndex: 'isRewardMarket', render: (v: boolean) => v ? <span className="text-amber-500 font-medium text-xs">Reward Market</span> : <span className="text-[var(--text-secondary)] text-xs">Spread only</span> }] : []),
                  ...(!isSimpleMode ? [{ title: 'PROVIDERS', dataIndex: 'providers', sorter: (a: any, b: any) => a.providers - b.providers, render: (v: number) => v }] : []),
                  { title: isSimpleMode ? 'YOUR INVESTMENT' : 'YOUR POSITION', dataIndex: 'userPosition', render: (v: number) => v > 0 ? `$${(v / 1e6).toFixed(2)}` : '—' },
                  { title: 'RESOLUTION', dataIndex: 'resolutionTime', render: (v: number) => v > 0 ? new Date(v * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                  { title: '', dataIndex: 'marketObj', render: (m: AlphaArcadeMarket | undefined) => m ? <button onClick={() => setDepositModal({ visible: true, market: m })} className="px-3 py-1 rounded-[6px] text-xs font-medium linearGradient text-white">Deposit</button> : null },
                ]}
              />
            ),
          },
          {
            key: 'positions',
            label: isSimpleMode
              ? `My Investments${activePositionsCount > 0 ? ` (${activePositionsCount})` : ''}`
              : `My Positions${activePositionsCount > 0 ? ` (${activePositionsCount})` : ''}`,
            children: (
              <div>
                {!activeAddress ? (
                  <div className="text-center py-20">
                    <Icon icon="mdi:wallet" width={48} className="text-[var(--text-secondary)] opacity-30 mx-auto mb-3" />
                    <p className="text-[var(--text-secondary)]">Connect your wallet to view positions</p>
                  </div>
                ) : positionsLoading ? (
                  <div className="flex justify-center py-20">
                    <Spin size="large" />
                  </div>
                ) : positions.length === 0 ? (
                  <div className="text-center py-20">
                    <Icon icon="mdi:inbox" width={48} className="text-[var(--text-secondary)] opacity-30 mx-auto mb-3" />
                    <p className="text-[var(--text-secondary)]">No positions yet</p>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">Provide liquidity to a market to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {positions.map((pos) => (
                      <PositionCard
                        key={pos._id}
                        position={pos}
                        marketQuestion={getMarketQuestion(pos)}
                        resolutionTime={getResolutionTime(pos)}
                        isRewardMarket={poolMap.get(pos.marketAppId)?.aprDisplay?.isRewardMarket}
                        onWithdraw={(p) => setWithdrawModal({ visible: true, position: p })}
                        onClaim={(p) => setClaimModal({ visible: true, position: p })}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Modals */}
      <DepositModal
        visible={depositModal.visible}
        market={depositModal.market}
        pool={depositModal.market ? poolMap.get(depositModal.market.marketAppId) : undefined}
        onClose={() => setDepositModal({ visible: false, market: null })}
        onSuccess={() => {
          setDepositModal({ visible: false, market: null })
          refreshAll()
          setActiveTab('positions')
        }}
      />
      <WithdrawModal
        visible={withdrawModal.visible}
        position={withdrawModal.position}
        marketQuestion={withdrawModal.position ? getMarketQuestion(withdrawModal.position) : undefined}
        onClose={() => setWithdrawModal({ visible: false, position: null })}
        onSuccess={() => {
          setWithdrawModal({ visible: false, position: null })
          refreshAll()
        }}
      />
      <ClaimModal
        visible={claimModal.visible}
        position={claimModal.position}
        marketQuestion={claimModal.position ? getMarketQuestion(claimModal.position) : undefined}
        onClose={() => setClaimModal({ visible: false, position: null })}
        onSuccess={() => {
          setClaimModal({ visible: false, position: null })
          refreshAll()
        }}
      />
    </div>
  )
}

export default AlphaArcadePage
