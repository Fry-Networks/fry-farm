import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import axios from 'axios'
import { Spin } from 'antd'
import React, { useEffect, useState } from 'react'
import CreateStakeWizard from '../../../Modals/website/CreateStakeWizard'
import Button from '../../shared/button'
import STable from './sTable'
import Stakebanner from './stakebanner'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import { fetchChainPriceMap } from '../../../services/PriceService'
import { useChain } from '../../../context/ChainContext'
import { formatUsdAbbreviated } from '../../../utils/formatNumber'
import TokenImage from '../../shared/TokenImage'

const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946;

interface StakeTableProps {
  setTotals: (totals: { totalTvl: number; totalStaked: number; totalRewards: number }) => void
}
// Helper function to validate image URL (outside component to avoid recreation)
const isValidImageUrl = (url: string | undefined | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  // Check if it's a valid URL format
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    // If URL parsing fails, check if it's a relative path or data URL
    return url.startsWith('data:') || url.startsWith('/') || url.includes('.png') || url.includes('.jpg') || url.includes('.svg');
  }
};

const StakeTable: React.FC<StakeTableProps> = ({ setTotals }) => {
  const [isaddStakeOpen, setisaddStakeOpen] = useState(false)
  const [stacks, setStacks] = useState<any[]>([])
  const [originalData, setOriginalData] = useState<any[]>([])
  const [tvlData, setTvlData] = useState<{ [key: string]: number }>({}) // Token prices for TVL calculations
  const [tokenImages, setTokenImages] = useState<{ [key: string]: string }>({}) // Token images from database
  // const [activeTab, setActiveTab] = useState<'Live' | 'Ended' | 'All'>('Live')
  const api_base_url = import.meta.env.VITE_API_BASE_URL;

  type TabOption = 'MyLive' | 'MyEnded' | 'Live' | 'Ended' | 'All'
  const [activeTab, setActiveTab] = useState<TabOption>('Live')

  const [filteredData, setFilteredData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchToken, setSearchToken] = useState<string>('')
  const [userStakedPoolIds, setUserStakedPoolIds] = useState<Set<string>>(new Set())

  const { activeAddress } = useMultiChainWallet()
  const { chainId } = useChain()

  const onCreateStakeClick = () => {
    setisaddStakeOpen(true)
  }

  // Fetch token data from database (prices and images)
  const fetchTokenData = async (): Promise<{ priceMap: { [key: string]: number }, imageMap: { [key: string]: string } }> => {
    try {
      // Fetch all tokens from database
      const tokens = await tokenService.fetchAllTokens();
      
      // Build price map for TVL calculations
      const priceMap: { [key: string]: number } = {};
      const imageMap: { [key: string]: string } = {};
      
      tokens.forEach(token => {
        priceMap[token.id.toString()] = token.price ?? 0;
        // Only use database image if it's valid, otherwise use Tinyman fallback
        const dbImage = token.image;
        if (isValidImageUrl(dbImage)) {
          imageMap[token.id.toString()] = dbImage;
        } else {
          // Use Tinyman as default if database image is invalid (Algorand only)
          imageMap[token.id.toString()] = chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${token.id}.png` : `https://asa-list.tinyman.org/assets/${token.id}/icon.png`;
        }
      });
      
      setTvlData(priceMap);
      setTokenImages(imageMap);
      
      return { priceMap, imageMap };
    } catch (error) {
      console.error('Failed to fetch token data:', error);
      // Set default prices and images
      const emptyMap = {};
      setTvlData(emptyMap);
      setTokenImages(emptyMap);
      return { priceMap: emptyMap, imageMap: emptyMap };
    }
  };

  const calculateTotals = () => {
    // console.log('in calculate totals')
    // console.log(filteredData)

    const totalTvl = filteredData.reduce((sum, item) => {
      const tvlValue = parseFloat(item.tvl.replace('$', '').trim()) || 0
      return sum + tvlValue
    }, 0)

    const totalStaked = filteredData.reduce((sum, item) => {
      const tvlValue = parseFloat(item.staked.replace('$', '').trim()) || 0
      return sum + tvlValue
    }, 0)

    // const totalRewards = filteredData.reduce((sum, item) => {
    //   const tvlValue = parseFloat(item.tvlReward) || 0
    //   return sum + tvlValue
    // }, 0)

    const totalRewards = filteredData.reduce((sum, item) => {
      return sum + (item.rewardTokenAmount ? item.rewardTokenAmount / 1_000_000 : 0);
    }, 0);

    return { totalTvl, totalStaked, totalRewards }
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchToken(event.target.value)
  }

  useEffect(() => {
    // Only fetch pools when searchToken changes (not on initial tokenImages load)
    // Initial load is handled by the fetchTokenData useEffect
    if (Object.keys(tokenImages).length > 0 || searchToken) {
      const timer = setTimeout(() => {
        fetchAllPools()
      }, 800)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [searchToken, chainId])


  const fetchAllPools = async () => {
    try {
      const response = await axios.get(`${api_base_url}/staking/all`, {
        params: { tokenName: searchToken, chainId },
        headers: { 'Content-Type': 'application/json' },
      })
      // Pass tokenImages to processPoolData to ensure it uses the latest images
      processPoolData(response.data.data, tokenImages)
    } catch (error) {
      console.error('Error fetching all pools:', error)
    }
  }
// Price oracle functions moved to services/PriceService.ts
// Updated processPoolData to use database token data
const processPoolData = async (result: any[], images: { [key: string]: string } = {}, prices: { [key: string]: number } = {}) => {
  const databaseImages = images;

  const transformedData = result.map((item: any, index: number) => {
    const now = Math.floor(Date.now() / 1000)
    const secondsLeft = item.stakingEndTime - now
    const daysLeft = Math.floor(secondsLeft / 86400)

    const stakeTokenId = (item?.stakeToken?.id ?? item?.stakeTokenId)?.toString()
    const rewardTokenId = (item?.rewardToken?.id ?? item?.rewardTokenId)?.toString()
    
    // Use database images with fallback to Tinyman
    // Validate database images before using them
    const stakeDbImage = databaseImages[stakeTokenId];
    const rewardDbImage = databaseImages[rewardTokenId];
    
    const staketokenImage = (stakeDbImage && isValidImageUrl(stakeDbImage))
      ? stakeDbImage
      : (chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${stakeTokenId}.png` : `https://asa-list.tinyman.org/assets/${stakeTokenId}/icon.png`);
    const rewardtokenImage = (rewardDbImage && isValidImageUrl(rewardDbImage))
      ? rewardDbImage
      : (chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${rewardTokenId}.png` : `https://asa-list.tinyman.org/assets/${rewardTokenId}/icon.png`);

    const usdPrice = prices[stakeTokenId] ?? tvlData[stakeTokenId] ?? 0
    const tvlUsd = item.totalAmountStaked * usdPrice

    const displayApr = item.aprRate || 0

    return {
      _id: item._id,
      key: index + 1,
      pool: (
        <div className="flex items-center gap-[16px] w-[350px]">
          <div className="flex relative">
            <TokenImage
              tokenId={Number(rewardTokenId)}
              src={databaseImages[rewardTokenId] || ''}
              symbol={item?.rewardToken?.name || '?'}
              size={40}
              className="drop-shadow-md"
            />
            <TokenImage
              tokenId={Number(stakeTokenId)}
              src={databaseImages[stakeTokenId] || ''}
              symbol={item?.stakeToken?.name || '?'}
              size={40}
              className="drop-shadow-md z-50 -ml-4"
            />
          </div>
          <div className="flex flex-col">
            <h6 className="text-[var(--text-primary)] font-bold tracking-[0.1px]">Stake {item?.stakeToken?.name || 'Token'}</h6>
            <div className="flex items-center gap-1">
              <p className="text-green font-medium small">Earn {item?.rewardToken?.name || 'Token'}</p>
              {item?.isGated && (
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-medium flex items-center gap-0.5" title={item?.gateConfig?.gateMessage || 'NFT Gated'}>
                  <Icon icon="mdi:shield-lock-outline" width={10} height={10} />
                  {item?.gateConfig?.collectionName || 'NFT'}
                </span>
              )}
              {(!item.contractVersion || item.contractVersion === 1) && (
                <span className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-500 rounded text-[9px] font-medium">Legacy</span>
              )}
              {item.contractVersion === 2 && (
                <span className="px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded text-[9px] font-medium">V2</span>
              )}
              {item.contractVersion === 3 && (
                <span className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[9px] font-medium">V3</span>
              )}
              {item.contractVersion === 4 && (
                <span className="px-1.5 py-0.5 bg-purple-900/30 text-purple-400 rounded text-[9px] font-medium">V4</span>
              )}
            </div>
            <p className="text-text_clr small">with {item?.lockPeriod / 86400} days lock</p>
          </div>
        </div>
      ),
      tvl: formatUsdAbbreviated(tvlUsd),
      apr: `${Number(displayApr.toFixed(2))}%`,
      staked: `${Number(item.totalAmountStaked.toFixed(2)).toLocaleString()} ${item?.stakeToken?.name || 'tokens'}`,
      poolTime: item.duration / 86400,
      reward: (
        <div>
          <p className="text-text_clr text-[15px] font-medium">
            {(item.rewardTokenAmount / 1_000_000).toLocaleString()} {item?.rewardToken?.name || 'tokens'}
          </p>
          {item.contractVersion === 4 && item.rewardTokenAmountUsdc > 0 && (
            <p className="text-text_clr text-[12px] text-[var(--text-secondary)]">
              + {(item.rewardTokenAmountUsdc / 1_000_000).toLocaleString()} USDC
            </p>
          )}
        </div>
      ),
      rewardTokenAmount: item.rewardTokenAmount,
      ends: (
        <p className="text-text_clr small font-medium">
          {daysLeft >= 0 ? `${Math.max(daysLeft, 1)} ${Math.max(daysLeft, 1) === 1 ? 'day' : 'days'}` : 'Ended'}
        </p>
      ),
      stakingContractId: Number(item.stakingContractId),
      stakingTime: item.stakingTime,
      stakingEndTime: item.stakingEndTime,
      totalAmountStaked: item.totalAmountStaked,
      userAddress: item.creatorId,
      isCreator: item.creatorId?.toLowerCase() === activeAddress?.toLowerCase(),
      hasUserStake: userStakedPoolIds.has(String(item.stakingContractId)),
      isGated: item.isGated || false,
      gateConfig: item.gateConfig || {},
      stakeTokenId: Number(stakeTokenId) ?? FRY_ASSET_ID,
      rewardTokenId: Number(rewardTokenId) ?? FRY_ASSET_ID,
      stakeTokenName: item?.stakeToken?.name || 'Token',
      rewardTokenName: item?.rewardToken?.name || 'Token',
      lockPeriod: item.lockPeriod || 0,
      contractVersion: item.contractVersion || 1,
    }
  })

  // Sort: V2 pools first, then by TVL descending within each version group
  transformedData.sort((a, b) => {
    const av = a.contractVersion || 1
    const bv = b.contractVersion || 1
    if (bv !== av) return bv - av
    const aTvl = parseFloat(a.tvl.replace(/[$,\s]/g, '')) || 0
    const bTvl = parseFloat(b.tvl.replace(/[$,\s]/g, '')) || 0
    return bTvl - aTvl
  })

  setOriginalData(transformedData)
}

  const handleTabSwitch = (tab: TabOption) => {
    setActiveTab(tab);
  };

  const filterPools = (data: any[]) => {
    const now = Math.floor(Date.now() / 1000)

    return data.filter((item) => {
      const isEnded = item.stakingEndTime <= now
      const isLive = item.stakingEndTime > now || item.contractVersion === 4
      const belongsToWallet = item.isCreator || item.hasUserStake

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
  }


  // Re-filter when user stake data changes
  useEffect(() => {
    if (userStakedPoolIds.size > 0 && originalData.length > 0) {
      // Update hasUserStake flags in existing data
      const updated = originalData.map(item => ({
        ...item,
        isCreator: item.userAddress?.toLowerCase() === activeAddress?.toLowerCase(),
        hasUserStake: userStakedPoolIds.has(String(item.stakingContractId)),
      }))
      setOriginalData(updated)
    }
  }, [userStakedPoolIds])

  useEffect(() => {
    const filtered = filterPools(originalData)
    setFilteredData(filtered)
  }, [originalData, activeTab, activeAddress])

  useEffect(() => {
    const totals = calculateTotals()
    setTotals(totals)
    setStacks(filteredData)
  }, [filteredData])

  // Fetch user's staked pool IDs when wallet connects
  useEffect(() => {
    if (!activeAddress) {
      setUserStakedPoolIds(new Set())
      return
    }
    const fetchUserStakes = async () => {
      try {
        const [stakeRes, withdrawRes] = await Promise.all([
          axios.get(`${api_base_url}/stakingtoken/wallet/${activeAddress}`),
          axios.get(`${api_base_url}/withdraw/wallet/${activeAddress}`),
        ])
        const stakes = stakeRes.data?.data || []
        const withdrawals = withdrawRes.data?.data || []

        // Sum withdrawals per poolId
        const withdrawnByPool: Record<string, number> = {}
        for (const w of withdrawals) {
          const pid = String(w.poolId)
          withdrawnByPool[pid] = (withdrawnByPool[pid] || 0) + (w.tokens || 0)
        }

        // Only mark as staked if net position > 0
        const activePoolIds = new Set<string>(
          stakes
            .filter((r: any) => {
              const staked = (r.totalStaked || 0) / 1_000_000
              const withdrawn = withdrawnByPool[r.poolId] || 0
              return staked - withdrawn > 0
            })
            .map((r: any) => String(r.poolId))
        )
        setUserStakedPoolIds(activePoolIds)
      } catch {
        setUserStakedPoolIds(new Set())
      }
    }
    fetchUserStakes()
  }, [activeAddress, chainId])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { imageMap } = await fetchTokenData()
        const response = await axios.get(`${api_base_url}/staking/all`, {
          params: { tokenName: searchToken, chainId },
          headers: { 'Content-Type': 'application/json' },
        })
        const pools = response.data.data

        // Collect unique stake token ASA IDs and fetch real prices
        const asaIds = [...new Set(pools.map((p: any) =>
          Number(p?.stakeToken?.id ?? p?.stakeTokenId)
        ).filter((id: number) => !isNaN(id) && id > 0))] as number[]

        let realPrices: Record<string, number> = {}
        try {
          realPrices = await fetchChainPriceMap(asaIds, chainId)
          setTvlData(prev => ({ ...prev, ...realPrices }))
        } catch (err) {
          console.error('Failed to fetch live prices:', err)
        }

        processPoolData(pools, imageMap, realPrices)
      } catch (error) {
        console.error('Error fetching all pools:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [chainId])
  
  // Note: removed duplicate tokenImages refetch effect — initial load already passes imageMap directly


  // Lazy backend resolution: resolve images for pool tokens not in imageMap
  useEffect(() => {
    if (originalData.length === 0 || Object.keys(tokenImages).length === 0) return;
    
    const missingIds = new Set<string>();
    originalData.forEach((pool: any) => {
      const stId = String(pool.stakeTokenId);
      const rwId = String(pool.rewardTokenId);
      if (!tokenImages[stId]) missingIds.add(stId);
      if (!tokenImages[rwId]) missingIds.add(rwId);
    });
    
    if (missingIds.size === 0) return;
    
    const resolveImages = async () => {
      const updates: { [key: string]: string } = {};
      await Promise.allSettled(
        Array.from(missingIds).map(async (id) => {
          try {
            const resp = await axios.get(`${api_base_url}/token/${id}/image`, { timeout: 8000 });
            const url = resp.data?.imageUrl;
            if (url && typeof url === 'string' && url.startsWith('http')) {
              updates[id] = url;
            }
          } catch { /* skip */ }
        })
      );
      if (Object.keys(updates).length > 0) {
        setTokenImages(prev => ({ ...prev, ...updates }));
      }
    };
    resolveImages();
  }, [originalData]);

  return (
    <>
      <div className="w-full mt-[40px] mb-[47px] flex-1">
        {activeAddress && <Stakebanner wallet={activeAddress} />}
        <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[16px]">
          {activeAddress && originalData.some(p => (!p.contractVersion || p.contractVersion === 1) && p.hasUserStake) && (
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-yellow-400 font-medium text-sm">Migration Available</p>
                <p className="text-xs text-yellow-500/70">
                  You have positions in legacy pools. Migrate to V2 for improved reward calculations. Migration fees are waived!
                </p>
              </div>
            </div>
          )}
          {/* Tabs */}
          <div className="top flex max-md:flex-col justify-between items-center gap-[20px]">
            <div className="flex w-full justify-center md:justify-start">
              <div className="switcher flex flex-wrap justify-center md:flex-nowrap gap-[8px] p-[8px] bg-[var(--bg-card)] rounded-[12px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)] overflow-x-auto max-w-full">
                {(['MyLive', 'MyEnded', 'Live', 'Ended', 'All'] as TabOption[]).map((tab) => {
                  const isMyTab = tab === 'MyLive' || tab === 'MyEnded';
                  const isDisabled = isMyTab && !activeAddress;
                  return (
                    <p
                      key={tab}
                      className={`${activeTab === tab
                        ? 'text-white linearGradient shadow-md'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                      } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-center text-center tracking-[0.09px] rounded-[10px] px-[16px] min-w-[120px] h-[40px] text-[14px] whitespace-nowrap transition-all duration-200`}
                      onClick={() => !isDisabled && handleTabSwitch(tab)}
                    >
                      {{
                        MyLive: 'My Live',
                        MyEnded: 'My Ended',
                        Live: 'Live Pools',
                        Ended: 'Ended Pools',
                        All: 'All Pools',
                      }[tab]}
                    </p>
                  );
                })}
              </div>
            </div>


            {/* Search + Create Stake */}
            <div className="flex flex-col md:items-end gap-[14px] w-full">
              <div className="flex justify-center md:justify-end">
                <Button
                  text="Create Stake"
                  onClick={onCreateStakeClick}
                  img="ic:sharp-add"
                  className="button btn-red-border w-[250px] md:w-[180px]"
                  height={45}
                  clr="text-red"
                />
              </div>
              <div className="max-w-[398px] max-md:max-w-[250px] w-full mx-auto md:mx-0 py-[12px] px-[8px] flex items-center gap-[8px] rounded-[12px] bg-[var(--bg-card)] shadow">
                <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                <input type="search" placeholder="Search token" className="w-full" value={searchToken} onChange={handleSearchChange} />
              </div>
            </div>
          </div>

          {/* Table */}
          {/* <div className="bottom">
            <STable stacks={stacks} fetchData={fetchAllPools} activeTab={activeTab} />
          </div> */}
          {/* <div className="bottom">
            {activeTab === 'Live' ? (
              <STable stacks={stacks} fetchData={fetchAllPools} showExpandable='Live' />
            ) : (
              <STable stacks={stacks} fetchData={fetchAllPools} showExpandable='All' />
            )}
          </div> */}

          <div className="w-full mt-1">
            <p className="text-sm text-gray-500">
              {{
                MyLive: 'Showing your active staking pools.',
                MyEnded: 'Showing your ended staking pools.',
                Live: 'Showing active pools from other users.',
                Ended: 'Showing ended pools from other users.',
                All: 'Showing all staking pools.',
              }[activeTab]}
            </p>
          </div>

          <div className="bottom">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Spin size="large" />
              </div>
            ) : stacks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 bg-[var(--bg-card)] rounded-lg shadow-sm">
                <Icon icon="mdi:folder-open-outline" className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-[var(--text-heading)] mb-2">No Pools Found</h3>
                <p className="text-gray-500 text-center">There are currently no staking pools available in this category.</p>
              </div>
            ) : (
              <STable
                stacks={stacks}
                fetchData={fetchAllPools}
                showExpandable={activeTab}
                allPools={originalData}
              />
            )}
          </div>
        </div>
      </div>
      {isaddStakeOpen && <CreateStakeWizard isOpen={isaddStakeOpen} setIsOpen={setisaddStakeOpen} fetchData={fetchAllPools} />}
    </>
  )
}

export default StakeTable
