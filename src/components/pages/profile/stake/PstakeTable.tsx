import axios from 'axios'
import React, { useEffect, useState } from 'react'
import { useMultiChainWallet } from '../../../../hooks/useMultiChainWallet'
import P_STable from './PsTable'
import { tokenServiceInstance } from '../../../../services/TokenService'
import { fetchChainPriceMap } from '../../../../services/PriceService'
import { useChain } from '../../../../context/ChainContext'
import { getUserData } from '../../../../staking_func'

export type PoolStatus = 'active' | 'ending-soon' | 'ended'
export type PoolFilter = 'all' | 'active' | 'ending-soon' | 'ended'

export interface ProfileStakePool {
  key: React.Key
  _id: string
  poolName: string
  stakeTokenName: string
  rewardTokenName: string
  stakeTokenImage: string
  rewardTokenImage: string
  tvl: string
  apr: string
  userStaked: string
  reward: string
  endsIn: string
  lockDays: number
  stakingContractId: number
  stakeTokenId: number
  rewardTokenId: number
  isCreator: boolean
  endTime: number
  status: PoolStatus
  contractVersion: number
  lockPeriodSecs: number
  userStakeTime: number
}

const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946;

function computeStatus(endTime: number): PoolStatus {
  const now = Math.floor(Date.now() / 1000)
  if (endTime <= now) return 'ended'
  if (endTime - now <= 86400) return 'ending-soon'
  return 'active'
}

const FILTER_LABELS: { key: PoolFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'ending-soon', label: 'Ending Soon' },
  { key: 'ended', label: 'Ended' },
]

