import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { fetchChainPriceMap, getChainLpTokenUsdPrice } from '../../../services/PriceService'
import { formatUsdAbbreviated } from "../../../utils/formatNumber"
import { usePreferences } from '../../../contexts/PreferencesContext'
import { useChain } from '../../../context/ChainContext'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'

interface FarmStats {
  tvlUsd: number
  myStakeUsd: number
  myRewardUsd: number
}

interface FarmBannerProps {
  wallet: string | undefined
}

const Farmbanner: React.FC<FarmBannerProps> = ({ wallet }) => {
  const { isSimpleMode } = usePreferences()
  const { chainId } = useChain()
  const { activeAddress } = useMultiChainWallet()
  const [stats, setStats] = useState<FarmStats>({
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

        // Fetch user stats + farm list in parallel
        const [statsRes, farmsRes, positionsRes] = await Promise.all([
          axios.get(`${api}/stakingfarmingtoken/user-farming-stats/${wallet}`),
          axios.get(`${api}/farming/all`, { params: { chainId } }),
          axios.get(`${api}/stakingfarmingtoken/wallet/${wallet}`),
        ])

        // Stats API returns HUMAN units (already divided by 1M)
        const userStats = statsRes.data?.success ? statsRes.data.data : { totalTVL: 0, myStake: 0, myReward: 0 }
        const farms: any[] = farmsRes.data?.data || []

        // Collect token pairs and reward token IDs
        const rewardTokenIds: number[] = []
        const farmPairs: { tokenAId: number; tokenBId: number }[] = []

        for (const f of farms) {
          const tokenAId = Number(f.lpToken?.tokenAId || f.lpToken?.tokenA || 0)
          const tokenBId = Number(f.lpToken?.tokenBId || f.lpToken?.tokenB || 0)
          const rid = Number(f.rewardToken?.id || f.rewardTokenId || 0)
          if (tokenAId > 0 && tokenBId > 0 && tokenAId !== tokenBId) {
            farmPairs.push({ tokenAId, tokenBId })
          } else {
            farmPairs.push({ tokenAId: 0, tokenBId: 0 }) // placeholder for invalid pairs
          }
          if (rid > 0) rewardTokenIds.push(rid)
        }

        // Build appId → LP pair key map for position pricing
        const appIdToPairKey = new Map<string, string>()
        for (const f of farms) {
          const aId = Number(f.lpToken?.tokenAId || f.lpToken?.tokenA || 0)
          const bId = Number(f.lpToken?.tokenBId || f.lpToken?.tokenB || 0)
          if (aId > 0 && bId > 0 && aId !== bId) {
            const key = [aId, bId].sort((a, b) => a - b).join('-')
            appIdToPairKey.set(String(f.appId), key)
          }
        }

        // Fetch LP token prices for each unique valid pair (on-chain via Tinyman SDK)
        const pairKeys = new Map<string, { tokenAId: number; tokenBId: number }>()
        for (const pair of farmPairs) {
          if (pair.tokenAId === 0 && pair.tokenBId === 0) continue
          const key = [pair.tokenAId, pair.tokenBId].sort((a, b) => a - b).join('-')
          if (!pairKeys.has(key)) pairKeys.set(key, pair)
        }

        const lpPriceResults = await Promise.allSettled(
          [...pairKeys.entries()].map(async ([key, pair]) => ({
            key,
            price: await getChainLpTokenUsdPrice(pair.tokenAId, pair.tokenBId, chainId),
          }))
        )

        const lpPrices: Record<string, number> = {}
        for (const r of lpPriceResults) {
          if (r.status === 'fulfilled' && r.value.price > 0) {
            lpPrices[r.value.key] = r.value.price
          }
        }

        // Fetch reward token prices
        const rewardPrices = rewardTokenIds.length > 0
          ? await fetchChainPriceMap([...new Set(rewardTokenIds)], chainId)
          : {}

        // Compute TVL in USD from farm list (totalStaked is in micro-units)
        let tvlUsd = 0
        let tvlLpTokens = 0
        for (let i = 0; i < farms.length; i++) {
          const f = farms[i]
          const totalStakedHuman = (f.totalStaked || 0) / 1_000_000_000
          const pair = farmPairs[i]
          if (pair.tokenAId > 0 && pair.tokenBId > 0) {
            const key = [pair.tokenAId, pair.tokenBId].sort((a, b) => a - b).join('-')
            const lpPrice = lpPrices[key] ?? 0
            tvlUsd += totalStakedHuman * lpPrice
          }
          tvlLpTokens += totalStakedHuman
        }

        // If farm-list TVL is 0 but stats API has data, use stats totalTVL with
        // a representative LP price (most common pair or first available price)
        const statsTvl = userStats.totalTVL || 0
        if (tvlUsd === 0 && statsTvl > 0 && Object.keys(lpPrices).length > 0) {
          const prices = Object.values(lpPrices).filter(p => p > 0)
          const avgLpPrice = prices.reduce((s, p) => s + p, 0) / prices.length
          tvlUsd = statsTvl * avgLpPrice
        }

        // User values — stats API already returns human units (NOT micro)
        const myReward = userStats.myReward || 0

        // Calculate My Stakes from per-pool positions × per-pool LP prices
        const positions: any[] = positionsRes.data?.data || []
        let myStakeUsd = 0
        for (const pos of positions) {
          const pairKey = appIdToPairKey.get(String(pos.poolId))
          if (pairKey) {
            const lpPrice = lpPrices[pairKey] ?? 0
            myStakeUsd += (pos.stakedAmount || 0) * lpPrice
          }
        }

        // Reward USD
        const uniqueRewardIds = [...new Set(rewardTokenIds)]
        let rewardPrice = 0
        if (uniqueRewardIds.length > 0) {
          const total = uniqueRewardIds.reduce((sum, id) => sum + (rewardPrices[id.toString()] ?? 0), 0)
          rewardPrice = total / uniqueRewardIds.length
        }
        const myRewardUsd = myReward * rewardPrice

        setStats({ tvlUsd, myStakeUsd, myRewardUsd })
      } catch (error) {
        console.error('Failed to fetch farming stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [wallet, chainId])

  const fmt = (v: number) => formatUsdAbbreviated(v)

  return (
    <div className="w-full mt-[40px] mb-[47px]">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex sm-s:flex-col justify-between gap-[10px] sm-s:gap-[20px] bg-[var(--bg-card)] rounded-[18px] py-[32px] max-xxxl:px-[140px] px-[190px] max-sm:!px-[40px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)]">
        <div className="flex flex-col items-center gap-[24px] sm-s:gap-[6px]">
          <p className="text-text_clr tracking-[0.54px] large">{isSimpleMode ? 'Total Value Farmed' : 'Farm TVL'}</p>
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

export default Farmbanner
