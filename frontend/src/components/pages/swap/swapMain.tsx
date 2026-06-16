// @ts-nocheck
import { Icon } from '@iconify/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Button from '../../shared/button'
import CandleStickChart from '../../shared/CandleStickChart'
import Input from '../../shared/input'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import axios from 'axios'
import { PeraWalletConnect } from '@perawallet/connect'
import { Buffer } from 'buffer'
import { getSwapRoute } from '@tinymanorg/tinyman-js-sdk'
import { FolksRouterClient, Network, SwapMode, SwapParams, SwapProvider, SwapQuote, SwapService } from '../../../contracts'
import type { VestigeSwapQuote } from '../../../contracts/VestigeLabsClient'
import type { HaystackQuote } from '../../../contracts/HaystackRouterClient'
import { VoiSwapService } from '../../../contracts/VoiSwapService'
import type { VoiQuoteComparison } from '../../../contracts/VoiSwapService'
import type { VoiSwapProvider } from '../../../contracts/types'
import { loadMarketData as loadNomadexData, getTokens as getNomadexTokens } from '../../../contracts/nomadex/api'
import { loadHumbleMarketData, getHumbleTokens } from '../../../contracts/humble/api'
import { getChainConfig } from '../../../config/chains'
import algosdk, { Algodv2, Indexer, decodeUnsignedTransaction, generateAccount } from 'algosdk'
import ConnectWallet from '../../ConnectWallet'
import '../../../styles/shared/scrollbar.css'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import { usePreferences } from '../../../contexts/PreferencesContext'
import { friendlySlippage, friendlyPriceImpact } from '../../../utils/grandmaLabels'
import { useAuth } from '../../../hooks/useAuth'
import { fetchFeeConfig, calculateFeeSimple, routeFeeViaRouter } from '../../../services/FeeService'
import type { FeeCalculation } from '../../../services/FeeService'
import FeeConfirmation from '../../shared/FeeConfirmation'
import { logFee } from '../../../utils/logFee'
import { useChain } from '../../../context/ChainContext'
import { authAxios } from '../../../services/apiClient'
import { Spin } from 'antd'

// ...existing code...
interface Currency {
  code: string
  label: string
  img: string
  id: number
  decimals: number
}

// Add this type (unit_name with underscore)
type TinymanAsset = {
  id: number
  name?: string
  unitName?: string
  unit_name?: string
  decimals?: number
  verified?: boolean
  logo?: { png?: string; svg?: string }
}

// Helper: format on-chain amount by decimals
const formatAssetAmount = (amount: number | string | bigint, decimals: number) =>
  Number(amount) / Math.pow(10, decimals)

// Smart price formatter that preserves significant digits for small numbers
const formatPrice = (value: number): string => {
  if (value === 0) return '0';
  if (value >= 1) return value.toFixed(4);
  // For small numbers, show first 4 significant digits
  const str = value.toFixed(20);
  const match = str.match(/^0\.(0*[1-9]\d{0,3})/);
  return match ? `0.${match[1]}` : value.toPrecision(4);
}

const algodToken = import.meta.env.VITE_ALGOD_TOKEN || ''
const algodMainServer = import.meta.env.VITE_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud'
const algodMain = new algosdk.Algodv2(algodToken, algodMainServer, '')

// Voi chain clients
const voiAlgodServer = import.meta.env.VITE_VOI_ALGOD_SERVER || 'https://mainnet-api.voi.nodely.dev'
const voiAlgod = new algosdk.Algodv2(import.meta.env.VITE_VOI_ALGOD_TOKEN || '', voiAlgodServer, '')
const voiIndexerServer = import.meta.env.VITE_VOI_INDEXER_SERVER || 'https://mainnet-idx.voi.nodely.dev'
const voiIndexer = new algosdk.Indexer('', voiIndexerServer, '')

const TINYMAN_ASA_LIST_URL = 'https://asa-list.tinyman.org/assets.json';

const VOI_ICON_BASE = 'https://asset-verification.nautilus.sh/icons/';

const VOI_FALLBACK_CURRENCIES: Currency[] = [
  { code: 'VOI', label: 'Voi', img: `${VOI_ICON_BASE}0.png`, id: 0, decimals: 6 },
  { code: 'wVOI', label: 'Wrapped Voi', img: `${VOI_ICON_BASE}390001.png`, id: 390001, decimals: 6 },
  { code: 'aUSDC', label: 'aUSDC', img: `${VOI_ICON_BASE}395614.png`, id: 395614, decimals: 6 },
  { code: 'vFRY', label: 'vFRY', img: '', id: 48968653, decimals: 6 },
  { code: 'VIA', label: 'VIA', img: `${VOI_ICON_BASE}6779767.png`, id: 6779767, decimals: 6 },
  { code: 'GM', label: 'Good Morning', img: `${VOI_ICON_BASE}300279.png`, id: 300279, decimals: 2 },
];

