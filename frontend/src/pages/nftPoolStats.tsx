import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import PageBg from '../components/shared/pageBg'
import { getNftPoolByAppId } from '../services/nftStakingApi'
import { getStakedNftsByPool } from '../services/nftStakingApi'
import { tokenServiceInstance as tokenService } from '../services/TokenService'
import { getNftMetadata } from '../services/nftCollectionService'
import { lookupNfd } from '../services/nfdService'
import axios from 'axios'
import type { NftStakingPool, StakedNft } from '../types/nftStaking'
import { Spin } from 'antd'
import { useChain } from '../context/ChainContext'

const REWARD_MODEL_MAP: Record<string, number> = { fixed_rate: 0, proportional: 1, apr: 2 }

const NftPoolStats = () => {
  const [searchParams] = useSearchParams()
  const { chainId } = useChain()
  const appId = Number(searchParams.get('appId'))
  const [pool, setPool] = useState<NftStakingPool | null>(null)
  const [stakedNfts, setStakedNfts] = useState<StakedNft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!appId) return
    const load = async () => {
      try {
        const [poolData, stakes, tokens] = await Promise.all([
          getNftPoolByAppId(appId),
          getStakedNftsByPool(appId),
          tokenService.fetchAllTokens(),
        ])

        // Map backend field names to interface field names
        const raw = poolData as any
        const mapped = {
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
        } as NftStakingPool

        setPool(mapped)
        setStakedNfts(stakes)

        // Enrich pool name if generic
        const isGeneric = !mapped.poolName || mapped.poolName.trim() === ''
          || mapped.poolName.includes('...')
          || ['nft pool', 'nft staking', 'nft farm'].includes(mapped.poolName.toLowerCase().trim())

        // Enrich pool image (and possibly name) if missing
        let nameResolved = false
        if (!mapped.poolImage) {
          try {
            let asaId: number | null = null
            if (mapped.collectionCreator?.trim().length >= 58) {
              const res = await axios.get(
                `https://mainnet-idx.4160.nodely.dev/v2/accounts/${mapped.collectionCreator.trim()}/created-assets?limit=1`,
                { timeout: 10000 },
              )
              asaId = res.data?.assets?.[0]?.index ?? null
            } else if (mapped.whitelistedAsaIds?.length > 0) {
              asaId = mapped.whitelistedAsaIds[0]
            }
            if (asaId) {
              const meta = await getNftMetadata(asaId)
              if (meta.imageUrl) setPool(prev => prev ? { ...prev, poolImage: meta.imageUrl } : prev)
              if (isGeneric && meta.name) {
                const collName = meta.name.replace(/\s*#\d+$/, '').trim()
                if (collName) {
                  nameResolved = true
                  setPool(prev => prev ? { ...prev, poolName: `${collName} NFT Staking` } : prev)
                }
              }
            }
          } catch { /* skip */ }
        }

        // NFD fallback for generic names
        if (isGeneric && !nameResolved && mapped.collectionCreator?.trim().length >= 58) {
          try {
            const nfd = await lookupNfd(mapped.collectionCreator.trim())
            if (nfd) setPool(prev => prev ? { ...prev, poolName: `${nfd} NFT Staking` } : prev)
          } catch { /* skip */ }
        }
      } catch (err) {
        console.error('Error loading pool stats:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [appId])

  const REWARD_MODELS = ['Fixed Rate', 'Proportional', 'APR']
  const COLLECTION_MODES = ['Creator Address', 'Whitelist', 'Both']

  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <div className="w-full mt-[40px] mb-[47px] flex-1">
          <div className="max-xxxl:w-[95%] w-[80%] m-auto">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Spin size="large" />
              </div>
            ) : !pool ? (
              <div className="text-center py-20">
                <h3 className="text-xl font-semibold text-[var(--text-heading)]">Pool Not Found</h3>
                <p className="text-gray-500 mt-2">Could not find NFT staking pool with App ID: {appId}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                  {pool.poolImage && (
                    <img src={pool.poolImage} alt={pool.poolName} className="w-16 h-16 rounded-full object-cover" />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-[var(--text-primary)] font-apex">{pool.poolName}</h2>
                    <p className="text-sm text-[var(--text-secondary)]">{pool.poolDescription}</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">NFTs Staked</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{pool.totalNftsStaked}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Reward Model</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{REWARD_MODELS[pool.rewardModel] || 'Unknown'}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Collection Mode</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{COLLECTION_MODES[pool.collectionMode] || 'Unknown'}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded-xl p-4 shadow">
                    <p className="text-sm text-[var(--text-secondary)]">Reward Token</p>
                    <p className="text-xl font-bold text-[var(--text-primary)]">{pool.rewardTokenName}</p>
                  </div>
                </div>

                {/* Pool Details */}
                <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                  <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Pool Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">App ID</span>
                      <a
                        href={`https://explorer.perawallet.app/application/${pool.appId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {pool.appId}
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Creator</span>
                      <span className="text-[var(--text-primary)] text-sm">{pool.creatorId.slice(0, 8)}...{pool.creatorId.slice(-6)}</span>
                    </div>
                    {pool.rewardModel === 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Rate Per Day</span>
                        <span className="text-[var(--text-primary)]">{pool.ratePerDay.toLocaleString()} {pool.rewardTokenName}</span>
                      </div>
                    )}
                    {pool.rewardModel === 1 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Total Reward Pool</span>
                        <span className="text-[var(--text-primary)]">{pool.totalRewardPool.toLocaleString()} {pool.rewardTokenName}</span>
                      </div>
                    )}
                    {pool.rewardModel === 2 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">APR Rate</span>
                          <span className="text-green">{(pool.aprRate / 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-secondary)]">Value Per NFT</span>
                          <span className="text-[var(--text-primary)]">{(pool.valuePerNft / 1_000_000).toLocaleString()}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Lock Period</span>
                      <span className="text-[var(--text-primary)]">{pool.lockPeriod > 0 ? `${pool.lockPeriod / 86400} days` : 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Pool Ends</span>
                      <span className="text-[var(--text-primary)]">
                        {pool.poolEndTime ? new Date(pool.poolEndTime * 1000).toLocaleDateString() : 'No end date'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Status</span>
                      <span className={pool.isActive ? 'text-green' : 'text-red-500'}>{pool.isActive ? 'Active' : 'Paused'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Total Rewards Claimed</span>
                      <span className="text-[var(--text-primary)]">{pool.totalRewardsClaimed.toLocaleString()} {pool.rewardTokenName}</span>
                    </div>
                  </div>
                </div>

                {/* Staked NFTs */}
                <div className="bg-[var(--bg-card)] rounded-xl p-6 shadow">
                  <h4 className="text-lg font-bold text-[var(--text-primary)] mb-4">Staked NFTs ({stakedNfts.length})</h4>
                  {stakedNfts.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No NFTs currently staked in this pool.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {stakedNfts.map((nft) => (
                        <div key={nft._id} className="bg-[var(--bg-secondary)] rounded-lg p-2 text-center">
                          <img
                            src={nft.nftImage || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${nft.asaId}/icon.png`)}
                            alt={nft.nftName}
                            className="w-full aspect-square object-cover rounded-md mb-1"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjwvc3ZnPg==' }}
                          />
                          <p className="text-xs text-[var(--text-primary)] truncate">{nft.nftName}</p>
                          <p className="text-[10px] text-gray-500">{nft.wallet.slice(0, 4)}...{nft.wallet.slice(-4)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </>
  )
}

export default NftPoolStats
