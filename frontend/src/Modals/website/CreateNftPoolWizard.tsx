import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Modal, Steps, DatePicker, Radio } from 'antd'
import { toast } from 'react-toastify'
import dayjs from 'dayjs'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { useChain } from '../../context/ChainContext'
import { useAuth } from '../../hooks/useAuth'
import { createNftPool, createArc72NftPool, depositRewards, depositRewardsAlgo, optInContractToNft } from '../../nft_staking_func'
import { addNftPool } from '../../services/nftStakingApi'
import { fetchFeeConfig, calculateFeeSimple, routeFeeViaRouter, FEE_ROUTER_ADDR } from '../../services/FeeService'
import algosdk from 'algosdk'
import { getAssetBalance } from '../../services/ZapService'
import { getNftMetadata } from '../../services/nftCollectionService'
import { lookupNfd } from '../../services/nfdService'
import axios from 'axios'
import { logFee } from '../../utils/logFee'
import * as algokit from '@algorandfoundation/algokit-utils'
import { getAlgodConfigFromViteEnvironment } from '../../utils/network/getAlgoClientConfigs'
import TokenSelector from '../../components/shared/TokenSelector'
import TokenImage from '../../components/shared/TokenImage'
import type { DiscoveredToken } from '../../services/TokenDiscoveryService'
import Input from '../../components/shared/input'
import Button from '../../components/shared/button'
import CollectionSelector from '../../components/shared/CollectionSelector'
import type { NftCollection } from '../../components/shared/CollectionSelector'

interface CreateNftPoolWizardProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  fetchData: () => void
}

const LOCK_OPTIONS = [
  { label: 'None', value: 0 },
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 },
  { label: 'Custom', value: -1 },
]

const REWARD_MODEL_OPTIONS = [
  { label: 'Fixed Rate', value: 0, desc: 'Fixed amount of tokens per NFT per day' },
  { label: 'Proportional', value: 1, desc: 'Total reward pool divided among stakers over time' },
  { label: 'APR', value: 2, desc: 'Annual percentage rate based on NFT value' },
]

const REWARD_MODEL_MAP: Record<number, string> = {
  0: 'fixed_rate',
  1: 'proportional',
  2: 'apr',
}

const COLLECTION_MODE_MAP: Record<number, string> = {
  0: 'creator_address',
  1: 'whitelist',
  2: 'both',
}

