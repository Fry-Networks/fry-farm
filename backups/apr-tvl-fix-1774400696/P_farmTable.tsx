import React, { useEffect, useState } from 'react'
import { useWallet } from '@txnlab/use-wallet'
import axios from 'axios'
import P_FTable from './P_fTable'
import { tokenServiceInstance } from '../../../../services/TokenService'
import { getUserStakeForPool } from '../../../../farming_func'

export type FarmStatus = 'active' | 'ending-soon' | 'ended'
export type FarmFilter = 'all' | 'active' | 'ending-soon' | 'ended'

export interface ProfileFarmPool {
  key: React.Key
  _id: string
  pairName: string
  tokenAName: string
  tokenBName: string
  rewardTokenName: string
  tokenAImage: string
  tokenBImage: string
  rewardTokenImage: string
  tvl: string
  apr: string
  endsIn: string
  dexProvider: string
  endTime: number
  status: FarmStatus
  isCreator: boolean
  appId: number
  rewardTokenId: number
  stakeTokenId: number
  userStaked: string
  reward: string
}

function computeStatus(endTime: number): FarmStatus {
  const now = Math.floor(Date.now() / 1000)
  if (endTime <= now) return 'ended'
  if (endTime - now <= 86400) return 'ending-soon'
  return 'active'
}

const FILTER_LABELS: { key: FarmFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'ending-soon', label: 'Ending Soon' },
  { key: 'ended', label: 'Ended' },
]

const P_FarmTable: React.FC = () => {
  const { activeAddress, signer } = useWallet()
  const [pools, setPools] = useState<ProfileFarmPool[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FarmFilter>('all')
  const api_base_url = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    if (activeAddress) {
      fetchUserFarms()
    } else {
      setPools([])
    }
  }, [activeAddress])

  const fetchUserFarms = async () => {
    if (!activeAddress) return
    setLoading(true)

    try {
      // Fetch all farms, staking farming token records, and legacy claim records in parallel
      const [allFarmsRes, farmTokenRes, claimDataRes] = await Promise.allSettled([
        axios.get(`${api_base_url}/farming/all`),
        axios.get(`${api_base_url}/stakingfarmingtoken/wallet/${activeAddress}`),
        axios.get(`${api_base_url}/claimfarmrewards/wallet/${activeAddress}`),
      ])

      const allFarms = allFarmsRes.status === 'fulfilled' ? allFarmsRes.value.data?.data || [] : []
      const farmTokenRecords = farmTokenRes.status === 'fulfilled' ? farmTokenRes.value.data?.data || [] : []
      const claimRecords = claimDataRes.status === 'fulfilled' ? claimDataRes.value.data?.data || [] : []

      // stakeFarmingTokens.poolId = appId (number), so match against farm.appId
      const participatedAppIds = new Set(farmTokenRecords.map((r: any) => String(r.poolId)))
      // Legacy claim records use farm._id — ensure String coercion for consistent matching
      const claimedFarmPoolIds = new Set(claimRecords.map((r: any) => String(r.poolId)))

      // Build image map from TokenService (DB → Pera → Tinyman fallback chain)
      const imageMap: Record<string, string> = {}
      try {
        const tokens = await tokenServiceInstance.fetchAllTokens()
        tokens.forEach(t => { imageMap[t.id.toString()] = t.image })
      } catch (e) {
        console.warn('Failed to fetch token images:', e)
      }

      const now = Math.floor(Date.now() / 1000)

      // Filter: user created them OR user has participated (staked or claimed)
      const userFarms = allFarms.filter((farm: any) => {
        const isCreator = farm.creatorId?.toLowerCase() === activeAddress.toLowerCase()
        const hasParticipated = participatedAppIds.has(String(farm.appId)) || claimedFarmPoolIds.has(String(farm._id))
        return isCreator || hasParticipated
      })

      // Fetch on-chain stake data for each pool in parallel
      const onChainDataMap: Record<number, { staked: number; reward: number }> = {}
      if (signer) {
        await Promise.allSettled(
          userFarms.map(async (farm: any) => {
            try {
              if (!farm.appId || !activeAddress) return
              const data = await getUserStakeForPool(farm.appId, activeAddress, signer)
              if (data) onChainDataMap[farm.appId] = { staked: data.staked, reward: data.reward }
            } catch {}
          })
        )
      }

      const mapped: ProfileFarmPool[] = userFarms.map((farm: any, index: number) => {
        const endTime = farm.farmEndTime || 0
        const endsIn = Math.max(0, endTime - now)
        const endsInDays = Math.ceil(endsIn / 86400)
        const isCreator = farm.creatorId?.toLowerCase() === activeAddress.toLowerCase()

        const tokenAId = farm.lpToken?.tokenAId?.toString() || farm.lpToken?.tokenA?.toString()
        const tokenBId = farm.lpToken?.tokenBId?.toString() || farm.lpToken?.tokenB?.toString()
        const rewardTokenId = farm.rewardToken?.id?.toString() || farm.rewardTokenId?.toString()

        return {
          key: index,
          _id: farm._id,
          pairName: farm.lpPairName || `${farm.lpToken?.tokenA} / ${farm.lpToken?.tokenB}`,
          tokenAName: farm.lpToken?.tokenA || 'Token A',
          tokenBName: farm.lpToken?.tokenB || 'Token B',
          rewardTokenName: farm.rewardTokenSymbol || farm.rewardToken?.name || 'Token',
          tokenAImage: imageMap[tokenAId] || `https://asa-list.tinyman.org/assets/${tokenAId}/icon.png`,
          tokenBImage: imageMap[tokenBId] || `https://asa-list.tinyman.org/assets/${tokenBId}/icon.png`,
          rewardTokenImage: imageMap[rewardTokenId] || `https://asa-list.tinyman.org/assets/${rewardTokenId}/icon.png`,
          tvl: `$${farm.totalStaked || 0}`,
          apr: `${farm.aprRate || 0}%`,
          endsIn: endsInDays > 0 ? `${endsInDays} ${endsInDays === 1 ? 'day' : 'days'}` : 'Ended',
          dexProvider: farm.dexProvider || '',
          endTime,
          status: computeStatus(endTime),
          isCreator,
          appId: farm.appId,
          rewardTokenId: Number(rewardTokenId) || 0,
          stakeTokenId: Number(farm.stakeTokenId || farm.lpToken?.tokenAId) || 0,
          userStaked: onChainDataMap[farm.appId]?.staked
            ? `${onChainDataMap[farm.appId].staked.toFixed(6)}`
            : '0',
          reward: onChainDataMap[farm.appId]?.reward
            ? `${onChainDataMap[farm.appId].reward.toFixed(3)}`
            : '0',
        }
      })

      setPools(mapped)
    } catch (error) {
      console.error('Error fetching user farming pools:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full m-auto flex flex-col gap-[16px]">
      {/* Sub-tab pills */}
      <div className="flex justify-center">
        <div className="switcher flex justify-center items-center gap-[3px] w-fit p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
          {FILTER_LABELS.map(({ key, label }) => (
            <p
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`${
                activeFilter === key ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] h-[38px] text-[14px]`}
            >
              {label}
            </p>
          ))}
        </div>
      </div>

      <P_FTable data={pools} loading={loading} activeFilter={activeFilter} onRefresh={fetchUserFarms} />
    </div>
  )
}

export default P_FarmTable
