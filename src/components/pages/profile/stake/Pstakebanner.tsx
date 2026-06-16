import { useEffect, useState } from 'react'
import { useMultiChainWallet } from '../../../../hooks/useMultiChainWallet'
import axios from 'axios'
import { usePreferences } from '../../../../contexts/PreferencesContext'
import { fetchChainPriceMap } from '../../../../services/PriceService'
import { useChain } from '../../../../context/ChainContext'

const PStakebanner = () => {
  const { activeAddress } = useMultiChainWallet()
  const { chainId } = useChain()
  const { isSimpleMode } = usePreferences()
  const [stats, setStats] = useState({ poolsCreated: 0, totalTvl: 0, myStakes: 0, myRewards: 0 })
  const api_base_url = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    if (activeAddress) fetchStats()
  }, [activeAddress, chainId])

  const fetchStats = async () => {
    try {
      const [allPoolsRes, stakeStatsRes, userPosRes, withdrawRes] = await Promise.allSettled([
        axios.get(`${api_base_url}/staking/all`),
        axios.get(`${api_base_url}/stakingtoken/user-staking-stats/${activeAddress}`),
        axios.get(`${api_base_url}/stakingtoken/wallet/${activeAddress}`),
        axios.get(`${api_base_url}/withdraw/wallet/${activeAddress}`),
      ])

      const allPools = allPoolsRes.status === 'fulfilled' ? allPoolsRes.value.data?.data || [] : []
      const stakeStats = stakeStatsRes.status === 'fulfilled' && stakeStatsRes.value.data?.success
        ? stakeStatsRes.value.data.data : { totalTVL: 0, myStake: 0, myReward: 0 }
      const userPositions = userPosRes.status === 'fulfilled' ? userPosRes.value.data?.data || [] : []
      const withdrawals = withdrawRes.status === 'fulfilled' ? withdrawRes.value.data?.data || [] : []

      const poolsCreated = allPools.length

      // Compute user's personal staked value in USD
      let totalTvl = 0
      try {
        const asaIds = [...new Set(userPositions.map((p: any) => Number(p.stakeTokens)).filter((id: number) => !isNaN(id)))] as number[]
        if (asaIds.length > 0) {
          const priceMap = await fetchChainPriceMap(asaIds, chainId)
          // Group withdrawals by poolId (tokens field is in standard units)
          const withdrawnByPool: Record<string, number> = {}
          withdrawals.forEach((w: any) => {
            const key = w.poolId || ''
            withdrawnByPool[key] = (withdrawnByPool[key] || 0) + (w.tokens || 0)
          })
          totalTvl = userPositions.reduce((sum: number, pos: any) => {
            const deposited = (pos.totalStaked || 0) / 1_000_000
            const withdrawn = withdrawnByPool[pos.poolId] || 0
            const net = Math.max(deposited - withdrawn, 0)
            const price = priceMap[String(pos.stakeTokens)] ?? 0
            return sum + net * price
          }, 0)
        }
      } catch {
        totalTvl = 0
      }

      const myStakes = stakeStats.myStake / 1_000_000
      const myRewards = stakeStats.myReward / 1_000_000

      setStats({ poolsCreated, totalTvl, myStakes, myRewards })
    } catch (error) {
      console.error('Error fetching stake stats:', error)
    }
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

  return (
    <div className="m-auto flex max-sm:flex-col w-full justify-between gap-[10px] bg-[var(--bg-card)] rounded-[18px] py-[32px] max-sm:gap-[30px] px-[40px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">Total Pools</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {stats.poolsCreated}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">My Staked Value</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          ${fmt(stats.totalTvl)}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">My Stakes</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {fmt(stats.myStakes)}
        </h3>
      </div>
      <div className="flex flex-col items-center gap-[24px] max-sm:gap-[6px]">
        <p className="text-[var(--text-secondary)] tracking-[0.54px] large">My Rewards</p>
        <h3 className="small text-[var(--text-primary)] font-medium tracking-[1.08px]">
          {fmt(stats.myRewards)}
        </h3>
      </div>
    </div>
  )
}

export default PStakebanner