const CreateNftPoolWizard: React.FC<CreateNftPoolWizardProps> = ({
  isOpen,
  setIsOpen,
  fetchData,
}) => {
  const { signer: multiSigner, activeAddress } = useMultiChainWallet()
  const signer = multiSigner!
  const { ensureAuth } = useAuth()
  const { activeChain, chainId } = useChain()

  // Build chain-aware algod config
  const chainAlgodConfig = 'algodServer' in (activeChain?.connection as any || {})
    ? { server: (activeChain.connection as any).algodServer, port: (activeChain.connection as any).algodPort, token: (activeChain.connection as any).algodToken }
    : undefined
  const isWalletConnected = !!activeAddress && !!signer

  const PLATFORM_DEPOSIT_FEE_BPS = 50   // 0.50%
  const PLATFORM_WITHDRAW_FEE_BPS = 25  // 0.25%
  const PLATFORM_CLAIM_FEE_BPS = 800    // 8.00%

  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deployStatus, setDeployStatus] = useState('')

  // Step 0: Collection Setup
  const [poolName, setPoolName] = useState('')
  const [poolDescription, setPoolDescription] = useState('')
  const [poolImage, setPoolImage] = useState('')
  const [collectionMode, setCollectionMode] = useState(0)
  const [collectionCreator, setCollectionCreator] = useState('')
  const [whitelistInput, setWhitelistInput] = useState('')
  const [useCustomName, setUseCustomName] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<NftCollection | null>(null)

  // Step 1: Reward Model
  const [rewardModel, setRewardModel] = useState(0)

  // Step 2: Parameters
  const [rewardTokenType, setRewardTokenType] = useState(1) // 0=native, 1=ASA, 2=ARC-200
  const [rewardToken, setRewardToken] = useState<DiscoveredToken | null>(null)
  const [ratePerDay, setRatePerDay] = useState('')
  const [totalRewardPool, setTotalRewardPool] = useState('')
  const [aprRate, setAprRate] = useState('')
  const [valuePerNft, setValuePerNft] = useState('')
  const [nftValue, setNftValue] = useState('')
  const [lockOption, setLockOption] = useState(0)
  const [customLock, setCustomLock] = useState('')
  const [poolEndDate, setPoolEndDate] = useState<Date | null>(null)

  const [depositAmount, setDepositAmount] = useState('')
  const [estimatedNfts, setEstimatedNfts] = useState('10')
  const [rewardTokenBalance, setRewardTokenBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [autoFetchingImage, setAutoFetchingImage] = useState(false)
  const [autoCollectionName, setAutoCollectionName] = useState('')
  const [creatorNfd, setCreatorNfd] = useState<string | null>(null)

  const actualLock = lockOption === -1 ? Number(customLock) : lockOption

  const estimatedApr = useMemo(() => {
    const nv = Number(nftValue) || Number(valuePerNft)
    if (!nv || nv <= 0) return null
    switch (rewardModel) {
      case 0: {
        const rpd = Number(ratePerDay)
        if (rpd <= 0) return null
        return (rpd * 365) / nv * 100
      }
      case 1: {
        const total = Number(totalRewardPool)
        const nfts = Number(estimatedNfts)
        const endDate = poolEndDate
        if (total <= 0 || nfts <= 0 || !endDate) return null
        const days = Math.max(1, Math.ceil((endDate.getTime() / 1000 - Date.now() / 1000) / 86400))
        const perNftPerDay = total / nfts / days
        return (perNftPerDay * 365) / nv * 100
      }
      case 2:
        return Number(aprRate) || null
      default:
        return null
    }
  }, [rewardModel, ratePerDay, totalRewardPool, aprRate, valuePerNft, nftValue, estimatedNfts, poolEndDate])

  const whitelistedAsaIds = useMemo(() => {
    return whitelistInput
      .split(/[\n,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0)
  }, [whitelistInput])

  // Auto-fill creator address with connected wallet
  useEffect(() => {
    if (activeAddress && !collectionCreator) {
      setCollectionCreator(activeAddress)
    }
  }, [activeAddress])

  // Look up NFD for creator address
  useEffect(() => {
    const addr = collectionCreator.trim()
    if (addr.length < 58) { setCreatorNfd(null); return }
    let cancelled = false
    lookupNfd(addr).then(name => { if (!cancelled) setCreatorNfd(name) })
    return () => { cancelled = true }
  }, [collectionCreator])

  // Auto-generate pool name from collection + reward model
  useEffect(() => {
    if (!useCustomName) {
      const modelSuffix = rewardModel === 0 ? 'NFT Staking' : rewardModel === 1 ? 'NFT Pool' : 'NFT Farm'
      const prefix = autoCollectionName || creatorNfd || (collectionCreator.trim() ? collectionCreator.slice(0, 8) + '...' : '')
      setPoolName(prefix ? `${prefix} ${modelSuffix}` : modelSuffix)
    }
  }, [collectionCreator, rewardModel, useCustomName, autoCollectionName, creatorNfd])

  // Auto-fetch collection NFT image for pool thumbnail
  useEffect(() => {
    if (poolImage) return
    let cancelled = false
    const fetchImage = async () => {
      try {
        setAutoFetchingImage(true)
        let asaId: number | null = null

        if ((collectionMode === 0 || collectionMode === 2) && collectionCreator.trim().length >= 58) {
          const indexerServer = (activeChain?.connection as any)?.indexerServer || 'https://mainnet-idx.4160.nodely.dev'
          const res = await axios.get(
            `${indexerServer}/v2/accounts/${collectionCreator.trim()}/created-assets?limit=1`,
            { timeout: 10000 },
          )
          asaId = res.data?.assets?.[0]?.index ?? null
        } else if (collectionMode === 1 && whitelistedAsaIds.length > 0) {
          asaId = whitelistedAsaIds[0]
        } else if (collectionMode === 2 && whitelistedAsaIds.length > 0) {
          asaId = whitelistedAsaIds[0]
        }

        if (asaId && !cancelled) {
          const meta = await getNftMetadata(asaId, chainId)
          if (meta.imageUrl && !cancelled) {
            setPoolImage(meta.imageUrl)
          }
          // Extract collection name by stripping trailing #number
          if (meta.name && !cancelled) {
            const name = meta.name.replace(/\s*#\d+$/, '').trim()
            if (name) setAutoCollectionName(name)
          }
        }
      } catch {
        // Graceful fallback — leave image empty
      } finally {
        if (!cancelled) setAutoFetchingImage(false)
      }
    }
    fetchImage()
    return () => { cancelled = true }
  }, [collectionCreator, whitelistedAsaIds, collectionMode])

  // Fetch reward token balance when token or wallet changes
  useEffect(() => {
    if (!rewardToken || !activeAddress) {
      setRewardTokenBalance(null)
      return
    }
    let cancelled = false
    const fetchBalance = async () => {
      setBalanceLoading(true)
      try {
        const algodConfig = chainAlgodConfig || getAlgodConfigFromViteEnvironment()
        const algod = algokit.getAlgoClient({
          server: algodConfig.server,
          port: algodConfig.port,
          token: algodConfig.token,
        })
        const balanceMicro = await getAssetBalance(algod, activeAddress, rewardToken.id)
        if (!cancelled) {
          setRewardTokenBalance(Number(balanceMicro) / Math.pow(10, rewardToken.decimals))
        }
      } catch {
        if (!cancelled) setRewardTokenBalance(null)
      } finally {
        if (!cancelled) setBalanceLoading(false)
      }
    }
    fetchBalance()
    return () => { cancelled = true }
  }, [rewardToken, activeAddress])

  const effectiveDeposit = rewardModel === 1 ? totalRewardPool : depositAmount
  const depositExceedsBalance = rewardTokenBalance !== null && Number(effectiveDeposit) > 0 && Number(effectiveDeposit) > rewardTokenBalance

  const resetForm = () => {
    setCurrentStep(0)
    setPoolName('')
    setPoolDescription('')
    setPoolImage('')
    setCollectionMode(0)
    setCollectionCreator('')
    setWhitelistInput('')
    setRewardModel(0)
    setRewardTokenType(1)
    setRewardToken(null)
    setRatePerDay('')
    setTotalRewardPool('')
    setAprRate('')
    setValuePerNft('')
    setNftValue('')
    setLockOption(0)
    setCustomLock('')
    setPoolEndDate(null)
    setDeployStatus('')
    setUseCustomName(false)
    setShowAdvanced(false)
    setDepositAmount('')
    setEstimatedNfts('10')
    setRewardTokenBalance(null)
    setBalanceLoading(false)
    setAutoFetchingImage(false)
    setAutoCollectionName('')
    setCreatorNfd(null)
  }

  const canProceed = (step: number): boolean => {
    switch (step) {
      case 0: {
        const needsCreator = collectionMode === 0 || collectionMode === 2
        const needsWhitelist = collectionMode === 1 || collectionMode === 2
        return poolName.trim().length > 0
          && (!needsCreator || collectionCreator.trim().length > 0)
          && (!needsWhitelist || whitelistedAsaIds.length > 0)
      }
      case 1:
        return true // Just picking a radio
      case 2: {
        if (!rewardToken) return false
        if (!poolEndDate) return false
        if (Number(effectiveDeposit) <= 0) return false
        if (depositExceedsBalance) return false
        if (rewardModel === 0) return Number(ratePerDay) > 0
        if (rewardModel === 1) return Number(totalRewardPool) > 0
        if (rewardModel === 2) return Number(aprRate) > 0 && Number(valuePerNft) > 0
        return false
      }
      default:
        return true
    }
  }

  const handleDeploy = async () => {
    if (!signer || !activeAddress) {
      toast.error('Wallet not connected.')
      return
    }
    if (!rewardToken) {
      toast.error('Please select a reward token.')
      return
    }
    if (!poolEndDate) {
      toast.error('Pool end date is required.')
      return
    }
    if (depositExceedsBalance) {
      toast.error(`Insufficient ${rewardToken.symbol} balance. You have ${rewardTokenBalance?.toLocaleString()} but need ${Number(effectiveDeposit).toLocaleString()}.`)
      return
    }

    setIsSubmitting(true)
    setDeployStatus('Authenticating...')

    try {
      await ensureAuth()

      const poolEndTime = poolEndDate ? Math.floor(poolEndDate.getTime() / 1000) : 0
      const lockPeriodSeconds = actualLock * 86400

      // Pool creation fee
      setDeployStatus('Calculating fees...')
      const feeConfig = await fetchFeeConfig()
      const depositAmountMicro = Number(effectiveDeposit) * 1_000_000
      const feeCalc = calculateFeeSimple('poolCreation', depositAmountMicro, feeConfig)

      if (feeCalc.feeAmount > 0) {
        setDeployStatus('Paying creation fee...')
        const algodConfig = chainAlgodConfig
          ? { ...chainAlgodConfig, network: '' }
          : getAlgodConfigFromViteEnvironment()
        const algorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
        algorandClient.setDefaultSigner(signer)
        const algodClient = new algosdk.Algodv2(algodConfig.token, algodConfig.server, algodConfig.port)

        await routeFeeViaRouter(activeAddress, signer, feeCalc.feeAmount, rewardToken.id, algodClient, activeChain?.feeRouterAppId, activeChain?.feeRouterAddr)

        await logFee({
          appId: 0,
          userId: activeAddress,
          gasAmount: feeCalc.feeAmount,
          gasType: 'nftPoolCreationFee',
          feeType: 'percentage',
        })
      }

      // Deploy contract
      setDeployStatus('Deploying contract...')
      let appId: number
      if (chainId === 'voi-mainnet') {
        appId = await createArc72NftPool(
          rewardToken.id,
          rewardTokenType,
          rewardModel,
          collectionMode,
          Number(collectionCreator) || 0,
          Number(nftValue) * 1_000_000 || 0,
          Number(ratePerDay) * 1_000_000 || 0,
          Number(totalRewardPool) * 1_000_000 || 0,
          Number(aprRate) * 100 || 0,
          Number(valuePerNft) * 1_000_000 || 0,
          poolEndTime,
          lockPeriodSeconds,
          (activeChain?.feeRouterAddr || FEE_ROUTER_ADDR),
          PLATFORM_DEPOSIT_FEE_BPS,
          PLATFORM_WITHDRAW_FEE_BPS,
          PLATFORM_CLAIM_FEE_BPS,
          activeAddress,
          signer,
          chainAlgodConfig,
        )
      } else {
        appId = await createNftPool(
          rewardToken.id,
          rewardModel,
          collectionMode,
          collectionCreator || activeAddress,
          Number(nftValue) * 1_000_000 || 0,
          Number(ratePerDay) * 1_000_000 || 0,
          Number(totalRewardPool) * 1_000_000 || 0,
          Number(aprRate) * 100 || 0,
          Number(valuePerNft) * 1_000_000 || 0,
          poolEndTime,
          lockPeriodSeconds,
          (activeChain?.feeRouterAddr || FEE_ROUTER_ADDR),
          PLATFORM_DEPOSIT_FEE_BPS,
          PLATFORM_WITHDRAW_FEE_BPS,
          PLATFORM_CLAIM_FEE_BPS,
          activeAddress,
          signer,
        )
      }

      if (!appId) throw new Error('App ID not returned from contract.')

      // Opt contract into reward token and deposit rewards
      if (rewardToken.id > 0 && depositAmountMicro > 0) {
        setDeployStatus('Opting contract into reward token...')
        await optInContractToNft(appId, rewardToken.id, activeAddress, signer)

        setDeployStatus('Depositing rewards...')
        await depositRewards(appId, rewardToken.id, feeCalc.netAmount, activeAddress, signer)
      } else if (rewardToken.id === 0 && depositAmountMicro > 0) {
        setDeployStatus('Depositing ALGO rewards...')
        await depositRewardsAlgo(appId, feeCalc.netAmount, activeAddress, signer)
      }

      // Save to backend
      setDeployStatus('Saving pool data...')
      await addNftPool({
        appId,
        creatorId: activeAddress,
        name: poolName,
        description: poolDescription,
        imageUrl: poolImage,
        collectionMode: COLLECTION_MODE_MAP[collectionMode],
        collectionCreator: collectionCreator || activeAddress,
        whitelistedAsaIds,
        rewardTokenId: rewardToken.id,
        rewardModel: REWARD_MODEL_MAP[rewardModel],
        ratePerDay: Number(ratePerDay) || 0,
        totalRewardPool: Number(totalRewardPool) || 0,
        aprRate: Number(aprRate) * 100 || 0,
        valuePerNft: Number(valuePerNft) * 1_000_000 || 0,
        nftValueInRewardToken: Number(nftValue) * 1_000_000 || 0,
        poolEndTime,
        lockPeriod: lockPeriodSeconds,
        feeRecipient: (activeChain?.feeRouterAddr || FEE_ROUTER_ADDR),
        depositFeeBps: PLATFORM_DEPOSIT_FEE_BPS,
        withdrawFeeBps: PLATFORM_WITHDRAW_FEE_BPS,
        claimFeeBps: PLATFORM_CLAIM_FEE_BPS,
        ...(chainId === 'voi-mainnet' ? { contractType: 'arc72' } : {}),
      })

      toast.success('NFT staking pool created successfully!')
      resetForm()
      setIsOpen(false)
      fetchData()
    } catch (e) {
      console.error('Error creating NFT pool:', e)
      handleDeployError(e)
    } finally {
      setIsSubmitting(false)
      setDeployStatus('')
    }
  }

  const handleDeployError = (e: unknown) => {
    let errorMessage = 'Transaction failed or was rejected.'
    let errorDetails = ''

    if (e instanceof Error) {
      const msg = e.message
      if (msg.includes('balance') && (msg.includes('below min') || msg.includes('below minimum'))) {
        const balanceMatch = msg.match(/balance\s+(\d+)\s+below\s+(?:min|minimum)\s+(\d+)/i)
        if (balanceMatch) {
          const current = (parseInt(balanceMatch[1]) / 1_000_000).toFixed(2)
          const min = (parseInt(balanceMatch[2]) / 1_000_000).toFixed(2)
          const needed = ((parseInt(balanceMatch[2]) - parseInt(balanceMatch[1])) / 1_000_000).toFixed(2)
          errorMessage = 'Insufficient ALGO Balance'
          errorDetails = `Current: ${current} ALGO, Required: ${min} ALGO. Need ${needed} more ALGO.`
        }
      } else if (msg.includes('does not exist') || msg.includes('has been deleted')) {
        errorMessage = 'Invalid Token'
        errorDetails = 'The selected reward token does not exist on Algorand.'
      } else if (msg.includes('rejected') || msg.includes('User rejected')) {
        errorMessage = 'Transaction Rejected'
        errorDetails = 'The transaction was rejected. Please try again.'
      } else if (msg.includes('cancelled') || msg.includes('CANCELLED')) {
        return
      } else {
        errorMessage = 'Transaction Error'
        errorDetails = msg
      }
    }

    const fullMsg = errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage
    toast.error(fullMsg, { autoClose: 8000, style: { whiteSpace: 'pre-line', maxWidth: '400px' } })
  }

  const steps = [
    { title: 'Collection' },
    { title: 'Reward Model' },
    { title: 'Parameters' },
    { title: 'Review' },
  ]

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Set up your NFT collection and pool details.</p>

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Collection Mode</p>
              <Radio.Group
                value={collectionMode}
                onChange={(e) => setCollectionMode(e.target.value)}
                className="flex flex-col gap-2"
              >
                <Radio value={0}>{chainId === 'voi-mainnet' ? 'By Collection — Select an ARC-72 collection' : 'Creator Address — Accept NFTs from a specific creator'}</Radio>
                <Radio value={1}>Whitelist — Accept specific NFT IDs</Radio>
                <Radio value={2}>{chainId === 'voi-mainnet' ? 'Both — Collection OR whitelist' : 'Both — Accept from creator OR whitelist'}</Radio>
              </Radio.Group>
            </div>

            {(collectionMode === 0 || collectionMode === 2) && (
              <CollectionSelector
                label={chainId === 'voi-mainnet' ? 'ARC-72 Collection' : 'NFT Collection'}
                selected={selectedCollection}
                onSelect={(coll) => {
                  setSelectedCollection(coll)
                  // Voi uses contractId, Algorand uses creator address
                  setCollectionCreator(chainId === 'voi-mainnet' ? String(coll.contractId) : coll.creator)
                  if (coll.image && !poolImage) setPoolImage(coll.image)
                }}
                chainId={chainId}
              />
            )}

            {(collectionMode === 1 || collectionMode === 2) && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Whitelisted ASA IDs</p>
                <textarea
                  placeholder="Enter ASA IDs separated by commas or newlines"
                  value={whitelistInput}
                  onChange={(e) => setWhitelistInput(e.target.value)}
                  rows={4}
                  className="w-full bg-[var(--input-bg)] rounded-[12px] p-3 text-sm text-[var(--input-text)] focus:outline-none resize-none"
                />
                {whitelistedAsaIds.length > 0 && (
                  <p className="text-xs text-[var(--text-secondary)]">{whitelistedAsaIds.length} ASA IDs parsed</p>
                )}
              </div>
            )}

            {poolImage && (
              <div className="flex items-center gap-3">
                <img
                  src={poolImage}
                  alt="Collection preview"
                  className="w-12 h-12 rounded-lg object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
                <span className="text-xs text-[var(--text-secondary)]">Collection preview (auto-detected)</span>
              </div>
            )}
            {autoFetchingImage && !poolImage && (
              <p className="text-xs text-[var(--text-secondary)]">Fetching collection image...</p>
            )}

            <div className="border-t border-[var(--border-color)] pt-3 mt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Icon icon={showAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="w-4 h-4" />
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="flex flex-col gap-4 mt-3">
                  <div className="flex flex-col gap-[10px]">
                    <p className="large text-[var(--text-primary)]">Pool Name</p>
                    <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                      <Input
                        type="text"
                        placeholder="Auto-generated pool name"
                        value={poolName}
                        onChange={(e) => { setPoolName(e.target.value); setUseCustomName(true) }}
                        className="input-wrapper text-[16px] w-full"
                      />
                    </div>
                    {!useCustomName && (
                      <p className="text-xs text-[var(--text-secondary)]">Auto-generated. Edit to customize.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-[10px]">
                    <p className="large text-[var(--text-primary)]">Description (optional)</p>
                    <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                      <Input
                        type="text"
                        placeholder="Describe your pool"
                        value={poolDescription}
                        onChange={(e) => setPoolDescription(e.target.value)}
                        className="input-wrapper text-[16px] w-full"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-[10px]">
                    <p className="large text-[var(--text-primary)]">Pool Image URL (optional)</p>
                    <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                      <Input
                        type="text"
                        placeholder="https://..."
                        value={poolImage}
                        onChange={(e) => setPoolImage(e.target.value)}
                        className="input-wrapper text-[16px] w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 1:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Choose how rewards are distributed to NFT stakers.</p>
            <div className="flex flex-col gap-3">
              {REWARD_MODEL_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setRewardModel(opt.value)}
                  className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${
                    rewardModel === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  <p className="font-medium text-[var(--text-primary)]">{opt.label}</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Configure reward parameters for your pool.</p>

            {chainId === 'voi-mainnet' && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Reward Token Type</p>
                <Radio.Group value={rewardTokenType} onChange={(e) => setRewardTokenType(e.target.value)}>
                  <Radio value={0}>Native (VOI)</Radio>
                  <Radio value={1}>ASA</Radio>
                  <Radio value={2}>ARC-200</Radio>
                </Radio.Group>
              </div>
            )}

            <TokenSelector
              label="Reward Token"
              selected={rewardToken}
              onSelect={setRewardToken}
            />

            {rewardModel === 0 && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Rate Per Day (per NFT)</p>
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input
                    type="number"
                    placeholder="Tokens per NFT per day"
                    value={ratePerDay}
                    onChange={(e) => setRatePerDay(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={0}
                  />
                </div>
              </div>
            )}

            {rewardModel === 1 && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Total Reward Pool</p>
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input
                    type="number"
                    placeholder="Total tokens to distribute"
                    value={totalRewardPool}
                    onChange={(e) => setTotalRewardPool(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={0}
                  />
                </div>
              </div>
            )}

            {rewardModel === 2 && (
              <>
                <div className="flex flex-col gap-[10px]">
                  <p className="large text-[var(--text-primary)]">APR Rate (%)</p>
                  <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[12px] p-[7px] pr-[14px]">
                    <Input
                      type="number"
                      placeholder="Annual percentage rate"
                      value={aprRate}
                      onChange={(e) => setAprRate(e.target.value)}
                      className="input-wrapper text-[16px] w-full"
                      min={0}
                    />
                    <span className="text-[var(--text-secondary)] font-medium">%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-[10px]">
                  <p className="large text-[var(--text-primary)]">Value Per NFT (in reward token)</p>
                  <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                    <Input
                      type="number"
                      placeholder="Assigned value per NFT"
                      value={valuePerNft}
                      onChange={(e) => setValuePerNft(e.target.value)}
                      className="input-wrapper text-[16px] w-full"
                      min={0}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">NFT Floor Value (optional, in reward token)</p>
              <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                <Input
                  type="number"
                  placeholder="NFT value for oracle pricing"
                  value={nftValue}
                  onChange={(e) => setNftValue(e.target.value)}
                  className="input-wrapper text-[16px] w-full"
                  min={0}
                />
              </div>
            </div>

            {rewardModel === 1 && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Estimated NFTs Staked</p>
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input
                    type="number"
                    placeholder="10"
                    value={estimatedNfts}
                    onChange={(e) => setEstimatedNfts(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={1}
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">Used to estimate per-NFT rewards</p>
              </div>
            )}

            {estimatedApr !== null && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  Estimated APR: {estimatedApr.toFixed(1)}%
                </p>
                {rewardModel === 0 && Number(ratePerDay) > 0 && rewardToken && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    {ratePerDay} {rewardToken.symbol} per NFT per day
                  </p>
                )}
                {rewardModel === 1 && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    Assuming {estimatedNfts} NFTs staked
                  </p>
                )}
                {rewardModel === 2 && Number(valuePerNft) > 0 && rewardToken && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    ~{((Number(aprRate) / 100) * Number(valuePerNft) / 365).toFixed(4)} {rewardToken.symbol} per NFT per day
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Lock Period</p>
              <div className="grid grid-cols-3 gap-2">
                {LOCK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setLockOption(opt.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      lockOption === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {lockOption === -1 && (
                <div className="algo-div flex gap-[10px] items-center justify-between bg-[var(--input-bg)] rounded-[12px] pl-[0px] pr-[18px] py-[7px]">
                  <Input
                    type="number"
                    placeholder="Custom lock period"
                    value={customLock}
                    onChange={(e) => setCustomLock(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={0}
                  />
                  <p className="text-text_clr medium">Days</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Pool End Date</p>
              <DatePicker
                className="w-full"
                value={poolEndDate ? dayjs(poolEndDate) : null}
                onChange={(date) => setPoolEndDate(date?.toDate() || null)}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
                placeholder="Select end date"
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              <div className="flex items-center justify-between">
                <p className="large text-[var(--text-primary)]">
                  {rewardModel === 1 ? 'Reward Deposit' : 'Reward Deposit Amount'}
                </p>
                {rewardModel !== 1 && rewardTokenBalance !== null && (
                  <button
                    type="button"
                    onClick={() => setDepositAmount(String(rewardTokenBalance))}
                    className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    Max
                  </button>
                )}
              </div>
              {rewardModel === 1 ? (
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input
                    type="number"
                    value={totalRewardPool}
                    className="input-wrapper text-[16px] w-full opacity-60"
                    disabled
                  />
                </div>
              ) : (
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input
                    type="number"
                    placeholder={`Amount of ${rewardToken?.symbol || 'tokens'} to deposit`}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                    min={0}
                  />
                </div>
              )}
              {balanceLoading && (
                <p className="text-xs text-[var(--text-secondary)]">Loading balance...</p>
              )}
              {!balanceLoading && rewardTokenBalance !== null && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Available: {rewardTokenBalance.toLocaleString()} {rewardToken?.symbol}
                </p>
              )}
              {depositExceedsBalance && (
                <p className="text-xs text-red-500">
                  Insufficient balance. You have {rewardTokenBalance?.toLocaleString()} {rewardToken?.symbol} but are trying to deposit {Number(effectiveDeposit).toLocaleString()}.
                </p>
              )}
              {rewardModel === 0 && Number(ratePerDay) > 0 && Number(depositAmount) > 0 && !depositExceedsBalance && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Runway: ~{Math.floor(Number(depositAmount) / Number(ratePerDay))} days ({ratePerDay} {rewardToken?.symbol || 'tokens'}/NFT/day)
                </p>
              )}
              {rewardModel === 1 && !depositExceedsBalance && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Equals your Total Reward Pool above
                </p>
              )}
              {rewardModel === 2 && Number(depositAmount) > 0 && !depositExceedsBalance && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Initial pool funding for APR-based rewards
                </p>
              )}
            </div>
          </div>
        )

      case 3:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm mb-2">Review your NFT staking pool configuration before deploying.</p>

            <div className="flex flex-col gap-3 bg-[var(--bg-secondary)] rounded-xl p-4">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Pool Name</span>
                <span className="font-medium text-sm">{poolName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Collection Mode</span>
                <span className="font-medium text-sm">
                  {['Creator Address', 'Whitelist', 'Both'][collectionMode]}
                </span>
              </div>
              {collectionCreator && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Creator</span>
                  <span className="font-medium text-sm text-xs">{collectionCreator.slice(0, 8)}...{collectionCreator.slice(-6)}</span>
                </div>
              )}
              {whitelistedAsaIds.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Whitelisted ASAs</span>
                  <span className="font-medium text-sm">{whitelistedAsaIds.length} IDs</span>
                </div>
              )}

              <div className="border-t border-[var(--border-color)] my-1" />

              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Reward Model</span>
                <span className="font-medium text-sm">{REWARD_MODEL_OPTIONS[rewardModel]?.label}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-sm">Reward Token</span>
                {rewardToken ? (
                  <div className="flex items-center gap-2">
                    <TokenImage tokenId={rewardToken.id} src={rewardToken.image} symbol={rewardToken.symbol} size={20} />
                    <span className="font-medium text-sm">{rewardToken.symbol}</span>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)]">Not selected</span>
                )}
              </div>

              {rewardModel === 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Rate Per Day</span>
                  <span className="font-medium text-sm">{ratePerDay} {rewardToken?.symbol}/NFT/day</span>
                </div>
              )}
              {rewardModel === 1 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Total Reward Pool</span>
                  <span className="font-medium text-sm">{Number(totalRewardPool).toLocaleString()} {rewardToken?.symbol}</span>
                </div>
              )}
              {rewardModel === 2 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] text-sm">APR Rate</span>
                    <span className="font-medium text-sm text-green">{aprRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] text-sm">Value Per NFT</span>
                    <span className="font-medium text-sm">{valuePerNft} {rewardToken?.symbol}</span>
                  </div>
                </>
              )}

              {estimatedApr !== null && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Estimated APR</span>
                  <span className="font-medium text-sm text-green">{estimatedApr.toFixed(1)}%</span>
                </div>
              )}

              <div className="border-t border-[var(--border-color)] my-1" />

              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Reward Deposit</span>
                <span className="font-medium text-sm">{Number(effectiveDeposit).toLocaleString()} {rewardToken?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Creation Fee (0.50%)</span>
                <span className="font-medium text-sm">{(Number(effectiveDeposit) * 0.005).toLocaleString(undefined, { maximumFractionDigits: 4 })} {rewardToken?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Net Deposit</span>
                <span className="font-medium text-sm">{(Number(effectiveDeposit) * 0.995).toLocaleString(undefined, { maximumFractionDigits: 4 })} {rewardToken?.symbol}</span>
              </div>

              <div className="border-t border-[var(--border-color)] my-1" />

              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Lock Period</span>
                <span className="font-medium text-sm">{actualLock === 0 ? 'None' : `${actualLock} days`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Pool End</span>
                <span className="font-medium text-sm">
                  {dayjs(poolEndDate).format('MMM D, YYYY')}
                </span>
              </div>

              <div className="border-t border-[var(--border-color)] my-1" />
              <p className="text-xs text-[var(--text-secondary)]">Platform Fees (non-configurable)</p>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Deposit Fee</span>
                <span className="font-medium text-sm">0.50%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Withdraw Fee</span>
                <span className="font-medium text-sm">0.25%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Claim Fee</span>
                <span className="font-medium text-sm">8.00%</span>
              </div>
            </div>

            {deployStatus && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-400">{deployStatus}</p>
              </div>
            )}

            {!isWalletConnected && (
              <p className="text-red-500 italic text-sm text-center">
                Please connect your wallet to deploy
              </p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Modal
      open={isOpen}
      onCancel={() => {
        if (!isSubmitting) {
          setIsOpen(false)
          resetForm()
        }
      }}
      className="del-modal"
      centered
      width={700}
      footer={null}
      maskClosable={!isSubmitting}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Create NFT Staking Pool</h5>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        <Steps
          current={currentStep}
          size="small"
          items={steps}
          className="mb-[20px]"
          onChange={(step) => {
            if (step <= currentStep) setCurrentStep(step)
          }}
        />

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar px-[4px] mb-[20px]">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {currentStep > 0 && (
            <Button
              text="Back"
              className="button btn-red-border flex-1"
              height={48}
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={isSubmitting}
            />
          )}

          {currentStep < 3 ? (
            <Button
              text="Next"
              className="button btn-primary flex-1"
              height={48}
              onClick={() => {
                if (!isWalletConnected) {
                  toast.error('Please connect your wallet first')
                  return
                }
                if (!canProceed(currentStep)) {
                  toast.error('Please complete all required fields')
                  return
                }
                setCurrentStep(currentStep + 1)
              }}
              disabled={!canProceed(currentStep) || !isWalletConnected}
            />
          ) : (
            <Button
              text={isSubmitting ? deployStatus || 'Deploying...' : 'Create NFT Pool'}
              className="button btn-primary flex-1"
              height={48}
              onClick={handleDeploy}
              disabled={isSubmitting || !isWalletConnected}
              loading={isSubmitting}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

export default CreateNftPoolWizard
