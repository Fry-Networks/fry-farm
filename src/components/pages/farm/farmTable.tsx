import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { Spin } from 'antd';
import axios from 'axios';
import Button from '../../shared/button';
import FTable, { TabOption } from './fTable';
import Farmbanner from './farmbanner';
import CreateFarmWizard from '../../../Modals/website/CreateFarmWizard';
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet';
import { useChain } from '../../../context/ChainContext';
import { tokenServiceInstance as tokenService } from '../../../services/TokenService';
import { getChainLpTokenUsdPrice, fetchChainPriceMap } from '../../../services/PriceService';

import { formatUsdAbbreviated } from "../../../utils/formatNumber";

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

const FarmTable: React.FC = () => {
  const { activeAddress: walletAddress } = useMultiChainWallet();
  const { chainId, activeChain } = useChain();
  const [farms, setFarms] = useState<any[]>([]);
  const [originalData, setOriginalData] = useState<any[]>([]);
  const [isAddFarmOpen, setIsAddFarmOpen] = useState(false);
  const [tokenImages, setTokenImages] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabOption>('Live');
  const [userFarmedPoolIds, setUserFarmedPoolIds] = useState<Set<string>>(new Set());
  const [userStakeAmounts, setUserStakeAmounts] = useState<{ [key: string]: number }>({});

  // Fetch token images from database
  const fetchTokenImages = async (): Promise<{ [key: string]: string }> => {
    try {
      const tokens = await tokenService.fetchAllTokens();
      const imageMap: { [key: string]: string } = {};

      tokens.forEach(token => {
        // Only use database image if it's valid, otherwise use Tinyman fallback
        const dbImage = token.image;
        if (isValidImageUrl(dbImage)) {
          imageMap[token.id.toString()] = dbImage;
        } else {
          // Use Tinyman as default if database image is invalid
          imageMap[token.id.toString()] = chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${token.id}.png` : `https://asa-list.tinyman.org/assets/${token.id}/icon.png`;
        }
      });

      setTokenImages(imageMap);
      return imageMap;
    } catch (error) {
      console.error('Failed to fetch token images:', error);
      const emptyMap = {};
      setTokenImages(emptyMap);
      return emptyMap;
    }
  };

  const fetchAllFarms = async (images: { [key: string]: string } = {}) => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/farming/all`, { params: { chainId } });
      const data = res.data?.data || [];
      const now = Math.floor(Date.now() / 1000);

      // Use database images with fallback to Tinyman
      const databaseImages = Object.keys(images).length > 0 ? images : tokenImages;

      // Build decimal map from token service for accurate LP price calculations
      const allTokens = await tokenService.fetchAllTokens();
      const decimalMap: Record<string, number> = {};
      allTokens.forEach(t => { decimalMap[t.id.toString()] = t.decimals ?? 6; });

      // Fetch LP token USD prices for unique pairs
      const pairMap = new Map<string, { tokenAId: number; tokenBId: number }>();
      for (const farm of data) {
        const aId = Number(farm.lpToken?.tokenAId || farm.lpToken?.tokenA || 0);
        const bId = Number(farm.lpToken?.tokenBId || farm.lpToken?.tokenB || 0);
        if (aId > 0 && bId > 0 && aId !== bId) {
          const key = [aId, bId].sort((a, b) => a - b).join('-');
          if (!pairMap.has(key)) pairMap.set(key, { tokenAId: aId, tokenBId: bId });
        }
      }

      // Collect unique reward token IDs for price-adjusted APR
      const rewardTokenIds = Array.from(new Set(
        data.map((f: any) => Number(f.rewardToken?.id || 0)).filter((id: number) => id > 0)
      )) as number[];

      // Fetch LP prices and reward token prices in parallel
      const [lpPriceResults, rewardPrices] = await Promise.all([
        Promise.allSettled(
          [...pairMap.entries()].map(async ([key, pair]) => ({
            key,
            price: await getChainLpTokenUsdPrice(
              pair.tokenAId, pair.tokenBId,
              chainId,
            ),
          }))
        ),
        fetchChainPriceMap(rewardTokenIds, chainId),
      ]);

      const lpPrices: Record<string, number> = {};
      for (const r of lpPriceResults) {
        if (r.status === 'fulfilled' && r.value.price > 0) {
          lpPrices[r.value.key] = r.value.price;
        }
      }

      // Map ALL farms (no tab filtering here — filtering happens client-side)
      const mapped = data.map((farm: any, index: number) => {
          const endsIn = Math.max(0, farm.farmEndTime - now);
          const endsInDays = Math.ceil(endsIn / 86400);

          const poolData = farm.totalStaked || 0;
          const lpHuman = poolData / 1_000_000;
          const aId = Number(farm.lpToken?.tokenAId || farm.lpToken?.tokenA || 0);
          const bId = Number(farm.lpToken?.tokenBId || farm.lpToken?.tokenB || 0);
          const pairKey = [aId, bId].sort((a, b) => a - b).join('-');
          const lpPrice = lpPrices[pairKey] ?? 0;
          const tvlUsd = lpHuman * lpPrice;

          // Price-adjusted APR: on-chain APR assumes 1:1 token value, correct for actual prices
          const rwdId = Number(farm.rewardToken?.id || 0);
          const rewardPrice = rewardPrices[rwdId.toString()] ?? 0;
          const rawApr = farm.aprRate || 0;
          let displayApr: number | null = null;
          if (lpPrice > 0 && rewardPrice > 0) {
            displayApr = rawApr * (rewardPrice / lpPrice);
          }
          const tvl = poolData > 0
            ? (tvlUsd > 0 ? formatUsdAbbreviated(tvlUsd) : `${lpHuman.toLocaleString()} LP`)
            : '0 LP';

          // Get token IDs for LP tokens and reward token
          const tokenAId = farm.lpToken?.tokenAId?.toString() || farm.lpToken?.tokenA?.toString();
          const tokenBId = farm.lpToken?.tokenBId?.toString() || farm.lpToken?.tokenB?.toString();
          const rewardTokenId = farm.rewardToken?.id?.toString() || farm.rewardTokenId?.toString();

          // Use database images with fallback to Tinyman
          // Validate database images before using them
          const tokenADbImage = databaseImages[tokenAId];
          const tokenBDbImage = databaseImages[tokenBId];
          const rewardTokenDbImage = databaseImages[rewardTokenId];

          const tokenAImage = (tokenADbImage && isValidImageUrl(tokenADbImage))
            ? tokenADbImage
            : (chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${tokenAId}.png` : `https://asa-list.tinyman.org/assets/${tokenAId}/icon.png`);
          const tokenBImage = (tokenBDbImage && isValidImageUrl(tokenBDbImage))
            ? tokenBDbImage
            : (chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${tokenBId}.png` : `https://asa-list.tinyman.org/assets/${tokenBId}/icon.png`);
          const rewardTokenImage = (rewardTokenDbImage && isValidImageUrl(rewardTokenDbImage))
            ? rewardTokenDbImage
            : (chainId === 'voi-mainnet' ? `https://asset-verification.nautilus.sh/icons/${rewardTokenId}.png` : `https://asa-list.tinyman.org/assets/${rewardTokenId}/icon.png`);

          return {
            key: farm._id || index,
            _id: farm._id,
            creatorId: farm.creatorId,
            farmEndTime: farm.farmEndTime,
            farmStartTime: farm.farmStartTime,
            appId: farm.appId,
            isGated: farm.isGated || false,
            gateConfig: farm.gateConfig || {},
            pool: (
              <div className="flex items-center gap-[20px] w-[350px]">
                {/* Token Icons */}
                <div className="flex relative">
                  <img
                    key={`tokenA-${tokenAId}-${tokenAImage}`}
                    src={tokenAImage}
                    alt={farm.lpToken?.tokenA || 'Token A'}
                    className="w-[40px] h-[40px] rounded-full drop-shadow-md"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const hasTriedFallback = target.dataset.fallbackAttempted === 'true';
                      if (!hasTriedFallback && !target.src.includes('tinyman.org') && chainId !== 'voi-mainnet') {
                        target.dataset.fallbackAttempted = 'true';
                        target.src = `https://asa-list.tinyman.org/assets/${tokenAId}/icon.png`;
                      } else {
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0yMCAxMkMxNS41ODIyIDEyIDEyIDE1LjU4MjIgMTIgMjBDMTIgMjQuNDE3OCAxNS41ODIyIDI4IDIwIDI4QzI0LjQxNzggMjggMjggMjQuNDE3OCAyOCAyMEMyOCAxNS41ODIyIDI0LjQxNzggMTIgMjAgMTJaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+';
                      }
                    }}
                  />
                  <img
                    key={`tokenB-${tokenBId}-${tokenBImage}`}
                    src={tokenBImage}
                    alt={farm.lpToken?.tokenB || 'Token B'}
                    className="w-[40px] h-[40px] rounded-full drop-shadow-md -ml-4 z-10"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const hasTriedFallback = target.dataset.fallbackAttempted === 'true';
                      if (!hasTriedFallback && !target.src.includes('tinyman.org') && chainId !== 'voi-mainnet') {
                        target.dataset.fallbackAttempted = 'true';
                        target.src = `https://asa-list.tinyman.org/assets/${tokenBId}/icon.png`;
                      } else {
                        target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0yMCAxMkMxNS41ODIyIDEyIDEyIDE1LjU4MjIgMTIgMjBDMTIgMjQuNDE3OCAxNS41ODIyIDI4IDIwIDI4QzI0LjQxNzggMjggMjggMjQuNDE3OCAyOCAyMEMyOCAxNS41ODIyIDI0LjQxNzggMTIgMjAgMTJaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+';
                      }
                    }}
                  />
                </div>

                {/* Text Information */}
                <div className="flex flex-col ml-[10px]">
                  <h6 className="text-[var(--text-primary)] font-medium text-[14px]">
                    {farm.lpPairName || `${farm.lpToken?.tokenA} / ${farm.lpToken?.tokenB}`}
                  </h6>
                  <div className="flex items-center gap-2">
                    <img
                      key={`reward-${rewardTokenId}-${rewardTokenImage}`}
                      src={rewardTokenImage}
                      alt={farm.rewardToken?.id || 'Reward token'}
                      className="w-[20px] h-[20px] rounded-full"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const hasTriedFallback = target.dataset.fallbackAttempted === 'true';
                        if (!hasTriedFallback && !target.src.includes('tinyman.org') && chainId !== 'voi-mainnet') {
                          target.dataset.fallbackAttempted = 'true';
                          target.src = `https://asa-list.tinyman.org/assets/${rewardTokenId}/icon.png`;
                        } else {
                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSIxMCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0xMCA2QzguODk1NDMgNiA4IDYuODk1NDMgOCA4QzggOS4xMDQ1NyA4Ljg5NTQzIDEwIDEwIDEwQzExLjEwNDYgMTAgMTIgOS4xMDQ1NyAxMiA4QzEyIDYuODk1NDMgMTEuMTA0NiA2IDEwIDZaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+';
                        }
                      }}
                    />
                    <h6 className="text-green font-medium text-[14px]">
                      {farm.rewardTokenSymbol || farm.rewardToken?.name || farm.rewardToken?.id}
                    </h6>
                    {farm.dexProvider && (
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">
                        {farm.dexProvider}
                      </span>
                    )}
                    {farm.isGated && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium flex items-center gap-0.5" title={farm.gateConfig?.gateMessage || 'NFT Gated'}>
                        <Icon icon="mdi:shield-lock-outline" width={10} height={10} />
                        {farm.gateConfig?.collectionName || 'NFT Gated'}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-[12px]">
                    {farm.lockPeriod / 86400} {farm.lockPeriod / 86400 === 1 ? 'Day' : 'Days'} Lock
                  </p>
                </div>
              </div>
            ),
            tvl: tvl, // TVL value is displayed here
            apr: displayApr !== null ? `${displayApr.toFixed(2)}%` : 'N/A',
            staked: (() => {
              const userLp = userStakeAmounts[farm.appId] || 0;
              if (userLp > 0) {
                const userUsd = userLp * lpPrice;
                return userUsd > 0
                  ? `$ ${userUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${userLp.toLocaleString()} LP`;
              }
              return tvlUsd > 0
                ? `$ ${tvlUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `${lpHuman.toLocaleString()} LP`;
            })(),
            reward: (
              <div>
                {(farm.rewardTokenAmount / 1_000_000).toFixed(2)} {farm.rewardTokenSymbol || farm.rewardToken?.name || 'tokens'}
              </div>
            ),
            ends: `${endsInDays} ${endsInDays === 1 ? 'day' : 'days'}`,
            stakeTokenId: Number(farm.lpToken?.tokenAId || farm.lpToken?.tokenA || 0),
            stakeTokenBId: Number(farm.lpToken?.tokenBId || farm.lpToken?.tokenB || 0),
            rewardTokenId: Number(farm.rewardToken?.id || farm.rewardTokenId || 0),
            stakeTokenName: farm.lpPairName || `${farm.lpToken?.tokenA || 'Token A'} / ${farm.lpToken?.tokenB || 'Token B'}`,
            rewardTokenName: farm.rewardTokenSymbol || farm.rewardToken?.name || 'Token',
            lpPrice,
          };
        });

      setOriginalData(mapped);
    } catch (error) {
      console.error('Error fetching farms:', error);
    }
  };

  // Fetch user's farmed pool IDs when wallet connects
  useEffect(() => {
    if (!walletAddress) {
      setUserFarmedPoolIds(new Set());
      return;
    }
    const fetchUserFarms = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/wallet/${walletAddress}`);
        const records = res.data?.data || [];
        const ids = new Set<string>();
        const amounts: { [key: string]: number } = {};
        records.forEach((r: any) => {
          const pid = String(r.poolId);
          ids.add(pid);
          amounts[pid] = (r.totalStaked || 0) / 1_000_000;
        });
        setUserFarmedPoolIds(ids);
        setUserStakeAmounts(amounts);
      } catch {
        setUserFarmedPoolIds(new Set());
      }
    };
    fetchUserFarms();
  }, [walletAddress, chainId]);

  // Client-side filtering: filter originalData by activeTab and walletAddress
  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const filtered = originalData.filter((farm) => {
      const isCreator = farm.creatorId?.toLowerCase() === walletAddress?.toLowerCase();
      const hasUserStake = userFarmedPoolIds.has(String(farm.appId));
      const belongsToWallet = isCreator || hasUserStake;
      const isLive = farm.farmEndTime > now;

      switch (activeTab) {
        case 'Live':
          return isLive;
        case 'Ended':
          return !isLive;
        case 'MyLive':
          return belongsToWallet && isLive;
        case 'MyEnded':
          return belongsToWallet && !isLive;
        default:
          return true;
      }
    });
    setFarms(filtered);
  }, [originalData, activeTab, walletAddress, userFarmedPoolIds]);

  // Initial load: fetch token images then farms (once)
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const images = await fetchTokenImages();
        await fetchAllFarms(images);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [chainId]);

  return (
    <div className="w-full mt-[40px] mb-[47px] flex-1">
    {walletAddress && <Farmbanner wallet={walletAddress} />}
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[16px]">
        {/* Tabs */}
        <div className="top flex max-md:flex-col justify-between items-center gap-[20px]">
          <div className="flex w-full justify-center md:justify-start">
            <div className="switcher flex flex-wrap justify-center md:flex-nowrap gap-[8px] p-[8px] bg-[var(--bg-card)] rounded-[12px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)] overflow-x-auto max-w-full">
              {(['MyLive', 'MyEnded', 'Live', 'Ended', 'All'] as TabOption[]).map((tab) => {
                const isMyTab = tab === 'MyLive' || tab === 'MyEnded';
                const isDisabled = isMyTab && !walletAddress;
                return (
                  <p
                    key={tab}
                    className={`${activeTab === tab
                      ? 'text-white linearGradient shadow-md'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                    } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-center text-center tracking-[0.09px] rounded-[10px] px-[16px] min-w-[120px] h-[40px] text-[14px] whitespace-nowrap transition-all duration-200`}
                    onClick={() => !isDisabled && setActiveTab(tab)}
                  >
                    {{
                      MyLive: 'My Live Farms',
                      MyEnded: 'My Ended Farms',
                      Live: 'Live Farms',
                      Ended: 'Ended Farms',
                      All: 'All Farms',
                    }[tab]}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Create Button */}
          <div className="flex flex-col md:items-end gap-[14px] w-full">
            <div className="flex justify-center md:justify-end">
              <Button
                text="Create Farm"
                onClick={() => setIsAddFarmOpen(true)}
                img="ic:sharp-add"
                className="button btn-red-border w-[250px] md:w-[180px]"
                height={45}
                clr="text-red"
              />
            </div>
          </div>
        </div>

        <div className="w-full mt-1">
          <p className="text-sm text-gray-500">
            {{
              MyLive: 'Showing your live farming farms.',
              MyEnded: 'Showing your ended farming farms.',
              Live: 'Showing all live farms.',
              Ended: 'Showing all ended farms.',
              All: 'Showing all farming farms.',
            }[activeTab]}
          </p>
        </div>

        <div className="bottom">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Spin size="large" />
            </div>
          ) : farms.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 bg-[var(--bg-card)] rounded-lg shadow-sm">
              <Icon icon="mdi:folder-open-outline" className="w-16 h-16 text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold text-[var(--text-heading)] mb-2">No Farms Found</h3>
              <p className="text-gray-500 text-center">There are currently no farming pools available in this category.</p>
            </div>
          ) : (
            <FTable
              farms={farms}
              fetchData={fetchAllFarms}
              showExpandable={activeTab}
            />
          )}
        </div>
      </div>

      <CreateFarmWizard
        isaddFarmOpen={isAddFarmOpen}
        setisaddFarmOpen={setIsAddFarmOpen}
        fetchData={fetchAllFarms}
      />
    </div>
  );
};

export default FarmTable;