const SwapMain = () => {
  const { isSimpleMode } = usePreferences()
  const { chainId } = useChain()
  // Fallback list in case database fetch fails
  const FALLBACK_CURRENCIES: Currency[] = [
    { code: 'ALGO', label: 'Algorand', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/0/icon.png', id: 0, decimals: 6 },
    { code: 'USDC', label: 'USD Coin', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/31566704/icon.png', id: 31566704, decimals: 6 },
    { code: 'goBTC', label: 'Wrapped BTC', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/386192725/icon.png', id: 386192725, decimals: 8 },
    { code: 'goETH', label: 'Wrapped ETH', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/386195940/icon.png', id: 386195940, decimals: 8 },
    { code: 'PLANET', label: 'Planet', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/27165954/icon.png', id: 27165954, decimals: 5 },
    { code: 'OPUL', label: 'Opulous', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/287867876/icon.png', id: 287867876, decimals: 10 },
    { code: 'GARD', label: 'GARD', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/684649988/icon.png', id: 684649988, decimals: 6 },
    { code: 'STBL', label: 'STBL', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/465865291/icon.png', id: 465865291, decimals: 6 },
    { code: 'AKITA', label: 'Akita Inu', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/244275365/icon.png', id: 244275365, decimals: 6 },
    { code: 'CHIP', label: 'Chip', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/77801156/icon.png', id: 77801156, decimals: 6 },
    { code: 'DEFLY', label: 'Defly', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/470842789/icon.png', id: 470842789, decimals: 6 },
    { code: 'ALGOFI', label: 'Algofi Token', img: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/81288225/icon.png', id: 81288225, decimals: 6 },
  ];

  // NEW: pin FRY (env) and manage top/all lists
  const FRY_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946

  const [allCurrencies, setAllCurrencies] = useState<Currency[]>(FALLBACK_CURRENCIES)
  const [topCurrencies, setTopCurrencies] = useState<Currency[]>(
    FALLBACK_CURRENCIES.slice(0, 20)
  )
  const [defaultTokens, setDefaultTokens] = useState<Currency[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(true)
  const [searchResults, setSearchResults] = useState<{ [key: string]: Currency[] }>({
    rewards: [],
    algoRewards: []
  })
  const [isSearching, setIsSearching] = useState<{ [key: string]: boolean }>({
    rewards: false,
    algoRewards: false
  })
  const [pendingSearchQuery, setPendingSearchQuery] = useState<{ [key: string]: string }>({
    rewards: '',
    algoRewards: '',
  })
    // Helper to detect FRY tokens (by id, code, or label)
  const isFryToken = (c: Currency) => {
    const txt = `${c.code || ''} ${c.label || ''}`.toLowerCase()
    return c.id === FRY_ID || txt.includes('fry')
  }

  // Fetch tokens from database (Algorand) or DEX APIs (Voi) on mount / chain switch
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setIsLoadingTokens(true);

        if (chainId === 'voi-mainnet') {
          // ── Voi: load tokens from Nomadex + Humble APIs ──
          await Promise.allSettled([loadNomadexData(), loadHumbleMarketData()]);
          const nomadexTokens = getNomadexTokens();
          const humbleTokens = getHumbleTokens();

          // Merge and deduplicate by token ID (prefer Nomadex data)
          const tokenMap = new Map<number, Currency>();
          for (const t of humbleTokens) {
            tokenMap.set(t.id, {
              code: t.symbol, label: t.name,
              img: `${VOI_ICON_BASE}${t.id}.png`,
              id: t.id, decimals: t.decimals,
            });
          }
          for (const t of nomadexTokens) {
            tokenMap.set(t.id, {
              code: t.symbol, label: t.name,
              img: `${VOI_ICON_BASE}${t.id}.png`,
              id: t.id, decimals: t.decimals,
            });
          }
          // Add native VOI (id=0) at top
          tokenMap.set(0, { code: 'VOI', label: 'Voi', img: `${VOI_ICON_BASE}0.png`, id: 0, decimals: 6 });

          const all = Array.from(tokenMap.values()).sort((a, b) => {
            // Pin VOI, wVOI, aUSDC, vFRY to top
            const pinOrder = [0, 390001, 395614, 48968653];
            const aIdx = pinOrder.indexOf(a.id);
            const bIdx = pinOrder.indexOf(b.id);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.code.localeCompare(b.code);
          });

          setAllCurrencies(all);
          setTopCurrencies(all.slice(0, 20));
          setDefaultTokens(VOI_FALLBACK_CURRENCIES);
          setSelectedRewards((prev) => prev ?? all[0]);
          setSelectedAlgoRewards((prev) => prev ?? all.find(c => c.id === 395614) ?? all[1]);
        } else {
          // ── Algorand: existing database-driven token loading ──
          const defaultTokensList = tokenService.getDefaultTokens();
          const defaultCurrencies = defaultTokensList.map(token => tokenService.convertToCurrency(token));
          setDefaultTokens(defaultCurrencies);
          setSelectedRewards((prev) => prev ?? defaultCurrencies[0]);
          setSelectedAlgoRewards((prev) => prev ?? defaultCurrencies[1]);

          const { all, top } = await tokenService.getTokensSorted();
          const fryToken = all.find(isFryToken);
          if (fryToken) {
            const otherTokens = all.filter(c => !isFryToken(c));
            setAllCurrencies([fryToken, ...otherTokens]);
            const otherTopTokens = top.filter(c => !isFryToken(c));
            setTopCurrencies([fryToken, ...otherTopTokens].slice(0, 20));
          } else {
            setAllCurrencies(all);
            setTopCurrencies(top);
          }
          setSelectedRewards((prev) => prev ?? defaultCurrencies[0] ?? top[0] ?? all[0]);
          setSelectedAlgoRewards((prev) => prev ?? (defaultCurrencies[1] ?? top[1] ?? all.find(x => x.id === 0) ?? all[1]));
        }
      } catch (error) {
        console.error('Failed to fetch tokens:', error);
        const fallback = chainId === 'voi-mainnet' ? VOI_FALLBACK_CURRENCIES : FALLBACK_CURRENCIES;
        setAllCurrencies(fallback);
        setTopCurrencies(fallback.slice(0, 20));
        setSelectedRewards((prev) => prev ?? fallback[0]);
        setSelectedAlgoRewards((prev) => prev ?? fallback[1]);
      } finally {
        setIsLoadingTokens(false);
      }
    };

    // Reset selections on chain switch
    setSelectedRewards(undefined);
    setSelectedAlgoRewards(undefined);
    fetchTokens();
  }, [chainId]);

  const location = useLocation()
  const { activeAddress, signTransactions: walletSignTransactions, signer } = useMultiChainWallet()
  const { ensureAuth } = useAuth()

  const [selectedRewards, setSelectedRewards] = useState<Currency | undefined>(undefined);
  const [selectedAlgoRewards, setSelectedAlgoRewards] = useState<Currency | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<{ [key: string]: string }>({
    rewards: '',
    algoRewards: '',
  })
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false);
  const [isOpenDropdowns, setIsOpenDropdowns] = useState<{ [key: string]: boolean }>({ rewards: false, algoRewards: false })
  const dropdownRefs = {
    rewards: useRef<HTMLDivElement | null>(null),
    algoRewards: useRef<HTMLDivElement | null>(null),
  }
  const [isSwapping, setIsSwapping] = useState(false)
  const isSwappingRef = useRef(false)
  const [swapAmount, setSwapAmount] = useState('0')
  const [fromBalance, setFromBalance] = useState<string>('--')
  const [toBalance, setToBalance] = useState<string>('--')

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  const folksRouterClient = new FolksRouterClient(Network.MAINNET)
  const [tokenPerAlgo, setTokenPerAlgo] = useState<string>('0');

  // Removed: allCurrencies useEffect was causing a race condition by setting
  // selectedRewards to ALGO before fetchTokensFromDatabase could set it to FRY.

  // Fetch wallet balances when tokens or wallet change
  useEffect(() => {
    const fetchBalances = async () => {
      if (!activeAddress) {
        setFromBalance('--');
        setToBalance('--');
        return;
      }
      try {
        const algodClient = chainId === 'voi-mainnet' ? voiAlgod : algodMain;
        const accountInfo = await algodClient.accountInformation(activeAddress).do();
        if (selectedRewards) {
          if (selectedRewards.id === 0) {
            const nativeBalance = Number(accountInfo.amount) / Math.pow(10, 6);
            setFromBalance(nativeBalance.toFixed(selectedRewards.decimals));
          } else {
            const assetInfo = accountInfo.assets?.find((a: any) => a['asset-id'] === selectedRewards.id);
            const bal = assetInfo ? Number(assetInfo.amount) / Math.pow(10, selectedRewards.decimals) : 0;
            setFromBalance(bal.toFixed(selectedRewards.decimals));
          }
        }
        if (selectedAlgoRewards) {
          if (selectedAlgoRewards.id === 0) {
            const nativeBalance = Number(accountInfo.amount) / Math.pow(10, 6);
            setToBalance(nativeBalance.toFixed(selectedAlgoRewards.decimals));
          } else {
            const assetInfo = accountInfo.assets?.find((a: any) => a['asset-id'] === selectedAlgoRewards.id);
            const bal = assetInfo ? Number(assetInfo.amount) / Math.pow(10, selectedAlgoRewards.decimals) : 0;
            setToBalance(bal.toFixed(selectedAlgoRewards.decimals));
          }
        }
      } catch (error) {
        console.error('Error fetching balances:', error);
        setFromBalance('--');
        setToBalance('--');
      }
    };
    fetchBalances();
  }, [selectedRewards, selectedAlgoRewards, activeAddress, chainId]);

  // Handle search submission (only when submit button is clicked)
  const handleSearchSubmit = async (dropdown: 'rewards' | 'algoRewards') => {
    const query = pendingSearchQuery[dropdown]?.trim();
    
    if (!query || query.length < 2) {
      toast.error('Please enter at least 2 characters to search');
      return;
    }

    // Update search query to trigger search
    setSearchQuery(prev => ({ ...prev, [dropdown]: query }));
    setIsSearching(prev => ({ ...prev, [dropdown]: true }));
    
    try {
      let searchCurrencies: Currency[];
      if (chainId === 'voi-mainnet') {
        // Voi: filter locally from already-loaded tokens (avoids Pera API calls)
        const q = query.toLowerCase();
        searchCurrencies = allCurrencies.filter(
          (c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
        );
      } else {
        const searchTokens = await tokenService.searchTokens(query);
        searchCurrencies = searchTokens.map(token => tokenService.convertToCurrency(token));
      }
      setSearchResults(prev => ({ ...prev, [dropdown]: searchCurrencies }));
    } catch (error) {
      console.error(`Search error for ${dropdown}:`, error);
      setSearchResults(prev => ({ ...prev, [dropdown]: [] }));
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(prev => ({ ...prev, [dropdown]: false }));
    }
  };

  const toggleDropdown = (dropdown: string) => {
    setIsOpenDropdowns((prev) => {
      const newState = { ...prev }
      Object.keys(prev).forEach((key) => {
        if (key !== dropdown) newState[key] = false
      })
      newState[dropdown] = !prev[dropdown]
      return newState
    })
  }

  const selectCurrency = (currency: Currency, dropdown: string) => {
    if (dropdown === 'rewards') {
      setSelectedRewards(currency)
    } else if (dropdown === 'algoRewards') {
      setSelectedAlgoRewards(currency)
    }

    setIsOpenDropdowns((prev) => ({ ...prev, [dropdown]: false }))
  }

 // Updated getFilteredCurrencies to show default tokens first, then search results
  const getFilteredCurrencies = (dropdown: 'rewards' | 'algoRewards') => {
    const q = (searchQuery[dropdown] || '').trim().toLowerCase()
    
    // If searching and we have search results, use them
    if (q && q.length >= 2 && searchResults[dropdown].length > 0) {
      return searchResults[dropdown].sort((a, b) => Number(isFryToken(b)) - Number(isFryToken(a)));
    }
    
    // If searching but no results yet, show loading or empty state
    if (q && q.length >= 2) {
      if (isSearching[dropdown]) {
        return []; // Will show loading state in UI
      }
      return []; // Will show "no results" in UI
    }
    
    // When not searching, show default tokens first
    return defaultTokens.length > 0 ? defaultTokens : allCurrencies.slice(0, 100);
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(dropdownRefs).forEach((key) => {
        const ref = dropdownRefs[key as keyof typeof dropdownRefs].current
        if (ref && !ref.contains(event.target as Node)) {
          setIsOpenDropdowns((prev) => ({ ...prev, [key]: false }))
        }
      })
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [minReceived, setMinReceived] = useState<string>('0');
  const [priceImpact, setPriceImpact] = useState<string>('0');
  const [priceRate, setPriceRate] = useState<string>('0');
  const [currentProvider, setCurrentProvider] = useState<string>(
    chainId === 'voi-mainnet' ? 'nomadex' : 'folksrouter'
  );
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const quoteAbortRef = useRef(false);
  const quoteTimestampRef = useRef<number>(0);
  const swapServiceRef = useRef<SwapService | null>(null);
  const voiSwapServiceRef = useRef<VoiSwapService | null>(null);

  // Fee confirmation state
  const [feeModalVisible, setFeeModalVisible] = useState(false)
  const [feeCalc, setFeeCalc] = useState<FeeCalculation | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [feeActionLabel, setFeeActionLabel] = useState('')
  const [feeAmountFormatted, setFeeAmountFormatted] = useState('')
  const [netAmountFormatted, setNetAmountFormatted] = useState('')
  const pendingSwapResolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  // Reset provider badge when switching chains
  useEffect(() => {
    setCurrentProvider(chainId === 'voi-mainnet' ? 'nomadex' : 'folksrouter');
  }, [chainId]);

  useEffect(() => {
    quoteAbortRef.current = false;

    if (!selectedRewards || !selectedAlgoRewards) return;

    if (!swapAmount || parseFloat(swapAmount) <= 0) {
      setTokenPerAlgo('0');
      setMinReceived('0');
      setPriceRate('0');
      setPriceImpact('0');
      setIsQuoteLoading(false);
      return;
    }

    setIsQuoteLoading(true);

    const debounceTimer = setTimeout(async () => {
      try {
        const multiplier = Math.pow(10, selectedRewards.decimals);
        const microAmount = Math.floor(parseFloat(swapAmount) * multiplier);
        if (isNaN(microAmount) || microAmount <= 0) return;

        let toAmount: number;
        let priceImpactValue: string;
        let provider: string;

        if (chainId === 'voi-mainnet') {
          // ── Voi: use VoiSwapService with Nomadex + Humble ──
          const voiSwapService = new VoiSwapService({
            algodClient: voiAlgod,
            indexerClient: voiIndexer,
            walletSignTransactions: walletSignTransactions,
          });
          voiSwapServiceRef.current = voiSwapService;

          const quoteComparison = await voiSwapService.compareQuotes(
            selectedRewards.id,
            selectedAlgoRewards.id,
            BigInt(microAmount),
            slippageBps,
            activeAddress || ''
          );

          if (quoteAbortRef.current) return;

          let bestQuote = quoteComparison.nomadex || quoteComparison.humble || quoteComparison.snowball;
          provider = quoteComparison.bestProvider || 'nomadex';

          if (quoteComparison.bestProvider === 'snowball' && quoteComparison.snowball) {
            bestQuote = quoteComparison.snowball;
          } else if (quoteComparison.bestProvider === 'humble' && quoteComparison.humble) {
            bestQuote = quoteComparison.humble;
          } else if (quoteComparison.nomadex) {
            bestQuote = quoteComparison.nomadex;
          }

          if (!bestQuote) throw new Error("Unable to get quote from any Voi DEX");

          toAmount = Number(bestQuote.amountOut) / Math.pow(10, selectedAlgoRewards.decimals);
          priceImpactValue = (bestQuote.priceImpact * 100).toFixed(2);

        } else {
          // ── Algorand: existing SwapService with FolksRouter/Vestige/Haystack ──
          const swapService = new SwapService({
            network: Network.MAINNET,
            algodClient: algodMain,
            walletSignTransactions: walletSignTransactions
          });
          swapServiceRef.current = swapService;

          const quoteComparison = await swapService.compareQuotes(
            selectedRewards.id,
            selectedAlgoRewards.id,
            microAmount
          );

          if (quoteAbortRef.current) return;

          let quote: SwapQuote | VestigeSwapQuote | DeflexQuote | null = null;
          provider = 'folksrouter';

          if (quoteComparison.bestProvider === 'haystack' && quoteComparison.haystack) {
            quote = quoteComparison.haystack;
            provider = 'haystack';
          } else if (quoteComparison.bestProvider === 'vestige' && quoteComparison.vestige) {
            quote = quoteComparison.vestige;
            provider = 'vestige';
          } else if (quoteComparison.folksRouter) {
            quote = quoteComparison.folksRouter;
            provider = 'folksrouter';
          } else if (quoteComparison.vestige) {
            quote = quoteComparison.vestige;
            provider = 'vestige';
          } else if (quoteComparison.haystack) {
            quote = quoteComparison.haystack;
            provider = 'haystack';
          }

          if (!quote) throw new Error("Unable to get quote from any provider");

          if ('quoteAmount' in quote) {
            toAmount = formatAssetAmount(Number(quote.quoteAmount), selectedAlgoRewards.decimals);
            priceImpactValue = quote.priceImpact ? (Number(quote.priceImpact) * 100).toFixed(2) : '0.00';
          } else if ('amount_out' in quote) {
            toAmount = formatAssetAmount((quote as any).amount_out, selectedAlgoRewards.decimals);
            priceImpactValue = (quote as any).price_impact != null ? ((quote as any).price_impact * 100).toFixed(2) : '0.00';
          } else if ('quote' in quote && quote.quote != null) {
            toAmount = formatAssetAmount(Number(quote.quote), selectedAlgoRewards.decimals);
            priceImpactValue = '0.00';
          } else {
            throw new Error("Invalid quote format");
          }
        }

        const fromAmount = parseFloat(swapAmount);
        const rate = toAmount / fromAmount;
        const minReceivedAmount = toAmount * (1 - slippageBps / 10000);

        setTokenPerAlgo(toAmount.toFixed(selectedAlgoRewards.decimals));
        setMinReceived(minReceivedAmount.toFixed(selectedAlgoRewards.decimals));
        setPriceRate(formatPrice(rate));
        setPriceImpact(priceImpactValue);
        setCurrentProvider(provider);
        quoteTimestampRef.current = Date.now();

      } catch (error: any) {
        if (quoteAbortRef.current) return;
        console.error("Swap quote error:", error);
        if (!activeAddress) {
          // Wallet not connected — skip
        } else if (error?.response?.status === 404) {
          toast.warning("This token pair is currently unavailable for swapping");
        } else if (!navigator.onLine) {
          toast.error("Please check your internet connection");
        } else {
          console.error("Quote fetch failed:", error.message || error);
        }
        setTokenPerAlgo('0');
        setMinReceived('0');
        setPriceRate(chainId === 'voi-mainnet' ? '0' : 'N/A');
        setPriceImpact('0');
      } finally {
        setIsQuoteLoading(false);
      }
    }, 1500);

    return () => {
      clearTimeout(debounceTimer);
      quoteAbortRef.current = true;
      setIsQuoteLoading(false);
    };
  }, [selectedRewards, selectedAlgoRewards, swapAmount, activeAddress, chainId]);

  const checkAssetBalance = async (assetId: number): Promise<{ hasAsset: boolean; balance: number }> => {
    if (!activeAddress) {
      return { hasAsset: false, balance: 0 };
    }

    try {
      const accountInfo = await algodMain.accountInformation(activeAddress).do();
      const assetInfo = accountInfo.assets.find((a: any) => a['asset-id'] === assetId);
      
      if (assetInfo) {
        return { hasAsset: true, balance: assetInfo.amount };
      }
      
      return { hasAsset: false, balance: 0 };
    } catch (error) {
      console.error('Error checking asset balance:', error);
      return { hasAsset: false, balance: 0 };
    }
  };

  const optInToASA = async (assetId: number) => {
    if (!activeAddress) return toast.error('Wallet not connected')

    // Ensure assetId is a valid positive number
    const numericAssetId = Number(assetId)
    if (isNaN(numericAssetId) || numericAssetId <= 0) {
      console.error('Invalid asset ID:', assetId)
      toast.error(`Invalid asset ID: ${assetId}`)
      return
    }

    try {
      const accountInfo = await algodMain.accountInformation(activeAddress).do()
      const alreadyOptedIn = accountInfo.assets.some((a: any) => a['asset-id'] === numericAssetId)

      if (alreadyOptedIn) {
        return
      }

      const params = await algodMain.getTransactionParams().do()
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: activeAddress,
        to: activeAddress,
        assetIndex: numericAssetId,
        amount: 0,
        suggestedParams: params,
      })

      const signed = await walletSignTransactions([txn.toByte()])
      const result = await algodMain.sendRawTransaction(signed).do()

      toast.success(`Opted in to asset ${numericAssetId}`)
      return result
    } catch (err) {
      console.error('Opt-in failed:', err)
      toast.error('Opt-in failed')
    }
  }

  // Fee confirmation: returns a promise that resolves when user confirms or cancels
  const requestFeeConfirmation = async (inputAmountMicro: number, tokenDecimals: number, tokenName: string): Promise<boolean> => {
    try {
      setFeeLoading(true)
      const config = await fetchFeeConfig()
      const fee = calculateFeeSimple('swap', inputAmountMicro, config, getChainConfig(chainId).feeRecipient)

      if (fee.feeAmount <= 0) return true // no fee configured

      setFeeCalc(fee)
      const divisor = Math.pow(10, tokenDecimals)
      setFeeAmountFormatted(`${(fee.feeAmount / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`)
      setNetAmountFormatted(`${(fee.netAmount / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`)
      setFeeActionLabel(`Swap ${(inputAmountMicro / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`)
      setFeeLoading(false)

      return new Promise<boolean>((resolve) => {
        pendingSwapResolveRef.current = resolve
        setFeeModalVisible(true)
      })
    } catch (err) {
      console.warn('Fee config fetch failed, proceeding without fee:', err)
      setFeeLoading(false)
      return true // proceed on fee fetch failure
    }
  }

  const onFeeConfirm = () => {
    setFeeModalVisible(false)
    pendingSwapResolveRef.current?.(true)
    pendingSwapResolveRef.current = null
  }

  const onFeeCancel = () => {
    setFeeModalVisible(false)
    pendingSwapResolveRef.current?.(false)
    pendingSwapResolveRef.current = null
  }

  const performSwap = async () => {
    if (isSwappingRef.current) return
    isSwappingRef.current = true

    if (!activeAddress) {
      toast.error("Please connect your wallet");
      isSwappingRef.current = false
      return;
    }
    if (!selectedRewards || !selectedAlgoRewards) {
      toast.error("Please select both tokens.");
      isSwappingRef.current = false
      return;
    }

    if (selectedRewards.id === selectedAlgoRewards.id) {
      toast.error("Cannot swap a token for itself. Please select different tokens.");
      isSwappingRef.current = false
      return;
    }

    setIsSwapping(true);
    try {
      await ensureAuth()

      // Validate selected tokens have valid IDs
      if (!selectedRewards?.id && selectedRewards?.id !== 0) {
        toast.error("Invalid source token selected")
        return
      }
      if (!selectedAlgoRewards?.id && selectedAlgoRewards?.id !== 0) {
        toast.error("Invalid destination token selected")
        return
      }

      // Calculate amount using correct decimals
      const multiplier = Math.pow(10, selectedRewards.decimals)
      const microAmount = Math.floor(parseFloat(swapAmount) * multiplier)

      if (isNaN(microAmount) || microAmount <= 0) {
        toast.error("Invalid swap amount")
        return
      }

      // Voi: skip ASA opt-in (ARC-200 boxes handled by swap service)
      // Algorand: check balances and opt-in to ASA tokens
      if (chainId !== 'voi-mainnet') {
        if (selectedRewards.id !== 0) {
          const sourceBalance = await checkAssetBalance(selectedRewards.id);
          if (!sourceBalance.hasAsset) {
            await optInToASA(selectedRewards.id);
          } else if (sourceBalance.balance < microAmount) {
            toast.error(`Insufficient balance. You have ${sourceBalance.balance} but need ${microAmount}`);
            return;
          }
        }
        if (selectedAlgoRewards.id !== 0) {
          const destBalance = await checkAssetBalance(selectedAlgoRewards.id);
          if (!destBalance.hasAsset) {
            await optInToASA(selectedAlgoRewards.id);
          }
        }
      }

      // Price impact guardrails
      const impactPct = parseFloat(priceImpact);
      if (impactPct > 25) {
        toast.error(`Price impact too high (${impactPct.toFixed(1)}%). Swap blocked to protect you from excessive slippage.`);
        return;
      }
      if (impactPct > 10) {
        const proceed = window.confirm(`Warning: Price impact is ${impactPct.toFixed(1)}%. This swap may result in a significant loss. Do you want to proceed?`);
        if (!proceed) return;
      }
      if (impactPct > 5) {
        toast.warning(`High price impact: ${impactPct.toFixed(1)}%`);
      }

      // Fee confirmation gate
      const multiplierForFee = Math.pow(10, selectedRewards.decimals)
      const microAmountForFee = Math.floor(parseFloat(swapAmount) * multiplierForFee)
      const feeConfirmed = await requestFeeConfirmation(microAmountForFee, selectedRewards.decimals, selectedRewards.code)
      if (!feeConfirmed) {
        setIsSwapping(false)
        isSwappingRef.current = false
        return
      }

      let result;
      const quoteAge = Date.now() - quoteTimestampRef.current;

      if (chainId === 'voi-mainnet') {
        // ── Voi: use VoiSwapService ──
        const voiSwapService = voiSwapServiceRef.current ?? new VoiSwapService({
          algodClient: voiAlgod,
          indexerClient: voiIndexer,
          walletSignTransactions: walletSignTransactions,
        });
        const voiProvider = (currentProvider as VoiSwapProvider) || 'nomadex';

        if (quoteAge < 30000 && quoteTimestampRef.current > 0) {
          result = await voiSwapService.performSwapWithProvider(
            selectedRewards.id, selectedAlgoRewards.id,
            BigInt(microAmount), activeAddress, voiProvider, slippageBps
          );
        } else {
          result = await voiSwapService.performSwap(
            selectedRewards.id, selectedAlgoRewards.id,
            BigInt(microAmount), activeAddress, slippageBps
          );
        }
      } else {
        // ── Algorand: existing SwapService ──
        const swapService = swapServiceRef.current ?? new SwapService({
          network: Network.MAINNET,
          algodClient: algodMain,
          walletSignTransactions: walletSignTransactions
        });
        const provider = (currentProvider as SwapProvider) || 'folksrouter';

        if (quoteAge < 30000 && quoteTimestampRef.current > 0) {
          result = await swapService.performSwapWithProvider(
            selectedRewards.id, selectedAlgoRewards.id,
            microAmount, activeAddress, provider, slippageBps
          );
        } else {
          result = await swapService.performSwap(
            selectedRewards.id, selectedAlgoRewards.id,
            microAmount, activeAddress, slippageBps
          );
        }
      }

      if (result.success) {
        const providerNames = {
          folksrouter: 'FolksRouter', vestige: 'Vestige Labs', haystack: 'Haystack Router',
          nomadex: 'Fry Router', humble: 'Fry Router', snowball: 'SnowballSwap',
        };
        const providerName = providerNames[result.provider] || result.provider;
        toast.success(`Swap confirmed via ${providerName}! TXID: ${result.txId}`)

        // Platform fee (best-effort, separate transaction)
        if (feeCalc && feeCalc.feeAmount > 0 && signer && chainId !== 'voi-mainnet') {
          try {
            const feeResult = await routeFeeViaRouter(activeAddress, signer, feeCalc.feeAmount, selectedRewards.id, algodMain, activeChain?.feeRouterAppId, activeChain?.feeRouterAddr)
            logFee({
              appId: 'swap',
              userId: activeAddress,
              gasAmount: feeCalc.feeAmount,
              gasType: 'swap',
              feeType: 'percentage',
              txId: feeResult.txId,
            }).catch(() => {})
          } catch (feeErr) {
            console.warn('Swap fee transfer failed (best-effort):', feeErr)
          }
        }

        // Record swap for event points tracking (fire-and-forget)
        try {
          await authAxios.post('/swaphistory/add', {
            userId: activeAddress,
            amount: parseFloat(swapAmount),
            token1: { id: String(selectedRewards.id), name: selectedRewards.code },
            token2: { id: String(selectedAlgoRewards.id), name: selectedAlgoRewards.code },
            liquidityPoolId: result.provider || 'unknown',
            fee: 0,
          })
        } catch (e) {
          console.warn('Failed to log swap history:', e)
        }
      } else {
        toast.error(`Swap failed: ${result.error || 'All providers failed'}`)
      }
    } catch (err) {
      console.error('Swap failed:', err)
      toast.error("Swap failed: " + (err.message || "Unknown error"));
    } finally {
      setIsSwapping(false);
      isSwappingRef.current = false
    }
  }

  return (
    <div className="w-full mt-[56px] mb-[50px] flex-1">
      <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[10px]">
        <div className="top flex justify-between items-center sm-s:flex-col sm-s:gap-[20px]">
          <h3 className="uppercase font-apex tracking-[1.6px] heading">Swap</h3>
        </div>

        {isLoadingTokens ? (
          <div className="flex justify-center items-center py-20">
            <Spin size="large" />
          </div>
        ) : (
        <div className="bottom flex gap-[16px] max-md:flex-col">
          <div className="max-w-[35%] max-md:max-w-full w-full px-[24px] pt-[29px] pb-[19px] rounded-[22px] bg-[var(--bg-card)] shadow-md">


            <p className="mt-[6px] text-text_clr medium tracking-[0.48px]">
              We find the most efficient path to swap your token
            </p>

            <div className="dropdwon-swap relative mt-[24px] flex flex-col gap-[16px]">
              {/* Dropdown 1 */}
              <div className="algo-div flex flex-col bg-[var(--input-bg)] rounded-[12px] p-[7px]">
               <div className="flex gap-[10px] items-center justify-between">
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  disabled={isSwapping}
                  className="input-wrapper max-xxxl:text-[24px] text-[32px] w-full"
                />
                <div className="relative inline-block text-left" ref={dropdownRefs.rewards}>
                  <div
                    className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--bg-card)] w-[126px] h-[46px] rounded-[6px] py-[9px] px-[12px]"
                    onClick={() => toggleDropdown('rewards')}
                  >
                    {selectedRewards ? (
                      <img src={selectedRewards.img} alt="" width={28} height={28} />
                    ) : (
                      <span className="w-[28px] h-[28px] bg-gray-200 rounded-full animate-pulse inline-block" />
                    )}
                    <div className="flex items-center gap-[4px]">
                      <p className="text-text_clr medium">{selectedRewards ? selectedRewards.code : '...'}</p>
                      <Icon
                        icon={isOpenDropdowns.rewards ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                        width={26}
                        height={26}
                        color="#718096"
                      />
                    </div>
                  </div>
                  {isOpenDropdowns.rewards && (
                    <div className="absolute right-0 mt-2 px-[11px] py-[9px] w-[300px]  bg-[var(--bg-card)] rounded-[10px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)] z-10">
                      <div className="py-[7px] px-[9px] mb-[16px] flex items-center gap-[8px] rounded-[10px] bg-gray shadow-sm">
                        <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                        <input
                          type="search"
                          placeholder="Search token"
                          value={pendingSearchQuery.rewards}
                          onChange={(e) => setPendingSearchQuery((prev) => ({ ...prev, rewards: e.target.value }))}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleSearchSubmit('rewards');
                            }
                          }}
                          className="w-full bg-transparent focus:outline-none"
                        />
                        <button
                          onClick={() => handleSearchSubmit('rewards')}
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                          disabled={isSearching.rewards}
                        >
                          {isSearching.rewards ? '...' : 'Search'}
                        </button>
                      </div>
                      <ul className="py-1 flex flex-col gap-[6px] max-h-[min(60vh,300px)] overflow-y-auto custom-scrollbar">
                        {(() => {
                          const q = searchQuery.rewards?.trim();
                          const currencies = getFilteredCurrencies('rewards');
                          
                          // Show loading state when searching
                          if (q && q.length >= 2 && isSearching.rewards) {
                            return (
                              <li className="px-4 py-2 text-center text-blue-500 text-sm">
                                🔍 Searching for "{q}"...
                              </li>
                            );
                          }
                          
                          // Show search results
                          if (q && q.length >= 2 && currencies.length > 0) {
                            return (
                              <>
                                {currencies.map((currency) => (
                                  <li
                                    key={currency.code}
                                    className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                    onClick={() => selectCurrency(currency, 'rewards')}
                                  >
                                    <img src={currency.img} alt={currency.label} width={28} height={28} onError={(e) => { if (chainId !== 'voi-mainnet') e.currentTarget.src = `https://asa-list.tinyman.org/assets/${currency.id}/icon.png`; }} />
                                    <span className="text-[var(--text-primary)] font-medium">{currency.label}</span>
                                  </li>
                                ))}
                                <li className="px-4 py-2 text-center text-green-500 text-sm">
                                  ✅ Found {currencies.length} tokens matching "{q}"
                                </li>
                              </>
                            );
                          }
                          
                          // Show no results for search
                          if (q && q.length >= 2 && currencies.length === 0) {
                            return (
                              <li className="px-4 py-2 text-center text-red-500 text-sm">
                                ❌ No tokens found for "{q}"
                              </li>
                            );
                          }
                          
                          // Show regular token list
                          if (currencies.length > 0) {
                            return (
                              <>
                                {currencies.map((currency) => (
                                  <li
                                    key={currency.code}
                                    className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                    onClick={() => selectCurrency(currency, 'rewards')}
                                  >
                                    <img src={currency.img} alt={currency.label} width={28} height={28} onError={(e) => { if (chainId !== 'voi-mainnet') e.currentTarget.src = `https://asa-list.tinyman.org/assets/${currency.id}/icon.png`; }} />
                                    <span className="text-[var(--text-primary)] font-medium">{currency.label}</span>
                                  </li>
                                ))}
                                {allCurrencies.length > 100 && (
                                  <li className="px-4 py-2 text-center text-gray-400 text-sm">
                                    Showing top 100 tokens. Search to find more...
                                  </li>
                                )}
                              </>
                            );
                          }
                          
                          return (
                            <li className="px-4 py-2 text-center text-gray-500">No tokens found</li>
                          );
                        })()}
                      </ul>
                    </div>
                  )}
                </div>
               </div>
               <p className="text-text_clr text-xs mt-1 px-1">Balance: {fromBalance} {selectedRewards?.code || ''}</p>
              </div>

              {/* Dropdown 2 (Read-only) */}
              <div className="eth-div flex flex-col bg-[var(--input-bg)] rounded-[12px] p-[7px]">
               <div className="flex gap-[10px] items-center justify-between">
                <div className="relative w-full">
                  {isQuoteLoading ? (
                    <div className="input-wrapper max-xxxl:text-[24px] text-[32px] w-full flex items-center gap-2 text-gray-400">
                      <span
                        style={{
                          display: 'inline-block',
                          width: 18,
                          height: 18,
                          border: '2px solid #d1d5db',
                          borderTopColor: '#3b82f6',
                          borderRadius: '50%',
                          animation: 'quote-spin 0.6s linear infinite',
                        }}
                      />
                      <span className="text-[14px]">Fetching quote...</span>
                      <style>{`@keyframes quote-spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                  ) : (
                    <Input type="number" name="number" value={tokenPerAlgo} className="input-wrapper max-xxxl:text-[24px] text-[32px] w-full" readOnly />
                  )}
                </div>

                <div className="relative inline-block text-left" ref={dropdownRefs.algoRewards}>
                  <div
                    className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--bg-card)] w-[126px] h-[50px] rounded-[6px] py-[9px] px-[12px]"
                    onClick={() => toggleDropdown('algoRewards')}
                  >
                    {selectedAlgoRewards ? (
                      <img src={selectedAlgoRewards.img} alt="" width={28} height={28} onError={(e) => { e.currentTarget.src = '/assets/icons/XRP.png'; }} />
                    ) : (
                      <span className="w-[28px] h-[28px] bg-gray-200 rounded-full animate-pulse inline-block" />
                    )}
                    <div className="flex items-center gap-[4px]">
                      <p className="text-text_clr medium">{selectedAlgoRewards ? selectedAlgoRewards.code : '...'}</p>
                      <Icon
                        icon={isOpenDropdowns.algoRewards ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                        width={26}
                        height={26}
                        color="#718096"
                      />
                    </div>
                  </div>

                  {isOpenDropdowns.algoRewards && (
                    <div className="absolute right-0 mt-2 px-[11px] py-[9px] w-[300px] bg-[var(--bg-card)] rounded-[10px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)] z-10">
                      <div className="py-[7px] px-[9px] mb-[16px] flex items-center gap-[8px] rounded-[10px] bg-gray shadow-sm">
                        <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                        <input
                          type="search"
                          placeholder="Search token"
                          value={pendingSearchQuery.algoRewards}
                          onChange={(e) => setPendingSearchQuery((prev) => ({ ...prev, algoRewards: e.target.value }))}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleSearchSubmit('algoRewards');
                            }
                          }}
                          className="w-full bg-transparent focus:outline-none"
                        />
                        <button
                          onClick={() => handleSearchSubmit('algoRewards')}
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                          disabled={isSearching.algoRewards}
                        >
                          {isSearching.algoRewards ? '...' : 'Search'}
                        </button>
                      </div>

                      <ul className="py-1 flex flex-col gap-[6px] max-h-[min(60vh,300px)] overflow-y-auto custom-scrollbar">
                        {(() => {
                          const q = searchQuery.algoRewards?.trim();
                          const currencies = getFilteredCurrencies('algoRewards');
                          
                          // Show loading state when searching
                          if (q && q.length >= 2 && isSearching.algoRewards) {
                            return (
                              <li className="px-4 py-2 text-center text-blue-500 text-sm">
                                🔍 Searching for "{q}"...
                              </li>
                            );
                          }
                          
                          // Show search results
                          if (q && q.length >= 2 && currencies.length > 0) {
                            return (
                              <>
                                {currencies.map((currency) => (
                                  <li
                                    key={currency.code}
                                    className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                    onClick={() => selectCurrency(currency, 'algoRewards')}
                                  >
                                    <img src={currency.img} alt={currency.label} width={28} height={28} onError={(e) => { if (chainId !== 'voi-mainnet') e.currentTarget.src = `https://asa-list.tinyman.org/assets/${currency.id}/icon.png`; }} />
                                    <span className="text-[var(--text-primary)] font-medium">{currency.label}</span>
                                  </li>
                                ))}
                                <li className="px-4 py-2 text-center text-green-500 text-sm">
                                  ✅ Found {currencies.length} tokens matching "{q}"
                                </li>
                              </>
                            );
                          }
                          
                          // Show no results for search
                          if (q && q.length >= 2 && currencies.length === 0) {
                            return (
                              <li className="px-4 py-2 text-center text-red-500 text-sm">
                                ❌ No tokens found for "{q}"
                              </li>
                            );
                          }
                          
                          // Show regular token list
                          if (currencies.length > 0) {
                            return (
                              <>
                                {currencies.map((currency) => (
                                  <li
                                    key={currency.code}
                                    className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                    onClick={() => selectCurrency(currency, 'algoRewards')}
                                  >
                                    <img src={currency.img} alt={currency.label} width={28} height={28} onError={(e) => { if (chainId !== 'voi-mainnet') e.currentTarget.src = `https://asa-list.tinyman.org/assets/${currency.id}/icon.png`; }} />
                                    <span className="text-[var(--text-primary)] font-medium">{currency.label}</span>
                                  </li>
                                ))}
                                {allCurrencies.length > 100 && (
                                  <li className="px-4 py-2 text-center text-gray-400 text-sm">
                                    Showing top 100 tokens. Search to find more...
                                  </li>
                                )}
                              </>
                            );
                          }
                          
                          return (
                            <li className="px-4 py-2 text-center text-gray-500">No tokens found</li>
                          );
                        })()}
                      </ul>
                    </div>
                  )}
                </div>
               </div>
               <p className="text-text_clr text-xs mt-1 px-1">Balance: {toBalance} {selectedAlgoRewards?.code || ''}</p>
              </div>

              <button
                onClick={() => {
                  // Swap the selected tokens
                  const tempToken = selectedRewards;
                  setSelectedRewards(selectedAlgoRewards);
                  setSelectedAlgoRewards(tempToken);

                  // Swap the amounts if there's a value
                  if (swapAmount !== '0' && tokenPerAlgo !== '0') {
                    setSwapAmount(tokenPerAlgo);
                  }
                }}
                className="absolute left-1/2 transform -translate-x-1/2 top-[50px] cursor-pointer bg-[var(--bg-secondary)] p-2 rounded-full hover:bg-[var(--bg-card-hover)] transition-colors"
                aria-label="Swap tokens"
              >
                <Icon icon="mdi:swap-vertical" width={24} height={24} color="#718096" />
              </button>
            </div>

            <div className="data-div flex flex-col gap-[10px] px-[16px] py-[11px] bg-[var(--bg-secondary)] rounded-[12px] mt-[17px]">
              <div className="flex justify-between items-center gap-[10px]">
                <p className="text-text_clr medium tracking-[0.48px]">Minimum received</p>
                <div className="flex items-center gap-[2px]">
                  <p className="text-[var(--text-primary)] medium tracking-[0.48px] font-medium">
                    {minReceived} {selectedAlgoRewards?.code || ''}
                  </p>
                </div>
              </div>
              <div className="flex justify-between items-center gap-[10px]">
                <p className="text-text_clr medium tracking-[0.48px]">Price</p>
                <div className="flex items-center gap-[2px]">
                  <p className="text-[var(--text-primary)] medium tracking-[0.48px] font-medium">
                    {chainId === 'voi-mainnet' ? 'Price data coming soon' : (priceRate === '0' || priceRate === 'N/A') ? 'Enter amount to see rate' : `1 ${selectedRewards?.code || ''} = ${priceRate} ${selectedAlgoRewards?.code || ''}`}
                  </p>
                </div>
              </div>
              <div className="flex justify-between items-center gap-[10px]">
                <p className="text-text_clr medium tracking-[0.48px]">Max slippage</p>
                <div
                  className="flex items-center gap-[4px] cursor-pointer"
                  onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                >
                  <p className={`medium tracking-[0.48px] font-medium ${
                    slippageBps > 100 ? 'text-yellow-500' : slippageBps < 10 ? 'text-yellow-500' : 'text-green'
                  }`}>
                    {isSimpleMode ? friendlySlippage(slippageBps) : `${(slippageBps / 100).toFixed(slippageBps % 100 === 0 ? 1 : 2)}%`}
                  </p>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-text_clr">
                    <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                </div>
              </div>
              {showSlippageSettings && !isSimpleMode && (
                <div className="flex flex-col gap-[8px] mt-[8px] p-[12px] bg-[var(--bg-card)] rounded-[10px] border border-[var(--border-color)]">
                  <div className="flex gap-[6px]">
                    {[
                      { label: '0.1%', bps: 10 },
                      { label: '0.5%', bps: 50 },
                      { label: '1.0%', bps: 100 },
                    ].map(({ label, bps }) => (
                      <button
                        key={bps}
                        onClick={() => setSlippageBps(bps)}
                        className={`px-[12px] py-[4px] rounded-[8px] text-sm font-medium transition-colors ${
                          slippageBps === bps
                            ? 'bg-green text-white'
                            : 'bg-[var(--bg-secondary)] text-text_clr hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <div className="flex items-center gap-[4px] ml-auto">
                      <input
                        type="number"
                        step="0.1"
                        min="0.01"
                        max="5"
                        value={(slippageBps / 100).toString()}
                        onChange={(e) => {
                          const pct = parseFloat(e.target.value);
                          if (!isNaN(pct)) {
                            const bps = Math.round(Math.min(500, Math.max(1, pct * 100)));
                            setSlippageBps(bps);
                          }
                        }}
                        className="w-[60px] px-[8px] py-[4px] rounded-[8px] bg-[var(--bg-secondary)] text-text_clr text-sm text-right border border-[var(--border-color)] focus:outline-none focus:border-green"
                      />
                      <span className="text-text_clr text-sm">%</span>
                    </div>
                  </div>
                  {slippageBps < 10 && (
                    <p className="text-yellow-500 text-xs">Low slippage — transaction may fail</p>
                  )}
                  {slippageBps > 100 && (
                    <p className="text-yellow-500 text-xs">High slippage — you may receive significantly less</p>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center gap-[10px]">
                <p className="text-text_clr medium tracking-[0.48px]">Price impact</p>
                <div className="flex items-center gap-[2px]">
                  <p className={`medium tracking-[0.48px] font-medium ${
                    parseFloat(priceImpact) > 5 ? 'text-red-500' : 'text-green'
                  }`}>
                    {isSimpleMode ? friendlyPriceImpact(parseFloat(priceImpact)) : `${priceImpact}%`}
                  </p>
                </div>
              </div>
            </div>

            {/* Provider Indicator */}
            <div className="mt-[13px] mb-[8px] flex items-center justify-center">
              <div className="flex items-center gap-[8px] px-[12px] py-[6px] bg-[var(--bg-secondary)] rounded-[8px]">
                <div className={`w-[8px] h-[8px] rounded-full ${
                  currentProvider === 'snowball' ? 'bg-blue-400' :
                  (chainId === 'voi-mainnet' || currentProvider === 'nomadex' || currentProvider === 'humble') ? 'bg-red-500' :
                  currentProvider === 'folksrouter' ? 'bg-blue-500' :
                  currentProvider === 'vestige' ? 'bg-green-500' : 'bg-purple-500'
                }`}></div>
                <span className="text-[12px] text-[var(--text-secondary)] font-medium">
                  Powered by {
                    currentProvider === 'snowball' ? 'SnowballSwap' :
                    chainId === 'voi-mainnet' ? 'Fry Router' :
                    currentProvider === 'folksrouter' ? 'FolksRouter' :
                    currentProvider === 'vestige' ? 'Vestige Labs' :
                    currentProvider === 'haystack' ? 'Haystack Router' : 'Deflex'
                  }
                </span>
              </div>
            </div>

            <Button text={isSwapping ? "Swapping..." : "Swap"} className="button btn-primary" height={53} width="100%" onClick={performSwap} loading={isSwapping} disabled={isSwapping} />
          </div>

                     <div className="chart max-w-[65%] max-md:max-w-full w-full px-[24px] pt-[19px] pb-[21px] rounded-[22px] bg-[var(--bg-card)] shadow-md">
             <div className="flex justify-between items-start mb-[20px]">
               <div>
                 <h4 className="text-[var(--text-primary)] tracking-[0.96px] mt-[3px]">
                   {selectedRewards && selectedAlgoRewards ?
                     (chainId === 'voi-mainnet'
                       ? `${selectedRewards.code}/${selectedAlgoRewards.code} Pool Info`
                       : `${selectedRewards.code}/${selectedAlgoRewards.code} Chart`)
                     : 'Select Tokens'
                   }
                 </h4>
                 <p className="text-text_clr text-sm mt-1">
                   {selectedRewards && selectedAlgoRewards
                     ? chainId === 'voi-mainnet'
                       ? `Pool data from Voi DEXes`
                       : (priceRate === '0' || priceRate === 'N/A') ? 'Enter amount to see current price' : `Current Price: 1 ${selectedRewards.code} = ${priceRate} ${selectedAlgoRewards.code} (Vestige Labs)`
                     : 'Choose tokens to see price data'
                   }
                 </p>
                 {chainId !== 'voi-mainnet' && selectedRewards && selectedAlgoRewards && (
                   <div className="flex items-center gap-4 mt-2">
                     <div className="text-xs">
                       <span className="text-text_clr">Rate: </span>
                       <span className="text-green font-medium">{(priceRate === '0' || priceRate === 'N/A') ? 'Enter amount to see rate' : `1 ${selectedRewards.code} = ${priceRate} ${selectedAlgoRewards.code}`}</span>
                     </div>
                   </div>
                 )}
               </div>
               <div className="text-right">
                 <p className="text-text_clr text-sm">Price Impact</p>
                 <p className={`medium tracking-[0.48px] font-medium ${
                   parseFloat(priceImpact) > 5 ? 'text-red' : 'text-green'
                 }`}>
                   {selectedRewards && selectedAlgoRewards ?
                     `${priceImpact}%` :
                     '0.00%'
                   }
                 </p>
               </div>
             </div>
             <CandleStickChart
               fromToken={selectedRewards}
               toToken={selectedAlgoRewards}
               swapAmount={swapAmount}
               chainId={chainId}
             />
           </div>
        </div>
        )}
      </div>

            <FeeConfirmation
              visible={feeModalVisible}
              onConfirm={onFeeConfirm}
              onCancel={onFeeCancel}
              actionLabel={feeActionLabel}
              feePercent={feeCalc?.feePercent ?? 0}
              feeAmountFormatted={feeAmountFormatted}
              netAmountFormatted={netAmountFormatted}
              loading={feeLoading}
            />

            <ConnectWallet
              openModal={openWalletModal}
              closeModal={() => setOpenWalletModal(false)}
            />

    </div>
  )
}

export default SwapMain
