import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { fetchChainPriceMap } from '../../../services/PriceService'
import { usePreferences } from '../../../contexts/PreferencesContext'
import { useChain } from '../../../context/ChainContext'

interface StakeStats {
  tvlUsd: number
  myStakeUsd: number
  myRewardUsd: number
}

interface StakeBannerProps {
  wallet: string | undefined
}

const Stakebanner: React.FC<StakeBannerProps> = ({ wallet }) => {
  const { isSimpleMode } = usePreferences()
  const { chainId } = useChain()
  const [stats, setStats] = useState<StakeStats>({
    tvlUsd: 0,
    myStakeUsd: 0,
    myRewardUsd: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      if (!wallet) return
      try {
        const api = import.meta.env.VITE_API_BASE_URL

        // Fetch user stats + pool list in parallel
        const [statsRes, poolsRes] = await Promise.all([
          axios.get(`${api}/stakingtoken/user-staking-stats/${wallet}`),
          axios.get(`${api}/staking/all`, { params: { chainId } }),
        ])

        const userStats = statsRes.data?.success ? statsRes.data.data : { totalTVL: 0, myStake: 0, myReward: 0 }
        const pools: any[] = poolsRes.data?.data || []

        // Collect unique token IDs (stake + reward)
        const stakeTokenIds: number[] = []
        const rewardTokenIds: number[] = []
        for (const p of pools) {
          const sid = Number(p?.stakeToken?.id ?? p?.stakeTokenId)
          const rid = Number(p?.rewardToken?.id ?? p?.rewardTokenId)
          if (!isNaN(sid) && sid > 0) stakeTokenIds.push(sid)
          if (!isNaN(rid) && rid > 0) rewardTokenIds.push(rid)
        }
        const allIds = [...new Set([...stakeTokenIds, ...rewardTokenIds])]

        // Fetch prices
        const prices = allIds.length > 0 ? await fetchChainPriceMap(allIds, chainId) : {}

        // Compute TVL in USD (sum per-pool)
        let tvlUsd = 0
        let tvlTokens = 0
        for (const p of pools) {
          const sid = (p?.stakeToken?.id ?? p?.stakeTokenId)?.toString()
          const amount = Number(p.totalAmountStaked || 0)
          const price = prices[sid] ?? 0
          tvlUsd += amount * price
          tvlTokens += amount
        }

        // Weighted-average price for user stake conversion
        const avgPrice = tvlTokens > 0 ? tvlUsd / tvlTokens : 0
        const myStakeUsd = (userStats.myStake || 0) * avgPrice

        // Reward USD: use average reward token price
        const uniqueRewardIds = [...new Set(rewardTokenIds)]
        let rewardPrice = 0
        if (uniqueRewardIds.length > 0) {
          const total = uniqueRewardIds.reduce((sum, id) => sum + (prices[id.toString()] ?? 0), 0)
          rewardPrice = total / uniqueRewardIds.length
        }
        const myRewardUsd = (userStats.myReward || 0) * rewardPrice

        setStats({ tvlUsd, myStakeUsd, myRewardUsd })
      } catch (error) {
        console.error('Failed to fetch staking stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [wallet, chainId])

  const fmt = (v: number) =>
    `$ ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="w-full mt-[40px] mb-[47px]">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex sm-s:flex-col justify-between gap-[10px] sm-s:gap-[20px] bg-[var(--bg-card)] rounded-[18px] py-[32px] max-xxxl:px-[140px] px-[190px] max-sm:!px-[40px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="flex flex-col items-center gap-[24px] sm-s:gap-[6px]">
          <p className="text-text_clr tracking-[0.54px] large">{isSimpleMode ? 'Total Value Staked' : 'Stake TVL'}</p>
          <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
            {loading ? '...' : fmt(stats.tvlUsd)}
          </h3>
        </div>
        <div className="flex flex-col items-center gap-[24px] sm-s:gap-[6px]">
          <p className="text-text_clr tracking-[0.54px] large">My Stakes</p>
          <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
            {loading ? '...' : fmt(stats.myStakeUsd)}
          </h3>
        </div>
        <div className="flex flex-col items-center gap-[24px] sm-s:gap-[6px]">
          <p className="text-text_clr tracking-[0.54px] large">My Reward</p>
          <h3 className="small text-[var(--text-heading)] font-medium tracking-[1.08px]">
            {loading ? '...' : fmt(stats.myRewardUsd)}
          </h3>
        </div>
      </div>
    </div>
  )
}

export default Stakebanner
