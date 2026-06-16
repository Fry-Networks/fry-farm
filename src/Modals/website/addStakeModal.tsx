import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { useChain } from '../../context/ChainContext'
import { DatePicker, Modal } from 'antd'
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import Button from '../../components/shared/button'
import Input from '../../components/shared/input'
import APRCalculator from '../../components/shared/APRCalculator'
import { initStaking } from '../../staking_func'
import { tokenServiceInstance as tokenService } from '../../services/TokenService'
import { authAxios } from '../../services/apiClient'
import { useAuth } from '../../hooks/useAuth'
interface AddstakeProps {
  isaddStakeOpen: boolean
  setisaddStakeOpen: (state: boolean) => void
  fetchData: () => void
}

interface Currency {
  tokenId: number
  tokenName: string
  tokenSymbol: string
  tokenImage: string
  decimals?: number
}
// Optionally pin FRY at the top (if set)
const FRY_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID ?? 0)

// Helper function to validate image URL
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

const Addstake: React.FC<AddstakeProps> = ({ isaddStakeOpen, setisaddStakeOpen, fetchData }) => {

  const [allTokens, setAllTokens] = useState<Currency[]>([])
  const [defaultTokens, setDefaultTokens] = useState<Currency[]>([])
  const [isOpenDropdowns, setIsOpenDropdowns] = useState<{ [key: string]: boolean }>({
    stakingToken: false,
    rewards: false,
    algoRewards: false,
  })
  const { providers } = useWallet()
  const { activeAddress, signer: multiSigner } = useMultiChainWallet()
  const { chainId } = useChain()
  const signer = multiSigner!
  const { ensureAuth } = useAuth()
  const [searchQuery, setSearchQuery] = useState<{ [key: string]: string }>({
    stakingToken: '',
    rewards: '',
    algoRewards: '',
  })
  const [pendingSearchQuery, setPendingSearchQuery] = useState<{ [key: string]: string }>({
    stakingToken: '',
    rewards: '',
    algoRewards: '',
  })
  const [searchResults, setSearchResults] = useState<{ [key: string]: Currency[] }>({
    stakingToken: [],
    rewards: [],
    algoRewards: [],
  })
  const [isSearching, setIsSearching] = useState<{ [key: string]: boolean }>({
    stakingToken: false,
    rewards: false,
    algoRewards: false,
  })
  const [selectedStakingToken, setSelectedStakingToken] = useState<Currency | null>(null)
  const [selectedRewards, setSelectedRewards] = useState<Currency | null>(null)
  const [selectedAlgoRewards, setSelectedAlgoRewards] = useState<Currency | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const isVerifyingRef = useRef(false)
  const api_base_url = import.meta.env.VITE_API_BASE_URL;

  const dropdownRefs = {
    stakingToken: useRef<HTMLDivElement | null>(null),
    rewards: useRef<HTMLDivElement | null>(null),
    algoRewards: useRef<HTMLDivElement | null>(null),
  }
  const [reward, setReward] = useState<number | null>(null)
  const [algoreward, setAlgoReward] = useState<number | null>(null)
  const [poolTime, setPoolTime] = useState<number | null>(null)
  const [lockPeriod, setLockPeriod] = useState<number | null>(0)
  const [startDate, setStartDate] = useState<Date | null>(null)

  useEffect(() => {
    fetchTokens()
  }, [])

  // Handle search submission (only when submit button is clicked)
  const handleSearchSubmit = async (dropdown: 'stakingToken' | 'rewards' | 'algoRewards') => {
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
        tokenImage: token.image,
        decimals: token.decimals
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
        tokenImage: token.image,
        decimals: token.decimals
      }));
      setDefaultTokens(defaultCurrencies);
      
      // Fetch tokens from database using TokenService
      const tokens = await tokenService.fetchAllTokens();
      
      // Convert Token format to Currency format for this modal
      const currencies: Currency[] = tokens.map(token => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image,
        decimals: token.decimals
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
        
        // Set default selections from default tokens
        setSelectedStakingToken(defaultCurrencies[0] || sortedTokens[0] || null);
        setSelectedRewards(defaultCurrencies[0] || sortedTokens[0] || null);
        setSelectedAlgoRewards(defaultCurrencies.find(t => t.tokenId === 0) || sortedTokens.find(t => t.tokenId === 0) || sortedTokens[1] || null);
      } else {
        setAllTokens(currencies);
        setSelectedStakingToken(defaultCurrencies[0] || currencies[0] || null);
        setSelectedRewards(defaultCurrencies[0] || currencies[0] || null);
        setSelectedAlgoRewards(defaultCurrencies.find(t => t.tokenId === 0) || currencies.find(t => t.tokenId === 0) || currencies[1] || null);
      }
      
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
      
      // Get default tokens
      const defaultTokensList = tokenService.getDefaultTokens();
      const defaultCurrencies: Currency[] = defaultTokensList.map(token => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenImage: token.image,
        decimals: token.decimals
      }));
      setDefaultTokens(defaultCurrencies);
      
      // Fallback to essential tokens
      const fallbackTokens: Currency[] = [
        { tokenId: 0, tokenName: 'Algorand', tokenSymbol: 'ALGO', tokenImage: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/0/icon.png', decimals: 6 },
        { tokenId: 31566704, tokenName: 'USD Coin', tokenSymbol: 'USDC', tokenImage: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/31566704/icon.png', decimals: 6 },
        { tokenId: 312769, tokenName: 'Tether USD', tokenSymbol: 'USDT', tokenImage: chainId === 'voi-mainnet' ? '' : 'https://asa-list.tinyman.org/assets/312769/icon.png', decimals: 6 },
        { tokenId: 2485314946, tokenName: 'Fry', tokenSymbol: 'FRY', tokenImage: '/assets/images/fry-token.png', decimals: 6 }
      ];
      
      setAllTokens(fallbackTokens);
      setSelectedStakingToken(defaultCurrencies[0] || fallbackTokens[0] || null);
      setSelectedRewards(defaultCurrencies[0] || fallbackTokens[0] || null);
      setSelectedAlgoRewards(defaultCurrencies.find(t => t.tokenId === 0) || fallbackTokens.find(t => t.tokenId === 0) || fallbackTokens[1] || null);
    }
  }

  // Helper to get filtered currencies for each dropdown
  const getFilteredCurrencies = (dropdown: 'stakingToken' | 'rewards' | 'algoRewards') => {
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

  const toggleDropdown = (dropdown: string) => {
    setIsOpenDropdowns((prevState) => {
      const newState = { ...prevState }
      Object.keys(prevState).forEach((key) => {
        if (key !== dropdown) newState[key] = false
      })
      newState[dropdown] = !prevState[dropdown]
      return newState
    })
  }

  const selectCurrency = (currency: Currency, dropdown: string) => {
    if (dropdown === 'stakingToken') {
      setSelectedStakingToken(currency)
    } else if (dropdown === 'rewards') {
      setSelectedRewards(currency)
    } else if (dropdown === 'algoRewards') {
      setSelectedAlgoRewards(currency)
    }

    setIsOpenDropdowns((prevState) => ({
      ...prevState,
      [dropdown]: false,
    }))
  }

  const handleOk = () => {
    setisaddStakeOpen(false)
  }

  const handleCancel = () => {
    setisaddStakeOpen(false)
  }


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(dropdownRefs).forEach((dropdownKey) => {
        const ref = dropdownRefs[dropdownKey as keyof typeof dropdownRefs].current
        if (ref && !ref.contains(event.target as Node)) {
          setIsOpenDropdowns((prevState) => ({
            ...prevState,
            [dropdownKey]: false,
          }))
        }
      })
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleVerifyDetails = async () => {
    if (isVerifyingRef.current) return
    isVerifyingRef.current = true

    if (
      !selectedStakingToken ||
      !selectedRewards ||
      reward === null ||
      poolTime === null ||
      lockPeriod === null ||
      !startDate ||
      !activeAddress
    ) {
      toast.error('Please fill in all the details')
      isVerifyingRef.current = false
      return
    }

    // Validate reward amount
    if (reward <= 0) {
      toast.error('Reward amount must be greater than 0')
      isVerifyingRef.current = false
      return
    }

    setIsVerifying(true)

    const unixStartDate = Math.floor(new Date(startDate).getTime() / 1000)
    const unixEndDate = unixStartDate + poolTime * 24 * 60 * 60
    // Multiply reward by 1,000,000
    const adjustedReward = Math.floor(reward * 1_000_000)
    console.log('adjustedReward', adjustedReward)
    try {
      await ensureAuth();
      const stakingDetails = await initStaking(
        selectedStakingToken.tokenId,
        selectedRewards.tokenId,
        adjustedReward,
        Math.floor(poolTime * 24 * 60 * 60),
        Math.floor(new Date(startDate).getTime() / 1000),
        Math.floor(lockPeriod * 24 * 60 * 60),
        activeAddress,
        signer,
      )

      const pooling = poolTime * 24 * 60 * 60
      console.log('Staking Response:', stakingDetails)

      if (!stakingDetails) {
        throw new Error('Failed to create staking pool. Please check your inputs and try again.')
      }
        const stakingData = {
          creatorId: activeAddress,
          stakeToken: {
            id: String(selectedStakingToken.tokenId),
            name: selectedStakingToken.tokenName,
          },
          rewardToken: {
            id: String(selectedRewards.tokenId),
            name: selectedRewards.tokenName,
          },
          stakingStartTime: unixStartDate,
          stakingEndTime: unixEndDate,
          duration: pooling,
          aprRate: 0,
          rewardTokenAmount: adjustedReward,
          stakingContractId: String(stakingDetails),
          lockPeriod: lockPeriod * 24 * 60 * 60 || 0,
        }

        const response = await authAxios.post('/staking/add', stakingData, {
          headers: { 'Content-Type': 'application/json' },
        })
        console.log('response', response)
        if (response.status >= 200 && response.status < 300) {
          toast.success('Staking details submitted successfully')
          setisaddStakeOpen(false)
          const data = fetchData()
          console.log('data', data)

          setSelectedStakingToken(null)
          setSelectedRewards(null)
          setSelectedAlgoRewards(null)
          setReward(null)
          setAlgoReward(null)
          setPoolTime(null)
          setLockPeriod(0)
          setStartDate(null)
          setSearchQuery({
            stakingToken: '',
            rewards: '',
            algoRewards: '',
          })
          setIsOpenDropdowns({
            stakingToken: false,
            rewards: false,
            algoRewards: false,
          })

        } else {
          throw new Error('Failed to save staking details to server.')
        }
    } catch (error) {
      console.error('Error submitting staking details:', error)
      
      // Extract meaningful error message
      let errorMessage = 'Transaction failed or was rejected.'
      let errorDetails = ''
      
      if (error instanceof Error) {
        const errorMsg = error.message
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
              errorDetails = `The staking pool contract account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to hold ${assetCount} asset(s). The system will automatically send more ALGO to the contract. Please ensure your wallet has enough ALGO (at least ${neededAlgo} more) to cover this requirement and try again.`;
            } else {
              errorMessage = `Insufficient ALGO Balance`;
              errorDetails = `The account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to create a staking pool with ${assetCount} asset(s). Please ensure you have at least ${neededAlgo} more ALGO available.`;
            }
          } else {
            // Fallback for other balance error formats
            const minBalanceMatch = errorMsg.match(/(?:min|minimum)\s+(\d+)/i);
            const minBalance = minBalanceMatch ? parseInt(minBalanceMatch[1]) : 300000;
            const minBalanceAlgo = (minBalance / 1_000_000).toFixed(2);
            errorMessage = `Insufficient ALGO Balance`;
            errorDetails = `The contract account needs at least ${minBalanceAlgo} ALGO to create a staking pool. Please ensure your wallet has enough ALGO to cover this requirement.`;
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
          errorMessage = 'Invalid Reward Token';
          errorDetails = 'ALGO cannot be used as a reward token. Please select a different token.';
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
              errorDetails = `The staking pool contract account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to hold ${assetCount} asset(s). The system will automatically send more ALGO to the contract. Please ensure your wallet has enough ALGO (at least ${neededAlgo} more) to cover this requirement and try again.`;
            } else {
              errorMessage = 'Insufficient ALGO Balance';
              errorDetails = `The account has ${currentBalanceAlgo} ALGO, but needs at least ${minBalanceAlgo} ALGO to complete this transaction. Please ensure you have at least ${neededAlgo} more ALGO available.`;
            }
          } else {
            errorMessage = 'Transaction Simulation Failed';
            errorDetails = 'The transaction could not be processed. This may be due to insufficient balance or network issues. Please check your wallet balance and try again.';
          }
        }
        // Check for specific error messages
        else if (errorMsg.includes('Failed to create')) {
          errorMessage = 'Failed to Create Staking Pool';
          errorDetails = errorMsg;
        } 
        else if (errorMsg.includes('Failed to save')) {
          errorMessage = 'Failed to Save Staking Details';
          errorDetails = errorMsg;
        }
        // Generic error - show the original message if it's informative
        else if (errorMsg.length > 0 && errorMsg !== 'Error') {
          errorMessage = 'Transaction Error';
          errorDetails = errorMsg;
        }
      } else if (typeof error === 'string') {
        errorMessage = 'Transaction Error';
        errorDetails = error;
      }
      
      // Display error with details
      // Combine message and details for better readability
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
      setIsVerifying(false)
      isVerifyingRef.current = false
    }
  }

  return (
    <Modal open={isaddStakeOpen} onOk={handleOk} onCancel={handleCancel} className="del-modal" centered width="415px">
      <div className="modal-content flex flex-col pt-[24px] pb-[31px] px-[31px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Add Stake</h5>
        <div className="red-line w-full h-[1px] mt-[25px] mb-[19px]"></div>
        <div className="max-h-[80vh] overflow-y-auto px-[10px]">
          <div className="flex flex-col gap-[16px]">
            {/* Staking Token */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Staking Token</p>
              <div className="relative" ref={dropdownRefs.stakingToken}>
                <div
                  className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--input-bg)] w-full h-[54px] rounded-[6px] py-[9px] px-[12px]"
                  onClick={() => toggleDropdown('stakingToken')}
                >
                  <div className="flex items-center gap-[8px]">
                    {selectedStakingToken && (
                      <>
                        <img src={selectedStakingToken.tokenImage} alt="" width={28} height={28} />
                        <div className="flex flex-col">
                          <p className="text-text_clr medium">{selectedStakingToken.tokenName}</p>
                          <p className="text-text_clr e-small">{selectedStakingToken.tokenSymbol}</p>
                        </div>
                      </>
                    )}
                  </div>
                  <Icon
                    icon={isOpenDropdowns.stakingToken ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                    width={26}
                    height={26}
                    color="#718096"
                  />
                </div>
                {isOpenDropdowns.stakingToken && (
                  <div className="absolute left-0 mt-2 px-[11px] py-[9px] w-full bg-[var(--bg-card)] rounded-[10px] shadow-lg z-10">
                    <div className="py-[7px] px-[9px] mb-[16px] flex items-center gap-[8px] rounded-[10px] bg-[var(--input-bg)] shadow-sm">
                      <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                      <input
                        type="search"
                        placeholder="Search token"
                        value={pendingSearchQuery.stakingToken}
                        onChange={(e) => setPendingSearchQuery(prev => ({ ...prev, stakingToken: e.target.value }))}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleSearchSubmit('stakingToken');
                          }
                        }}
                        className="w-full bg-transparent focus:outline-none text-[var(--input-text)]"
                      />
                      <button
                        onClick={() => handleSearchSubmit('stakingToken')}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                        disabled={isSearching.stakingToken}
                      >
                        {isSearching.stakingToken ? '...' : 'Search'}
                      </button>
                    </div>
                    <ul className="py-1 flex flex-col gap-[6px] max-h-[100px] overflow-y-auto">
                      {(() => {
                        const q = searchQuery.stakingToken?.trim();
                        const currencies = getFilteredCurrencies('stakingToken');
                        const isSearchingForDropdown = isSearching.stakingToken || false;
                        
                        // Show loading state when searching
                        if (q && q.length >= 2 && isSearchingForDropdown) {
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
                                  key={currency.tokenId}
                                  className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                  onClick={() => selectCurrency(currency, 'stakingToken')}
                                >
                                  <img src={currency.tokenImage} alt={currency.tokenName} width={28} height={28} />
                                  <span className="text-black font-medium">{currency.tokenName}</span>
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
                          return currencies.map((currency) => (
                            <li
                              key={currency.tokenId}
                              className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                              onClick={() => selectCurrency(currency, 'stakingToken')}
                            >
                              <img src={currency.tokenImage} alt={currency.tokenName} width={28} height={28} />
                              <span className="text-black font-medium">{currency.tokenName}</span>
                            </li>
                          ));
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

            {/* Rewards */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Rewards</p>
              <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] p-[7px]">
                <Input
                  type="number"
                  name="number"
                  placeholder="1"
                  className="input-wrapper text-[16px] w-full"
                  value={reward || ''}
                  onChange={(e) => setReward(Number(e.target.value))}
                />
                <div className="relative inline-block text-left" ref={dropdownRefs.rewards}>
                  <div
                    className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--bg-card)] w-[126px] h-[46px] rounded-[6px] py-[9px] px-[12px]"
                    onClick={() => toggleDropdown('rewards')}
                  >
                    {selectedRewards && (
                      <img 
                        src={selectedRewards.tokenImage || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${selectedRewards.tokenId}/icon.png`)}
                        alt={selectedRewards.tokenName || 'Reward token'}
                        width={28}
                        height={28}
                        className="rounded-full"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const hasTriedFallback = target.dataset.fallbackAttempted === 'true';
                          if (!hasTriedFallback && !target.src.includes('tinyman.org') && chainId !== 'voi-mainnet') {
                            target.dataset.fallbackAttempted = 'true';
                            target.src = `https://asa-list.tinyman.org/assets/${selectedRewards.tokenId}/icon.png`;
                          } else {
                            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHZpZXdCb3g9IjAgMCAyOCAyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNCIgY3k9IjE0IiByPSIxNCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0xNCA4QzExLjgwNjYgOCAxMCA5LjgwNjYgMTAgMTJDMTAgMTQuMTkzNCAxMS44MDY2IDE2IDE0IDE2QzE2LjE5MzQgMTYgMTggMTQuMTkzNCAxOCAxMkMxOCA5LjgwNjYgMTYuMTkzNCA4IDE0IDhaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+';
                          }
                        }}
                      />
                    )}
                    <div className="flex items-center gap-[4px]">
                      <p className="text-text_clr medium">{selectedRewards?.tokenSymbol || 'Select'}</p>
                      <Icon icon={isOpenDropdowns.rewards ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={26} height={26} color="#718096" />
                    </div>
                  </div>
                  {isOpenDropdowns.rewards && (
                    <div className="absolute right-0 mt-2 px-[11px] py-[9px] w-[300px]  bg-[var(--bg-card)] rounded-[10px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)] z-10">
                      <div className="py-[7px] px-[9px] mb-[16px] flex items-center gap-[8px] rounded-[10px] bg-[var(--input-bg)] shadow-sm">
                        <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                        <input
                          type="search"
                          placeholder="Search token"
                          value={pendingSearchQuery.rewards}
                          onChange={(e) => setPendingSearchQuery(prev => ({ ...prev, rewards: e.target.value }))}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleSearchSubmit('rewards');
                            }
                          }}
                          className="w-full bg-transparent focus:outline-none text-[var(--input-text)]"
                        />
                        <button
                          onClick={() => handleSearchSubmit('rewards')}
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                          disabled={isSearching.rewards}
                        >
                          {isSearching.rewards ? '...' : 'Search'}
                        </button>
                      </div>
                      <ul className="py-1 flex flex-col gap-[6px] max-h-[100px] overflow-y-auto">
                        {(() => {
                          const q = searchQuery.rewards?.trim();
                          const currencies = getFilteredCurrencies('rewards');
                          const isSearchingForDropdown = isSearching.rewards || false;
                          
                          // Show loading state when searching
                          if (q && q.length >= 2 && isSearchingForDropdown) {
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
                                    key={currency.tokenId}
                                    className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                    onClick={() => selectCurrency(currency, 'rewards')}
                                  >
                                    <img 
                                      src={currency.tokenImage || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${currency.tokenId}/icon.png`)} 
                                      alt={currency.tokenName} 
                                      width={28} 
                                      height={28}
                                      className="rounded-full"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        const hasTriedFallback = target.dataset.fallbackAttempted === 'true';
                                        if (!hasTriedFallback && !target.src.includes('tinyman.org') && chainId !== 'voi-mainnet') {
                                          target.dataset.fallbackAttempted = 'true';
                                          target.src = `https://asa-list.tinyman.org/assets/${currency.tokenId}/icon.png`;
                                        } else {
                                          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHZpZXdCb3g9IjAgMCAyOCAyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNCIgY3k9IjE0IiByPSIxNCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0xNCA4QzExLjgwNjYgOCAxMCA5LjgwNjYgMTAgMTJDMTAgMTQuMTkzNCAxMS44MDY2IDE2IDE0IDE2QzE2LjE5MzQgMTYgMTggMTQuMTkzNCAxOCAxMkMxOCA5LjgwNjYgMTYuMTkzNCA4IDE0IDhaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+';
                                        }
                                      }}
                                    />
                                    <span className="text-black font-medium">{currency.tokenName}</span>
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
                            return currencies.map((currency) => (
                              <li
                                key={currency.tokenId}
                                className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                onClick={() => selectCurrency(currency, 'rewards')}
                              >
                                <img 
                                  src={currency.tokenImage || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${currency.tokenId}/icon.png`)} 
                                  alt={currency.tokenName} 
                                  width={28} 
                                  height={28}
                                  className="rounded-full"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    const hasTriedFallback = target.dataset.fallbackAttempted === 'true';
                                    if (!hasTriedFallback && !target.src.includes('tinyman.org') && chainId !== 'voi-mainnet') {
                                      target.dataset.fallbackAttempted = 'true';
                                      target.src = `https://asa-list.tinyman.org/assets/${currency.tokenId}/icon.png`;
                                    } else {
                                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHZpZXdCb3g9IjAgMCAyOCAyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNCIgY3k9IjE0IiByPSIxNCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0xNCA4QzExLjgwNjYgOCAxMCA5LjgwNjYgMTAgMTJDMTAgMTQuMTkzNCAxMS44MDY2IDE2IDE0IDE2QzE2LjE5MzQgMTYgMTggMTQuMTkzNCAxOCAxMkMxOCA5LjgwNjYgMTYuMTkzNCA4IDE0IDhaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+';
                                    }
                                  }}
                                />
                                <span className="text-black font-medium">{currency.tokenName}</span>
                              </li>
                            ));
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
            </div>

            {/* ALGO Rewards (optional) */}
            {/* <div className="flex flex-col gap-[10px]">
              <p className="large text-black">ALGO Rewards (optional)</p>
              <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] p-[7px]">
                <Input
                  type="number"
                  name="number"
                  placeholder="1"
                  className="input-wrapper text-[16px] w-full"
                  value={algoreward || ''}
                  onChange={(e) => setAlgoReward(Number(e.target.value))}
                />
                <div className="relative inline-block text-left" ref={dropdownRefs.algoRewards}>
                  <div
                    className="flex items-center justify-between gap-[13px] cursor-pointer bg-[var(--bg-card)] w-[126px] h-[46px] rounded-[6px] py-[9px] px-[12px]"
                    onClick={() => toggleDropdown('algoRewards')}
                  >
                    <img src={selectedAlgoRewards?.tokenImage} alt="" width={28} height={28} />
                    <div className="flex items-center gap-[4px]">
                      <p className="text-text_clr medium">{selectedAlgoRewards?.tokenSymbol}</p>
                      <Icon
                        icon={isOpenDropdowns.algoRewards ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                        width={26}
                        height={26}
                        color="#718096"
                      />
                    </div>
                  </div>
                  {isOpenDropdowns.algoRewards && (
                    <div className="absolute right-0 mt-2 px-[11px] py-[9px] w-[300px]  bg-[var(--bg-card)] rounded-[10px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)] z-10">
                      <div className="py-[7px] px-[9px] mb-[16px] flex items-center gap-[8px] rounded-[10px] bg-[var(--input-bg)] shadow-sm">
                        <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                        <input
                          type="search"
                          placeholder="Search token"
                          value={searchQuery.algoRewards}
                          onChange={(e) => setSearchQuery(prev => ({ ...prev, algoRewards: e.target.value }))}
                          className="w-full bg-transparent focus:outline-none text-[var(--input-text)]"
                        />
                      </div>
                      <ul className="py-1 flex flex-col gap-[6px] max-h-[100px] overflow-y-auto">
                        {(() => {
                          const q = searchQuery.algoRewards?.trim();
                          const currencies = getFilteredCurrencies('algoRewards');
                          const isSearchingForDropdown = isSearching.algoRewards || false;
                          
                          // Show loading state when searching
                          if (q && q.length >= 2 && isSearchingForDropdown) {
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
                                    key={currency.tokenId}
                                    className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                    onClick={() => selectCurrency(currency, 'algoRewards')}
                                  >
                                    <img src={currency.tokenImage} alt={currency.tokenName} width={28} height={28} />
                                    <span className="text-black font-medium">{currency.tokenName}</span>
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
                            return currencies.map((currency) => (
                              <li
                                key={currency.tokenId}
                                className="flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray"
                                onClick={() => selectCurrency(currency, 'algoRewards')}
                              >
                                <img src={currency.tokenImage} alt={currency.tokenName} width={28} height={28} />
                                <span className="text-black font-medium">{currency.tokenName}</span>
                              </li>
                            ));
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
            </div> */}

            {/* APR Calculator (informational) */}
            <APRCalculator
              mode="compact"
              rewardTokenId={selectedRewards?.tokenId}
              rewardTokenSymbol={selectedRewards?.tokenSymbol}
              rewardAmount={reward ? reward : undefined}
              durationDays={poolTime ? poolTime : undefined}
            />

            {/* date div */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Start</p>
              {/* <DatePicker className="w-full mt-[6px]" onChange={(date) => setStartDate(date?.toDate() || null)} /> */}
              <DatePicker
                className="w-full mt-[6px]"
                onChange={(date) => setStartDate(date?.toDate() || null)}
                disabledDate={(current) => {
                  return current && current < dayjs().startOf('day');
                }}
              />
            </div>

            {/* Duration div */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Duration</p>
              <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                <Input
                  type="number"
                  name="number"
                  placeholder="1"
                  className="input-wrapper text-[16px] w-full"
                  value={poolTime || ''}
                  onChange={(e) => setPoolTime(Number(e.target.value))}
                />
                <p className="text-text_clr medium">Days</p>
              </div>
            </div>

            {/* Lock div */}
            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Lock</p>
              <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                <Input
                  type="number"
                  name="lockPeriod"
                  placeholder="0"
                  value={lockPeriod || ''}
                  onChange={(e) => setLockPeriod(Number(e.target.value))}
                  className="input-wrapper text-[16px] w-full"
                />
                <p className="text-text_clr medium">Days</p>
              </div>
            </div>
            {/* \kmxzkml */}
            <div className="flex flex-col gap-[12px] items-center justify-center mt-[30px]">
              <p className="text-text_clr text-xs text-center px-2">
                A minimum balance requirement (MBR) of ALGO will be sent to fund the staking contract. This is required by the Algorand protocol to cover account minimum balance and asset opt-in costs.
              </p>
              {/* <Button text="Verify Details" className="button btn-primary" height={53} width="100%" onClick={handleVerifyDetails} /> */}
              <Button
                text={isVerifying ? 'Verifying Please Wait...' : 'Verify Details'}
                className="button btn-primary"
                height={53}
                width="100%"
                onClick={handleVerifyDetails}
                disabled={isVerifying}
              />
              <p className="text-text_clr medium">
                Can’t find your token? <span className="text-link cursor-pointer">Add token here</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default Addstake