const PstakeTable: React.FC = () => {
  const { activeAddress } = useMultiChainWallet()
  const { chainId } = useChain()
  const [pools, setPools] = useState<ProfileStakePool[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<PoolFilter>('all')
  const api_base_url = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    if (activeAddress) {
      fetchUserStakingPools()
    } else {
      setPools([])
    }
  }, [activeAddress, chainId])

  const fetchUserStakingPools = async () => {
    if (!activeAddress) return
    setLoading(true)

    try {
      // Fetch all staking pools, staking token records, and legacy staker data in parallel
      const [allPoolsRes, stakingTokenRes, stakerDataRes] = await Promise.allSettled([
        axios.get(`${api_base_url}/staking/all`),
        axios.get(`${api_base_url}/stakingtoken/wallet/${activeAddress}`),
        axios.get(`${api_base_url}/stakerdata/${activeAddress}`),
      ])

      const allPools = allPoolsRes.status === 'fulfilled' ? allPoolsRes.value.data?.data || [] : []
      const stakingTokenRecords = stakingTokenRes.status === 'fulfilled' ? stakingTokenRes.value.data?.data || [] : []
      const stakerRecords = stakerDataRes.status === 'fulfilled' ? stakerDataRes.value.data?.data || [] : []

      // Build a set of pool IDs where the user has staked (merge both sources)
      // Include both _id and appId/stakingContractId matches for robustness
      const stakedPoolIds = new Set([
        ...stakingTokenRecords.map((r: any) => r.poolId),
        ...stakerRecords.map((r: any) => r.poolId),
      ])
      const stakedAppIds = new Set([
        ...stakingTokenRecords.map((r: any) => String(r.appId || r.stakingContractId)).filter(Boolean),
        ...stakerRecords.map((r: any) => String(r.appId || r.stakingContractId)).filter(Boolean),
      ])
      // Build a map of poolId -> stakedAmount for display (take MAX per source, then greater of the two)
      const stakerMaxMap: Record<string, number> = {}
      stakerRecords.forEach((r: any) => {
        const amt = r.stakedAmount || 0
        stakerMaxMap[r.poolId] = Math.max(stakerMaxMap[r.poolId] || 0, amt)
      })
      const tokenMaxMap: Record<string, number> = {}
      stakingTokenRecords.forEach((r: any) => {
        const amt = r.totalStaked || 0
        tokenMaxMap[r.poolId] = Math.max(tokenMaxMap[r.poolId] || 0, amt)
      })
      const stakedAmountMap: Record<string, number> = {}
      const allPoolKeys = new Set([...Object.keys(stakerMaxMap), ...Object.keys(tokenMaxMap)])
      allPoolKeys.forEach((poolId) => {
        stakedAmountMap[poolId] = Math.max(stakerMaxMap[poolId] || 0, tokenMaxMap[poolId] || 0)
      })

      // Build image map from TokenService (DB → Pera → Tinyman fallback chain)
      const imageMap: Record<string, string> = {}
      try {
        const tokens = await tokenServiceInstance.fetchAllTokens()
        tokens.forEach(t => { imageMap[t.id.toString()] = t.image })
      } catch (e) {
        console.warn('Failed to fetch token images:', e)
      }

      const now = Math.floor(Date.now() / 1000)

      // Filter pools: user created them OR user has staked in them
      const userPools = allPools.filter((pool: any) => {
        const isCreator = pool.creatorId?.toLowerCase() === activeAddress.toLowerCase()
        const hasStaked = stakedPoolIds.has(pool._id) || stakedAppIds.has(String(pool.stakingContractId || pool.appId))
        return isCreator || hasStaked
      })

      // Fetch on-chain staker data for each pool the user participates in
      const onChainDataMap: Record<number, { stakedAmount: number; stakeTime: number }> = {}
      await Promise.allSettled(
        userPools.map(async (pool: any) => {
          try {
            const contractId = Number(pool.stakingContractId)
            if (!contractId || !activeAddress) return
            const data = await getUserData(contractId, activeAddress)
            onChainDataMap[contractId] = {
              stakedAmount: Number(data.stakedAmount),
              stakeTime: Number(data.stakeTime),
            }
          } catch {
            // User may not have a box (e.g., creator-only, or box deleted after full unstake)
          }
        })
      )

      // Fetch real prices for all stake tokens
      const asaIds = [...new Set(userPools.map((p: any) =>
        Number(p?.stakeToken?.id ?? p?.stakeTokenId)
      ).filter((id: number) => !isNaN(id) && id > 0))] as number[]

      let priceMap: Record<string, number> = {}
      try {
        priceMap = await fetchChainPriceMap(asaIds, chainId)
      } catch (err) {
        console.error('Failed to fetch live prices:', err)
      }

      const mapped: ProfileStakePool[] = userPools.map((pool: any, index: number) => {
        const endTime = pool.stakingEndTime || 0
        const secondsLeft = endTime - now
        const daysLeft = Math.floor(secondsLeft / 86400)
        const isCreator = pool.creatorId?.toLowerCase() === activeAddress.toLowerCase()

        const stakeTokenId = (pool?.stakeToken?.id ?? pool?.stakeTokenId)?.toString()
        const rewardTokenId = (pool?.rewardToken?.id ?? pool?.rewardTokenId)?.toString()

        const stakeTokenImage = imageMap[stakeTokenId] || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${stakeTokenId}/icon.png`)
        const rewardTokenImage = imageMap[rewardTokenId] || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${rewardTokenId}/icon.png`)

        // Use on-chain data when available, fall back to MongoDB
        const contractId = Number(pool.stakingContractId)
        const onChainData = onChainDataMap[contractId]
        const userStakedMicro = onChainData?.stakedAmount ?? (stakedAmountMap[pool._id] || stakedAmountMap[String(pool.stakingContractId)] || 0)

        const usdPrice = priceMap[stakeTokenId] ?? 0
        const tvlUsd = (pool.totalAmountStaked || 0) * usdPrice

        return {
          key: index,
          _id: pool._id,
          poolName: `Stake ${pool?.stakeToken?.name || 'Token'}`,
          stakeTokenName: pool?.stakeToken?.name || 'Token',
          rewardTokenName: pool?.rewardToken?.name || 'Token',
          stakeTokenImage,
          rewardTokenImage,
          tvl: `$${Number(tvlUsd.toFixed(6)).toString()}`,
          apr: `${pool.aprRate || 0}%`,
          userStaked: userStakedMicro > 0 ? `${(userStakedMicro / 1_000_000).toFixed(3)}` : '0',
          reward: onChainData && onChainData.stakedAmount > 0 && pool.aprRate
            ? `${((onChainData.stakedAmount * (pool.aprRate / 100) * ((now - onChainData.stakeTime) / 31104000)) / 1_000_000).toFixed(3)}`
            : '0',
          endsIn: daysLeft >= 0 ? `${Math.max(daysLeft, 1)} ${Math.max(daysLeft, 1) === 1 ? 'day' : 'days'}` : 'Ended',
          lockDays: Math.floor((pool.lockPeriod || 0) / 86400),
          stakingContractId: Number(pool.stakingContractId),
          stakeTokenId: Number(stakeTokenId) ?? FRY_ASSET_ID,
          rewardTokenId: Number(rewardTokenId) ?? FRY_ASSET_ID,
          isCreator,
          endTime,
          status: computeStatus(endTime),
          contractVersion: pool.contractVersion || 1,
          lockPeriodSecs: pool.lockPeriod || 0,
          userStakeTime: onChainData?.stakeTime || 0,
        }
      })

      setPools(mapped)
    } catch (error) {
      console.error('Error fetching user staking pools:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full m-auto flex flex-col gap-[16px]">
      {/* Sub-tab pills */}
      <div className="flex justify-center">
        <div className="switcher flex justify-center items-center gap-[3px] w-fit max-sm:w-full overflow-x-auto p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
          {FILTER_LABELS.map(({ key, label }) => (
            <p
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`${
                activeFilter === key ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[60px] max-sm:px-2 h-[38px] max-sm:h-[34px] text-[14px] max-sm:text-[12px] whitespace-nowrap`}
            >
              {label}
            </p>
          ))}
        </div>
      </div>

      <P_STable data={pools} loading={loading} activeFilter={activeFilter} onRefresh={fetchUserStakingPools} />
    </div>
  )
}

export default PstakeTable
