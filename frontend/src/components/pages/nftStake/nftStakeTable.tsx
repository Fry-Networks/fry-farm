import { Icon } from '@iconify/react'
import { Spin } from 'antd'
import React, { useEffect, useState } from 'react'
import CreateNftPoolWizard from '../../../Modals/website/CreateNftPoolWizard'
import Button from '../../shared/button'
import NftTable from './nftTable'
import { getAllNftPools } from '../../../services/nftStakingApi'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import { getNftMetadata, getArc72CollectionMeta } from '../../../services/nftCollectionService'
import { lookupNfd } from '../../../services/nfdService'
import { useChain } from '../../../context/ChainContext'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import axios from 'axios'
import type { NftStakingPool } from '../../../types/nftStaking'

const REWARD_MODEL_MAP: Record<string, number> = { fixed_rate: 0, proportional: 1, apr: 2 }

type TabOption = 'MyLive' | 'MyEnded' | 'Live' | 'Ended' | 'All'

const NftStakeTable: React.FC = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [pools, setPools] = useState<NftStakingPool[]>([])
  const [filteredPools, setFilteredPools] = useState<NftStakingPool[]>([])
  const [activeTab, setActiveTab] = useState<TabOption>('Live')
  const [loading, setLoading] = useState(true)
  const [searchToken, setSearchToken] = useState('')
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({})

  const { activeAddress } = useMultiChainWallet()
  const { chainId, activeChain } = useChain()

  const fetchPools = async () => {
    try {
      const [data, tokens] = await Promise.all([
        getAllNftPools(),
        tokenService.fetchAllTokens(),
      ])

      // Build token image map for NftTable reward badge
      const imageMap: Record<string, string> = {}
      tokens.forEach((token) => {
        if (token.image) imageMap[token.id.toString()] = token.image
      })
      setTokenImages(imageMap)

      // Map backend field names to interface field names
      const mapped = data.map((raw: any) => ({
        ...raw,
        poolName: raw.name ?? raw.poolName ?? '',
        poolDescription: raw.description ?? raw.poolDescription ?? '',
        poolImage: raw.imageUrl ?? raw.poolImage ?? '',
        nftValue: raw.nftValueInRewardToken ?? raw.nftValue ?? 0,
        rewardModel: typeof raw.rewardModel === 'string'
          ? REWARD_MODEL_MAP[raw.rewardModel] ?? 0
          : raw.rewardModel,
        rewardTokenName: tokens.find(t => t.id === raw.rewardTokenId)?.symbol || '',
        rewardTokenImage: tokens.find(t => t.id === raw.rewardTokenId)?.image || '',
      })) as NftStakingPool[]

      setPools(mapped)
      enrichPools(mapped)
    } catch (error) {
      console.error('Error fetching NFT pools:', error)
    }
  }

  const isGenericName = (name: string) => {
    if (!name || name.trim() === '') return true
    if (name.includes('...')) return true
    const lower = name.toLowerCase().trim()
    if (['nft pool', 'nft staking', 'nft farm'].includes(lower)) return true
    if (/^arc-72 pool\s*#?\d*$/i.test(name.trim())) return true
    return false
  }

  // For pools missing an image or with generic names, enrich from NFT metadata / NFD
  const enrichPools = async (poolList: NftStakingPool[]) => {
    const needsImage = poolList.filter(p => !p.poolImage)
    const needsName = poolList.filter(p => isGenericName(p.poolName))
    if (needsImage.length === 0 && needsName.length === 0) return

    const imageUpdates: Record<number, string> = {}
    const nameUpdates: Record<number, string> = {}

    // Enrich images + extract collection names from metadata
    await Promise.allSettled(
      needsImage.map(async (pool) => {
        try {
          // ARC-72 pools on Voi: collectionCreator is a short numeric contract ID
          if (chainId === 'voi-mainnet' && pool.collectionCreator?.trim().length > 0 && pool.collectionCreator.trim().length < 58) {
            const meta = await getArc72CollectionMeta(Number(pool.collectionCreator.trim()))
            if (meta?.imageUrl) imageUpdates[pool.appId] = meta.imageUrl
            if (meta?.name && isGenericName(pool.poolName)) {
              nameUpdates[pool.appId] = `${meta.name} NFT Staking`
            }
            return
          }

          let asaId: number | null = null
          if (pool.collectionCreator?.trim().length >= 58) {
            const res = await axios.get(
              `${(activeChain.connection as any).indexerServer || 'https://mainnet-idx.4160.nodely.dev'}/v2/accounts/${pool.collectionCreator.trim()}/created-assets?limit=1`,
              { timeout: 10000 },
            )
            asaId = res.data?.assets?.[0]?.index ?? null
          } else if (pool.whitelistedAsaIds?.length > 0) {
            asaId = pool.whitelistedAsaIds[0]
          }
          if (asaId) {
            const meta = await getNftMetadata(asaId, chainId)
            if (meta.imageUrl) imageUpdates[pool.appId] = meta.imageUrl
            if (meta.name && isGenericName(pool.poolName)) {
              const collName = meta.name.replace(/\s*#\d+$/, '').trim()
              if (collName) nameUpdates[pool.appId] = `${collName} NFT Staking`
            }
          }
        } catch { /* skip */ }
      }),
    )

    // For pools still needing names (not resolved by metadata), try ARC-72 lookup or NFD
    const stillNeedsName = needsName.filter(p => !nameUpdates[p.appId])
    if (stillNeedsName.length > 0) {
      // ARC-72 pools on Voi: resolve names via NFT Navigator
      if (chainId === 'voi-mainnet') {
        await Promise.allSettled(
          stillNeedsName
            .filter(p => p.collectionCreator?.trim().length > 0 && p.collectionCreator.trim().length < 58)
            .map(async (pool) => {
              try {
                const meta = await getArc72CollectionMeta(Number(pool.collectionCreator!.trim()))
                if (meta?.name) nameUpdates[pool.appId] = `${meta.name} NFT Staking`
              } catch { /* skip */ }
            }),
        )
      }
      const uniqueCreators = [...new Set(stillNeedsName.filter(p => !nameUpdates[p.appId]).map(p => p.collectionCreator?.trim()).filter(a => a && a.length >= 58))]
      const nfdResults = await Promise.allSettled(uniqueCreators.map(addr => lookupNfd(addr)))
      const nfdMap = new Map<string, string>()
      uniqueCreators.forEach((addr, i) => {
        const result = nfdResults[i]
        if (result.status === 'fulfilled' && result.value) nfdMap.set(addr, result.value)
      })
      stillNeedsName.forEach(pool => {
        const addr = pool.collectionCreator?.trim()
        if (addr && nfdMap.has(addr)) {
          nameUpdates[pool.appId] = `${nfdMap.get(addr)} NFT Staking`
        }
      })
    }

    if (Object.keys(imageUpdates).length > 0 || Object.keys(nameUpdates).length > 0) {
      setPools(prev => prev.map(p => {
        const updated = { ...p }
        if (imageUpdates[p.appId]) updated.poolImage = imageUpdates[p.appId]
        if (nameUpdates[p.appId]) updated.poolName = nameUpdates[p.appId]
        return updated
      }))
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchPools()
      setLoading(false)
    }
    loadData()
  }, [chainId])

  // Filter pools by tab + search
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000)

    const filtered = pools.filter((pool) => {
      const isEnded = pool.poolEndTime > 0 && pool.poolEndTime <= now
      const isLive = pool.isActive && (!pool.poolEndTime || pool.poolEndTime > now)
      const belongsToWallet = pool.creatorId?.toLowerCase() === activeAddress?.toLowerCase()

      switch (activeTab) {
        case 'MyLive':
          return isLive && belongsToWallet
        case 'MyEnded':
          return isEnded && belongsToWallet
        case 'Live':
          return isLive
        case 'Ended':
          return isEnded
        case 'All':
          return true
        default:
          return true
      }
    })

    // Search filter
    const searched = searchToken.trim()
      ? filtered.filter(
          (p) =>
            p.poolName?.toLowerCase().includes(searchToken.toLowerCase()) ||
            p.rewardTokenName?.toLowerCase().includes(searchToken.toLowerCase()) ||
            p.collectionCreator?.toLowerCase().includes(searchToken.toLowerCase()),
        )
      : filtered

    setFilteredPools(searched)
  }, [pools, activeTab, activeAddress, searchToken, chainId])

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchToken(event.target.value)
  }

  return (
    <>
      <div className="w-full mt-[40px] mb-[47px] flex-1">
        <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[16px]">
          {/* Tabs */}
          <div className="top flex max-md:flex-col justify-between items-center gap-[20px]">
            <div className="flex w-full justify-center md:justify-start">
              <div className="switcher flex flex-wrap justify-center md:flex-nowrap gap-[8px] p-[8px] bg-[var(--bg-card)] rounded-[12px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)] overflow-x-auto max-w-full">
                {(['MyLive', 'MyEnded', 'Live', 'Ended', 'All'] as TabOption[]).map((tab) => {
                  const isMyTab = tab === 'MyLive' || tab === 'MyEnded'
                  const isDisabled = isMyTab && !activeAddress
                  return (
                    <p
                      key={tab}
                      className={`${
                        activeTab === tab
                          ? 'text-white linearGradient shadow-md'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                      } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-center text-center tracking-[0.09px] rounded-[10px] px-[16px] min-w-[120px] h-[40px] text-[14px] whitespace-nowrap transition-all duration-200`}
                      onClick={() => !isDisabled && setActiveTab(tab)}
                    >
                      {{
                        MyLive: 'My Live',
                        MyEnded: 'My Ended',
                        Live: 'Live Pools',
                        Ended: 'Ended Pools',
                        All: 'All Pools',
                      }[tab]}
                    </p>
                  )
                })}
              </div>
            </div>

            {/* Search + Create */}
            <div className="flex flex-col md:items-end gap-[14px] w-full">
              <div className="flex justify-center md:justify-end">
                <Button
                  text="Create NFT Pool"
                  onClick={() => setIsCreateOpen(true)}
                  img="ic:sharp-add"
                  className="button btn-red-border w-[250px] md:w-[200px]"
                  height={45}
                  clr="text-red"
                />
              </div>
              <div className="max-w-[398px] max-md:max-w-[250px] w-full mx-auto md:mx-0 py-[12px] px-[8px] flex items-center gap-[8px] rounded-[12px] bg-[var(--bg-card)] shadow">
                <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                <input
                  type="search"
                  placeholder="Search NFT pool"
                  className="w-full"
                  value={searchToken}
                  onChange={handleSearchChange}
                />
              </div>
            </div>
          </div>

          <div className="w-full mt-1">
            <p className="text-sm text-gray-500">
              {{
                MyLive: 'Showing your active NFT staking pools.',
                MyEnded: 'Showing your ended NFT staking pools.',
                Live: 'Showing active NFT staking pools.',
                Ended: 'Showing ended NFT staking pools.',
                All: 'Showing all NFT staking pools.',
              }[activeTab]}
            </p>
          </div>

          {/* Pool List */}
          <div className="bottom">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Spin size="large" />
              </div>
            ) : filteredPools.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 bg-[var(--bg-card)] rounded-lg shadow-sm">
                <Icon icon="mdi:folder-open-outline" className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-[var(--text-heading)] mb-2">No Pools Found</h3>
                <p className="text-gray-500 text-center">There are currently no NFT staking pools available in this category.</p>
              </div>
            ) : (
              <NftTable
                pools={filteredPools}
                fetchData={fetchPools}
                tokenImages={tokenImages}
                activeTab={activeTab}
              />
            )}
          </div>
        </div>
      </div>
      <CreateNftPoolWizard isOpen={isCreateOpen} setIsOpen={setIsCreateOpen} fetchData={fetchPools} />
    </>
  )
}

export default NftStakeTable
