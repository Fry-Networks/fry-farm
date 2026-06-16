import { toast } from 'react-toastify'
import { Icon } from '@iconify/react'
import { DatePicker, Modal } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import Button from '../../components/shared/button'
import Input from '../../components/shared/input'
import { useWallet } from '@txnlab/use-wallet'
import * as farming from '../../farming_func'
import dayjs from 'dayjs'
import { tokenServiceInstance as tokenService } from '../../services/TokenService'
import { authAxios } from '../../services/apiClient'
import { useAuth } from '../../hooks/useAuth'
import { useChain } from '../../context/ChainContext'

interface Currency {
  tokenId: number
  tokenName: string
  tokenSymbol: string
  tokenImage: string
}
// Optionally pin FRY at the top (if set)
const FRY_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID ?? 0)
interface AddFarmProps {
  isaddFarmOpen: boolean
  setisaddFarmOpen: (state: boolean) => void
  fetchData: () => Promise<void> // <-- Add this line
}

const AddFarmModal: React.FC<AddFarmProps> = ({ isaddFarmOpen, setisaddFarmOpen }) => {
  const { signer, activeAddress } = useWallet()
  const { chainId } = useChain()
  const { ensureAuth } = useAuth()
  const isWalletConnected = !!activeAddress && !!signer

  const [formData, setFormData] = useState({
    lpTokenA: '',
    lpTokenB: '',
    rewardToken: '',
    rewardAmount: '',
    farmStart: null as Date | null,
    farmDuration: '',
    lockPeriod: '',
    entryFee: '',
    distributionRate: '',
    distributionSchedule: '', // optional now, but can be kept for compatibility
    rewardFee: '',
    distributionType: 'daily', // ✅ NEW
    customScheduleDays: '', // ✅ NEW
  })

  const [allTokens, setAllTokens] = useState<Currency[]>([])
  const [defaultTokens, setDefaultTokens] = useState<Currency[]>([])
  const [selectedTokenA, setSelectedTokenA] = useState<Currency | null>(null)
  const [selectedTokenB, setSelectedTokenB] = useState<Currency | null>(null)
  const [selectedRewardToken, setSelectedRewardToken] = useState<Currency | null>(null)
  const [searchQuery, setSearchQuery] = useState<{ [key: string]: string }>({
    tokenA: '',
    tokenB: '',
    rewardToken: '',
  })
  const [pendingSearchQuery, setPendingSearchQuery] = useState<{ [key: string]: string }>({
    tokenA: '',
    tokenB: '',
    rewardToken: '',
  })
  const [searchResults, setSearchResults] = useState<{ [key: string]: Currency[] }>({
    tokenA: [],
    tokenB: [],
    rewardToken: [],
  })
  const [isSearching, setIsSearching] = useState<{ [key: string]: boolean }>({
    tokenA: false,
    tokenB: false,
    rewardToken: false,
  })
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const resetForm = () => {
    setFormData({
      lpTokenA: '',
      lpTokenB: '',
      rewardToken: '',
      rewardAmount: '',
      farmStart: null,
      farmDuration: '',
      lockPeriod: '',
      entryFee: '',
      distributionRate: '',
      distributionSchedule: '',
      rewardFee: '',
      distributionType: 'daily',
      customScheduleDays: '',
    })
    setSelectedTokenA(null)
    setSelectedTokenB(null)
    setSelectedRewardToken(null)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleVerifyDetails = async () => {
    const {
      lpTokenA,
      lpTokenB,
      rewardToken,
      rewardAmount,
      farmStart,
      farmDuration,
      lockPeriod,
      distributionRate,
      // rewardFee,
      distributionType,
      customScheduleDays,
    } = formData

    if (!signer || !activeAddress) {
      toast.error('Wallet not connected.')
      return
    }

    const missingFields: string[] = []

    if (!lpTokenA.trim()) missingFields.push('LP Token A')
    if (!lpTokenB.trim()) missingFields.push('LP Token B')
    if (!rewardToken.trim()) missingFields.push('Reward Token')
    if (!rewardAmount.trim()) missingFields.push('Reward Amount')
    if (!farmStart) missingFields.push('Farm Start Date')
    if (!farmDuration.trim()) missingFields.push('Farm Duration')
    if (!lockPeriod.trim()) missingFields.push('Lock Period')
    // if (!entryFee.trim()) missingFields.push('Entry Fee');
    if (!distributionRate.trim()) missingFields.push('Distribution Rate')
    // if (!rewardFee.trim()) missingFields.push('Reward Fee');
    if (!distributionType?.trim()) {
      missingFields.push('Distribution Type')
    }
    if (distributionType === 'custom' && !customScheduleDays.trim()) {
      missingFields.push('Custom Schedule Days')
    }

    if (distributionType === 'custom' && (isNaN(parseInt(customScheduleDays)) || parseInt(customScheduleDays) <= 0)) {
      toast.error('Custom schedule days must be a valid positive number.')
      return
    }

    if (missingFields.length > 0) {
      toast.error(`Please fill in the following fields: ${missingFields.join(', ')}`)
      return
    }

    if (Number(String(rewardAmount).replace(/,/g, '')) <= 0) {
      toast.error('Reward amount must be greater than 0.')
      return
    }

    // Validate token IDs are valid numbers
    if (isNaN(Number(lpTokenA)) || Number(lpTokenA) < 0) {
      toast.error('LP Token A must be a valid token ID.')
      return
    }

    if (isNaN(Number(lpTokenB)) || Number(lpTokenB) < 0) {
      toast.error('LP Token B must be a valid token ID.')
      return
    }

    if (isNaN(Number(rewardToken)) || Number(rewardToken) < 0) {
      toast.error('Reward Token must be a valid token ID.')
      return
    }

    // Validate numeric fields to prevent NaN values
    if (isNaN(parseInt(lockPeriod)) || parseInt(lockPeriod) <= 0) {
      toast.error('Lock period must be a valid positive number.')
      return
    }

    if (isNaN(parseInt(distributionRate)) || parseInt(distributionRate) <= 0) {
      toast.error('Distribution rate must be a valid positive number.')
      return
    }

    if (isNaN(parseInt(farmDuration)) || parseInt(farmDuration) <= 0) {
      toast.error('Farm duration must be a valid positive number.')
      return
    }

    setIsSubmitting(true)

    try {
      await ensureAuth();
      const start = farmStart ? Math.floor(farmStart.getTime() / 1000) : 0
      const end = start + parseInt(farmDuration) * 86400

      let scheduleInSeconds = 86400
      switch (formData.distributionType) {
        case 'daily':
          scheduleInSeconds = 1 * 86400
          break
        case 'weekly':
          scheduleInSeconds = 7 * 86400
          break
        case 'monthly':
          scheduleInSeconds = 30 * 86400
          break
        case 'custom':
          scheduleInSeconds = parseInt(formData.customScheduleDays || '0') * 86400
          break
      }

      // ✅ Inject converted value into formData so old code keeps working
      formData.distributionSchedule = String(scheduleInSeconds)
      const fryToken = import.meta.env.VITE_FRY_TOKEN_ID

      // Additional safety checks to prevent NaN values
      const lockPeriodSeconds = parseInt(lockPeriod) * 86400
      const distributionRateValue = parseInt(distributionRate)
      const distributionScheduleValue = parseInt(formData.distributionSchedule)

      // Final validation to ensure no NaN values
      if (isNaN(lockPeriodSeconds) || isNaN(distributionRateValue) || isNaN(distributionScheduleValue)) {
        toast.error('Invalid numeric values detected. Please check your input.')
        return
      }

      // Deploy smart contract
      const result = await farming.initFarming(signer, activeAddress, {
        lpTokenA: Number(lpTokenA),
        lpTokenB: Number(lpTokenB),
        rewardToken: Number(rewardToken),
        rewardAmount: Number(String(rewardAmount).replace(/,/g, '')) * 1_000_000,
        apr: 1000,
        lockPeriod: lockPeriodSeconds,
        farmStart: start,
        farmEnd: end,
        // farmEnd: 1743190800,
        farmEntryFee: 0,
        fryRewardFee: 0,
        rewardDistributionRate: distributionRateValue,
        rewardDistributionSchedule: distributionScheduleValue,
        fryToken: Number(fryToken),
      })

      const appId = result?.appId
      if (!appId) throw new Error('App ID not returned from contract.')

      // 🧠 Save to backend DB
      const payload = {
        creatorId: activeAddress,
        lpToken: { tokenA: String(lpTokenA), tokenB: String(lpTokenB) },
        rewardToken: { id: String(rewardToken) },
        rewardTokenAmount: Number(String(rewardAmount).replace(/,/g, '')) * 1_000_000,
        farmStartTime: start,
        farmEndTime: end,
        duration: parseInt(farmDuration) * 86400,
        lockPeriod: lockPeriodSeconds,
        farmEntryFee: 0,
        rewardDistributionRate: distributionRateValue,
        rewardDistributionSchedule: distributionScheduleValue,
        fryRewardFee: 0,
        aprRate: 0,
        appId: String(appId),
        lpPairName: `${selectedTokenA?.tokenSymbol || 'Token A'} / ${selectedTokenB?.tokenSymbol || 'Token B'}`,
        rewardTokenName: selectedRewardToken?.tokenName || '',
        rewardTokenSymbol: selectedRewardToken?.tokenSymbol || '',
      }

      const response = await authAxios.post('/farming/add', payload)

      if (response.status >= 200 && response.status < 300) {
        toast.success('Farming pool created!')
        resetForm()
        setTimeout(() => setisaddFarmOpen(false), 500)
      } else {
        toast.warning('Farming created on-chain but failed to save to DB.')
      }
    } catch (e) {
      console.error('Error creating farming pool:', e)
      
      // Extract meaningful error message
      let errorMessage = 'Transaction failed or was rejected.'
      let errorDetails = ''
      
      if (e instanceof Error) {
        const errorMsg = e.message
        errorMessage = errorMsg
        
        // Check for balance errors - improved parsing
        if (errorMsg.includes('balance') && (errorMsg.includes('below min') || errorMsg.includes('below minimum'))) {
          // Match patterns like:
          // "balance 200000 below min 300000 (2 assets)"
          // "account ... balance 200000 below min 300000"
          const balanceMatch = errorMsg.match(/balance\s+(\d+)\s+below\s+(?:min|minimum)\s+(\d+)/i);
          const accountMatch = errorMsg.match(/account\s+([A-Z0-9]{58})/i);
          const assetsMatch = errorMsg.match(/\((\d+)\s+assets?\)/i);
          
          if (balanceMatch) {
            const currentBalance = parseInt(balanceMatch[1]);
            const minBalance = parseInt(balanceMatch[2]);
            const currentBalanceAlgo = (currentBalance / 1_000_000).toFixed(2);
            const minBalanceAlgo = (minBalance / 1_000_000).toFixed(2);
            const neededAlgo = ((minBalance - currentBalance) / 1_000_000).toFixed(2);
            const assetCount = assetsMatch ? assetsMatch[1] : 'multiple';
            
            // Check if this is about the contract account (not user's wallet)
            const isContractAccount = accountMatch && accountMatch[1] && activeAddress && accountMatch[1] !== activeAddress;
            
            if (isContractAccount) {
              errorMessage = `Contract Account Needs More ALGO`;
              errorDetails = `The farming pool contract account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to hold ${assetCount} asset(s). The system will automatically send more ALGO to the contract. Please ensure your wallet has enough ALGO (at least ${neededAlgo} more) to cover this requirement and try again.`;
            } else {
              errorMessage = `Insufficient ALGO Balance`;
              errorDetails = `The account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to create a farming pool with ${assetCount} asset(s). Please ensure you have at least ${neededAlgo} more ALGO available.`;
            }
          } else {
            // Fallback for other balance error formats
            const minBalanceMatch = errorMsg.match(/(?:min|minimum)\s+(\d+)/i);
            const minBalance = minBalanceMatch ? parseInt(minBalanceMatch[1]) : 300000;
            const minBalanceAlgo = (minBalance / 1_000_000).toFixed(2);
            errorMessage = `Insufficient ALGO Balance`;
            errorDetails = `The contract account needs at least ${minBalanceAlgo} ALGO to create a farming pool. Please ensure your wallet has enough ALGO to cover this requirement.`;
          }
        } 
        // Check for asset/token errors
        else if (errorMsg.includes('does not exist') || errorMsg.includes('has been deleted')) {
          const assetIdMatch = errorMsg.match(/asset\s+(\d+)/i);
          const assetId = assetIdMatch ? assetIdMatch[1] : 'selected';
          errorMessage = 'Invalid Token';
          errorDetails = `The ${assetId === 'selected' ? 'selected' : `token (ID: ${assetId})`} does not exist on the Algorand network or has been deleted. Please select a different token and try again.`;
        } 
        else if (errorMsg.includes('xaid') || errorMsg.includes('asset ID') || errorMsg.includes('empty or 0')) {
          errorMessage = 'Invalid Token';
          errorDetails = 'One or more selected tokens are invalid. Please select valid tokens and try again.';
        } 
        // Check for transaction rejection
        else if (errorMsg.includes('rejected') || errorMsg.includes('User rejected')) {
          errorMessage = 'Transaction Rejected';
          errorDetails = 'The transaction was rejected. Please try again.';
        } 
        // Check for insufficient balance (general)
        else if (errorMsg.includes('insufficient')) {
          errorMessage = 'Insufficient Balance';
          errorDetails = 'Your wallet does not have enough balance to complete this transaction. Please add more ALGO to cover transaction fees and minimum balance requirements.';
        } 
        // Check for network errors
        else if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED')) {
          errorMessage = 'Network Error';
          errorDetails = 'Unable to connect to the Algorand network. Please check your internet connection and try again.';
        } 
        // Check for resource population errors (Algorand specific)
        else if (errorMsg.includes('resource population') || errorMsg.includes('simulation')) {
          // Try to extract balance info from resource errors
          const balanceMatch = errorMsg.match(/balance\s+(\d+)\s+below\s+(?:min|minimum)\s+(\d+)/i);
          const accountMatch = errorMsg.match(/account\s+([A-Z0-9]{58})/i);
          const assetsMatch = errorMsg.match(/\((\d+)\s+assets?\)/i);
          
          if (balanceMatch) {
            const currentBalance = parseInt(balanceMatch[1]);
            const minBalance = parseInt(balanceMatch[2]);
            const currentBalanceAlgo = (currentBalance / 1_000_000).toFixed(2);
            const minBalanceAlgo = (minBalance / 1_000_000).toFixed(2);
            const neededAlgo = ((minBalance - currentBalance) / 1_000_000).toFixed(2);
            const assetCount = assetsMatch ? assetsMatch[1] : 'multiple';
            
            // Check if this is about the contract account (not user's wallet)
            const isContractAccount = accountMatch && accountMatch[1] && activeAddress && accountMatch[1] !== activeAddress;
            
            if (isContractAccount) {
              errorMessage = 'Contract Account Needs More ALGO';
              errorDetails = `The farming pool contract account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to hold ${assetCount} asset(s). The system will automatically send more ALGO to the contract. Please ensure your wallet has enough ALGO (at least ${neededAlgo} more) to cover this requirement and try again.`;
            } else {
              errorMessage = 'Insufficient ALGO Balance';
              errorDetails = `The account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to complete this transaction. Please ensure you have at least ${neededAlgo} more ALGO available.`;
            }
          } else {
            errorMessage = 'Transaction Simulation Failed';
            errorDetails = 'The transaction could not be processed. This may be due to insufficient balance or network issues. Please check your wallet balance and try again.';
          }
        }
        // Check for App ID errors
        else if (errorMsg.includes('App ID not returned') || errorMsg.includes('appId')) {
          errorMessage = 'Failed to Create Farming Pool';
          errorDetails = 'The farming pool contract was not created successfully. Please check your inputs and try again.';
        }
        // Check for specific error messages
        else if (errorMsg.includes('Failed to create') || errorMsg.includes('Failed to save')) {
          errorMessage = 'Failed to Create Farming Pool';
          errorDetails = errorMsg;
        }
        // Generic error - show the original message if it's informative
        else if (errorMsg.length > 0 && errorMsg !== 'Error') {
          errorMessage = 'Transaction Error';
          errorDetails = errorMsg;
        }
      } else if (typeof e === 'string') {
        errorMessage = 'Transaction Error';
        errorDetails = e;
      }
      
      // Display error with details
      const fullErrorMessage = errorDetails 
        ? `${errorMessage}\n\n${errorDetails}` 
        : errorMessage;
      
      toast.error(fullErrorMessage, {
        autoClose: 8000,
        style: { 
          whiteSpace: 'pre-line',
          maxWidth: '400px'
        },
        className: 'error-toast'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (isaddFarmOpen) {
      fetchTokens()
    }
  }, [isaddFarmOpen])

  // Handle search submission (only when submit button is clicked)
  const handleSearchSubmit = async (dropdown: 'tokenA' | 'tokenB' | 'rewardToken') => {
    const query = pendingSearchQuery[dropdown]?.trim();
    
    if (!query || query.length < 2) {
      toast.error('Please enter at least 2 characters to search');
      return;
    }

    // Update search query to trigger search
    setSearchQuery(prev => ({ ...prev, [dropdown]: query }));
    setIsSearching(prev => ({ ...prev, [dropdown]: true }));
    
    try {
      const searchTokens = await tokenService.searchTokens(query);
      const searchCurrencies = searchTokens.map(token => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image
      }));

      setSearchResults(prev => ({ ...prev, [dropdown]: searchCurrencies }));
    } catch (error) {
      console.error(`Search error for ${dropdown}:`, error);
      setSearchResults(prev => ({ ...prev, [dropdown]: [] }));
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(prev => ({ ...prev, [dropdown]: false }));
    }
  };
  const fetchTokens = async () => {
    try {
      // Get default tokens first
      const defaultTokensList = tokenService.getDefaultTokens();
      const defaultCurrencies: Currency[] = defaultTokensList.map(token => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image
      }));
      setDefaultTokens(defaultCurrencies);
      
      // Fetch tokens from database using TokenService
      const tokens = await tokenService.fetchAllTokens();
      
      // Convert Token format to Currency format for this modal
      const currencies: Currency[] = tokens.map(token => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image
      }));
      
      // Pin FRY token to the top if it exists
      const FRY_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID ?? 0);
      const isFryToken = (c: Currency) => 
        c.tokenId === FRY_ID || 
        c.tokenSymbol.toLowerCase().includes('fry') || 
        c.tokenName.toLowerCase().includes('fry');
      
      const fryToken = currencies.find(isFryToken);
      if (fryToken) {
        const otherTokens = currencies.filter(c => !isFryToken(c));
        const sortedTokens = [fryToken, ...otherTokens];
        setAllTokens(sortedTokens);
        
        // Defaults: LP tokens exclude ALGO, use default tokens first
        const defaultLpList = defaultCurrencies.filter((t) => t.tokenId !== 0);
        const lpList = defaultLpList.length > 0 ? defaultLpList : sortedTokens.filter((t) => t.tokenId !== 0);
        setSelectedTokenA(lpList[0] || null);
        setSelectedTokenB(null);  // User must explicitly choose Token B
        // Reward token can be any (prefer default tokens first)
        const rewardDefault = defaultCurrencies[0] || sortedTokens.find((t) => isFryToken(t)) || sortedTokens[0] || null;
        setSelectedRewardToken(rewardDefault);
        // Sync formData so validation sees the auto-selected tokens
        setFormData((prev) => ({
          ...prev,
          lpTokenA: (lpList[0]?.tokenId ?? '').toString(),
          lpTokenB: '',
          rewardToken: (rewardDefault?.tokenId ?? '').toString(),
        }));
      } else {
        setAllTokens(currencies);

        // Defaults: LP tokens exclude ALGO, use default tokens first
        const defaultLpList = defaultCurrencies.filter((t) => t.tokenId !== 0);
        const lpList = defaultLpList.length > 0 ? defaultLpList : currencies.filter((t) => t.tokenId !== 0);
        setSelectedTokenA(lpList[0] || null);
        setSelectedTokenB(null);  // User must explicitly choose Token B
        const rewardDefault2 = defaultCurrencies[0] || currencies[0] || null;
        setSelectedRewardToken(rewardDefault2);
        // Sync formData so validation sees the auto-selected tokens
        setFormData((prev) => ({
          ...prev,
          lpTokenA: (lpList[0]?.tokenId ?? '').toString(),
          lpTokenB: '',
          rewardToken: (rewardDefault2?.tokenId ?? '').toString(),
        }));
      }
      
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
      
      // Get default tokens
      const defaultTokensList = tokenService.getDefaultTokens();
      const defaultCurrencies: Currency[] = defaultTokensList.map(token => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image
      }));
      setDefaultTokens(defaultCurrencies);
      
      // Fallback to essential tokens
      const fallbackTokens: Currency[] = [
        { tokenId: 0, tokenName: 'Algorand', tokenSymbol: 'ALGO', tokenImage: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/0/icon.png' },
        { tokenId: 31566704, tokenName: 'USD Coin', tokenSymbol: 'USDC', tokenImage: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/31566704/icon.png' },
        { tokenId: 312769, tokenName: 'Tether USD', tokenSymbol: 'USDT', tokenImage: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/312769/icon.png' },
        { tokenId: 2485314946, tokenName: 'Fry', tokenSymbol: 'FRY', tokenImage: '/assets/images/fry-token.png' }
      ];
      
      setAllTokens(fallbackTokens);
      
      // Defaults: LP tokens exclude ALGO, use default tokens first
      const defaultLpList = defaultCurrencies.filter((t) => t.tokenId !== 0);
      const lpList = defaultLpList.length > 0 ? defaultLpList : fallbackTokens.filter((t) => t.tokenId !== 0);
      setSelectedTokenA(lpList[0] || null);
      setSelectedTokenB(null);  // User must explicitly choose Token B
      const rewardDefault3 = defaultCurrencies[0] || fallbackTokens[0] || null;
      setSelectedRewardToken(rewardDefault3);
      // Sync formData so validation sees the auto-selected tokens
      setFormData((prev) => ({
        ...prev,
        lpTokenA: (lpList[0]?.tokenId ?? '').toString(),
        lpTokenB: '',
        rewardToken: (rewardDefault3?.tokenId ?? '').toString(),
      }));
    }
  };
  // Helper to get filtered currencies for each dropdown
  const getFilteredCurrencies = (dropdown: 'tokenA' | 'tokenB' | 'rewardToken') => {
    const q = (searchQuery[dropdown] || '').trim().toLowerCase();
    const searchResultsForDropdown = searchResults[dropdown] || [];
    
    // If searching and we have search results, use them
    if (q && q.length >= 2 && searchResultsForDropdown.length > 0) {
      return searchResultsForDropdown;
    }
    
    // If searching but no results yet, show loading or empty state
    if (q && q.length >= 2) {
      if (isSearching[dropdown]) {
        return []; // Will show loading state in UI
      }
      return []; // Will show "no results" in UI
    }
    
    // When not searching, show default tokens first
    return defaultTokens.length > 0 ? defaultTokens : allTokens;
  };

  const handleChange = (key: string, value: string | Date | null) => {
    if (!isWalletConnected) {
      toast.error('Wallet should be connected to farm')
      return
    }
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const renderTokenDropdown = (label: string, selectedToken: Currency | null, setSelectedToken: (token: Currency) => void, key: 'tokenA' | 'tokenB' | 'rewardToken') => {
    // Map dropdown keys to form data keys
    const formDataKey = key === 'tokenA' ? 'lpTokenA' : key === 'tokenB' ? 'lpTokenB' : 'rewardToken';
    
    // Get filtered currencies using the new search functionality
    const currencies = getFilteredCurrencies(key);
    
    // Apply additional filtering based on dropdown type
    const filteredTokens =
      key === 'rewardToken'
        ? currencies // Include all tokens including ALGO for reward tokens
        : currencies.filter((token) => token.tokenId !== 0) // Exclude ALGO for LP tokens

    return (
      <div className="flex flex-col gap-[10px] relative">
        <p className="large text-black">{label}</p>
        <div
          className="flex items-center justify-between gap-[13px] cursor-pointer bg-[#F5F5F5] w-full h-[54px] rounded-[6px] py-[9px] px-[12px]"
          onClick={() => {
            if (!isWalletConnected) {
              toast.error('Wallet should be connected to farm')
              return
            }
            setOpenDropdown(openDropdown === key ? null : key)
          }}
        >
          {selectedToken ? (
            <div className="flex items-center gap-[8px]">
              <img src={selectedToken.tokenImage} alt="" width={28} height={28} />
              <div className="flex flex-col">
                <p className="text-text_clr medium">{selectedToken.tokenName}</p>
                <p className="text-text_clr e-small">{selectedToken.tokenSymbol}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Select Token</p>
          )}
          <Icon icon={openDropdown === key ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={24} />
        </div>

        {openDropdown === key && (
          <div className="absolute top-[80px] left-0 right-0 z-50 bg-white rounded-[10px] shadow p-3 max-h-[200px] overflow-y-auto custom-scrollbar">
            <div className="py-[7px] px-[9px] mb-[16px] flex items-center gap-[8px] rounded-[10px] bg-gray shadow-sm">
              <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
              <input
                type="search"
                placeholder="Search token"
                value={pendingSearchQuery[key]}
                onChange={(e) => setPendingSearchQuery(prev => ({ ...prev, [key]: e.target.value }))}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchSubmit(key);
                  }
                }}
                className="w-full bg-transparent focus:outline-none"
              />
              <button
                onClick={() => handleSearchSubmit(key)}
                className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                disabled={isSearching[key]}
              >
                {isSearching[key] ? '...' : 'Search'}
              </button>
            </div>
            {(() => {
              const q = searchQuery[key]?.trim();
              const isSearchingForDropdown = isSearching[key] || false;
              
              // Show loading state when searching
              if (q && q.length >= 2 && isSearchingForDropdown) {
                return (
                  <div className="px-4 py-2 text-center text-blue-500 text-sm">
                    🔍 Searching for "{q}"...
                  </div>
                );
              }
              
              // Show search results
              if (q && q.length >= 2 && filteredTokens.length > 0) {
                return (
                  <>
                    {filteredTokens.map((token) => (
                      <div
                        key={token.tokenId}
                        className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => {
                          setSelectedToken(token)
                          setFormData((prev) => ({ ...prev, [formDataKey]: token.tokenId.toString() }))
                          setOpenDropdown(null)
                        }}
                      >
                        <img src={token.tokenImage} alt={token.tokenName} width={28} />
                        <div>
                          <p className="font-medium">{token.tokenName}</p>
                          <p className="text-sm text-gray-500">{token.tokenSymbol}</p>
                        </div>
                      </div>
                    ))}
                    <div className="px-4 py-2 text-center text-green-500 text-sm">
                      ✅ Found {filteredTokens.length} tokens matching "{q}"
                    </div>
                  </>
                );
              }
              
              // Show no results for search
              if (q && q.length >= 2 && filteredTokens.length === 0) {
                return (
                  <div className="px-4 py-2 text-center text-red-500 text-sm">
                    ❌ No tokens found for "{q}"
                  </div>
                );
              }
              
              // Show regular token list
              if (filteredTokens.length > 0) {
                return filteredTokens.map((token) => (
                  <div
                    key={token.tokenId}
                    className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setSelectedToken(token)
                      setFormData((prev) => ({ ...prev, [formDataKey]: token.tokenId.toString() }))
                      setOpenDropdown(null)
                    }}
                  >
                    <img src={token.tokenImage} alt={token.tokenName} width={28} />
                    <div>
                      <p className="font-medium">{token.tokenName}</p>
                      <p className="text-sm text-gray-500">{token.tokenSymbol}</p>
                    </div>
                  </div>
                ));
              }
              
              return (
                <div className="px-4 py-2 text-center text-gray-500">No tokens found</div>
              );
            })()}
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal open={isaddFarmOpen} onCancel={() => setisaddFarmOpen(false)} className="del-modal" centered width="415px" footer={null}>
      <div className="modal-content flex flex-col pt-[24px] pb-[31px] px-[31px]">
        <h5 className="text-black font-apex text-center">Add Farm</h5>
        {!isWalletConnected && <p className="text-red-500 italic text-sm text-center mt-2">Wallet should be connected to farm</p>}
        <div className="red-line w-full h-[1px] mt-[25px] mb-[19px]" />
        <div className="max-h-[80vh] overflow-y-auto custom-scrollbar px-[10px]">
          <div className="flex flex-col gap-[16px]">
            {/* LP Token A */}
            {/* <div className="flex flex-col gap-[10px]">
              <p className="large text-black">LP Token A (ASA ID)</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Enter LP Token A ID"
                  value={formData.lpTokenA}
                  onChange={(e) => handleChange('lpTokenA', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div> */}

            {/* LP Token B */}
            {/* <div className="flex flex-col gap-[10px]">
              <p className="large text-black">LP Token B (ASA ID)</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Enter LP Token B ID"
                  value={formData.lpTokenB}
                  onChange={(e) => handleChange('lpTokenB', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div> */}

            {/* Reward Token */}
            {/* <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Reward Token (ASA ID)</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Enter Reward Token ID"
                  value={formData.rewardToken}
                  onChange={(e) => handleChange('rewardToken', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div> */}

            {renderTokenDropdown('LP Token A (ASA ID)', selectedTokenA, setSelectedTokenA, 'tokenA')}
            {renderTokenDropdown('LP Token B (ASA ID)', selectedTokenB, setSelectedTokenB, 'tokenB')}
            {renderTokenDropdown('Reward Token (ASA ID)', selectedRewardToken, setSelectedRewardToken, 'rewardToken')}

            {/* Reward Amount */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Reward Amount</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Total tokens to distribute (e.g. 10000)"
                  value={formData.rewardAmount}
                  onChange={(e) => handleChange('rewardAmount', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div>

            {/* Start Date */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Start</p>
              {/* <DatePicker
                className="w-full mt-[6px]"
                onChange={(date) => handleChange('farmStart', date?.toDate() || null)}
              /> */}
              <DatePicker
                className="w-full mt-[6px]"
                value={formData.farmStart ? dayjs(formData.farmStart) : null}
                onChange={(date) => handleChange('farmStart', date?.toDate() || null)}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
                placeholder="Select start date"
              />
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Duration</p>
              <div className="algo-div flex gap-[10px] items-center justify-between bg-[#F5F5F5] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                <Input
                  type="number"
                  placeholder="Farm duration in days"
                  value={formData.farmDuration}
                  onChange={(e) => handleChange('farmDuration', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
                <p className="text-text_clr medium">Days</p>
              </div>
            </div>

            {/* Lock Period */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Lock</p>
              <div className="algo-div flex gap-[10px] items-center justify-between bg-[#F5F5F5] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                <Input
                  type="number"
                  placeholder="Lock period in days"
                  value={formData.lockPeriod}
                  onChange={(e) => handleChange('lockPeriod', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
                <p className="text-text_clr medium">Days</p>
              </div>
            </div>

            {/* Entry Fee */}
            {/* <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Entry Fee (ALGO)</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Entry fee in ALGO"
                  value={formData.entryFee}
                  onChange={(e) => handleChange('entryFee', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div> */}

            {/* Distribution Rate */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Reward Distribution Rate (%)</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Distribution rate %"
                  value={formData.distributionRate}
                  onChange={(e) => handleChange('distributionRate', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div>

            {/* Distribution Schedule */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Reward Distribution Schedule</p>

              <select
                value={formData.distributionType}
                onChange={(e) => handleChange('distributionType', e.target.value)}
                className="input-wrapper text-[16px] w-full bg-[#F5F5F5] rounded-[12px] p-[10px]"
              >
                <option value="daily">Daily (1 day)</option>
                <option value="weekly">Weekly (7 days)</option>
                <option value="monthly">Monthly (30 days)</option>
                <option value="custom">Custom</option>
              </select>

              {formData.distributionType === 'custom' && (
                <div className="flex flex-col mt-2">
                  <Input
                    type="number"
                    placeholder="Custom duration in days"
                    value={formData.customScheduleDays}
                    onChange={(e) => handleChange('customScheduleDays', e.target.value)}
                    className="input-wrapper text-[16px] w-full mt-1"
                  />
                </div>
              )}
            </div>

            {/* Reward Fee */}
            {/* <div className="flex flex-col gap-[10px]">
              <p className="large text-black">Reward Fee (%)</p>
              <div className="bg-[#F5F5F5] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="Fee on reward %"
                  value={formData.rewardFee}
                  onChange={(e) => handleChange('rewardFee', e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                />
              </div>
            </div> */}

            <div className="flex flex-col gap-[12px] items-center justify-center mt-[30px]">
              <Button
                text={isSubmitting ? 'Creating... Please wait' : 'Create Farming Pool'}
                className="button btn-primary"
                height={53}
                width="100%"
                onClick={handleVerifyDetails}
                disabled={isSubmitting || !isWalletConnected}
              />

              {/* <Button
                text="Claim"
                className="button btn-primary"
                height={45}
                width={106}
                onClick={async () => {
                  try {
                    const result = await helloClient.hello([])
                    console.log('✅ Hello returned:', result.return)
                    alert(`Smart Contract says: ${result.return}`)
                  } catch (error) {
                    console.error('Failed to call hello:', error)
                    alert('Contract call failed')
                  }
                }}
              /> */}

              {/* <Button
                text="Create Farming Pool"
                className="button btn-primary"
                height={50}
                width={220}
                onClick={handleCreateFarming}
              /> */}

              {/* <p className="text-text_clr medium">
                Can’t find your token? <span className="text-link cursor-pointer">Add token here</span>
              </p> */}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default AddFarmModal
