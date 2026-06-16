import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Modal, Steps, DatePicker, Radio } from 'antd'
import { toast } from 'react-toastify'
import dayjs from 'dayjs'
import { useWallet } from '@txnlab/use-wallet'
import { useAuth } from '../../hooks/useAuth'
import { useChain } from '../../context/ChainContext'
import { createDevicePool, depositDeviceRewards, depositDeviceRewardsAlgo, optInDeviceContractToAsset } from '../../device_staking_func'
import { addDevicePool } from '../../services/deviceStakingApi'
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
import type { PoolRequirement, BoostMultiplier } from '../../types/deviceStaking'

interface CreateDevicePoolWizardProps {
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
  { label: 'Fixed Rate', value: 'fixed_rate', desc: 'Fixed amount of tokens per DePIN per day' },
  { label: 'Proportional', value: 'proportional', desc: 'Total reward pool divided among stakers over time' },
  { label: 'APR', value: 'apr', desc: 'Annual percentage rate based on device NFT value' },
]

const REWARD_MODEL_TO_INT: Record<string, number> = {
  fixed_rate: 0,
  proportional: 1,
  apr: 2,
}

const COLLECTION_MODE_MAP: Record<number, string> = {
  0: 'creator_address',
  1: 'whitelist',
  2: 'both',
}

const REQUIREMENT_TYPES = [
  { value: 'token_balance', label: 'Token Balance' },
  { value: 'staking_position', label: 'Staking Position' },
  { value: 'nft_holding', label: 'NFT Holding' },
  { value: 'multi_device', label: 'Multi Device' },
  { value: 'wallet_age', label: 'Wallet Age' },
]

const MULTIPLIER_TYPES = [
  { value: 'stake_duration', label: 'Stake Duration' },
  { value: 'token_balance', label: 'Token Balance' },
  { value: 'device_count', label: 'Device Count' },
  { value: 'requirement_met', label: 'Requirement Met' },
]

const DEPIN_COLLECTIONS: { name: string; description: string; category: string; creatorAddress: string; defunct?: boolean }[] = [
  {
    name: 'PlanetWatch Sensors',
    description: 'Air quality monitoring sensor NFTs',
    creatorAddress: 'U2RDZ4FGEKYMIQBAE7LTDZFIMO32C5H3WOZWI2SHU5ULPFWVCRJ7PVOT5Q',
    category: 'Environmental',
  },
  {
    name: 'Blockcreate Blocks',
    description: 'Physical light-emitting cubes',
    creatorAddress: '3CWBQEJY6XAEQUES5JHPSCFA6YCWXSVVEOB3ZIH3PBOVCT4WCPKL42J7VU',
    category: 'Gaming',
  },
  {
    name: 'PiPhi Network',
    description: 'PiPhi DePIN network tokens',
    creatorAddress: 'MHWVMMSIJRMTH4WWOWF64RWUU4HV2K3BPDVWR35AT2MYGUMJN4SOE6XMYE',
    category: 'Infrastructure',
  },
  {
    name: 'Fry Networks',
    description: 'Multi-purpose DePIN mining devices',
    creatorAddress: 'ATPVJYGEGP5H6GCZ4T6CG4PK7LH5OMWXHLXZHDPGO7RO6T3EHWTF6UUY6E',
    category: 'Mining',
  },
  {
    name: 'Wayru Airblocks',
    description: 'WiFi hotspot nodes — project wound down Dec 2025',
    creatorAddress: 'EJX27KM3PLKO2RLWBNADRMDAEXFF2VNM6AJCOSLAPY6WLUSY3K6POHOLFE',
    category: 'Connectivity',
    defunct: true,
  },
]

const CreateDevicePoolWizard: React.FC<CreateDevicePoolWizardProps> = ({
  isOpen,
  setIsOpen,
  fetchData,
}) => {
  const { signer, activeAddress } = useWallet()
  const { ensureAuth } = useAuth()
  const { activeChain } = useChain()
  const isWalletConnected = !!activeAddress && !!signer

  const PLATFORM_DEPOSIT_FEE_BPS = 50
  const PLATFORM_WITHDRAW_FEE_BPS = 25
  const PLATFORM_CLAIM_FEE_BPS = 800

  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deployStatus, setDeployStatus] = useState('')

  // Step 0: Staking Mode
  const [stakingMode, setStakingMode] = useState<'verified-hold' | 'escrow'>('verified-hold')
  const [verifierAddress, setVerifierAddress] = useState('')
  const [showModeAdvanced, setShowModeAdvanced] = useState(false)

  // Step 1: NFT Collection
  const [poolName, setPoolName] = useState('')
  const [poolDescription, setPoolDescription] = useState('')
  const [poolImage, setPoolImage] = useState('')
  const [collectionMode, setCollectionMode] = useState(0)
  const [collectionCreator, setCollectionCreator] = useState('')
  const [whitelistInput, setWhitelistInput] = useState('')
  const [useCustomName, setUseCustomName] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [autoCollectionName, setAutoCollectionName] = useState('')
  const [creatorNfd, setCreatorNfd] = useState<string | null>(null)
  const [autoFetchingImage, setAutoFetchingImage] = useState(false)

  // Step 2: Reward Token
  const [rewardToken, setRewardToken] = useState<DiscoveredToken | null>(null)
  const [rewardTokenBalance, setRewardTokenBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // Step 3: Reward Model
  const [rewardModel, setRewardModel] = useState('fixed_rate')
  const [rewardPerDay, setRewardPerDay] = useState('')
  const [dailyPoolReward, setDailyPoolReward] = useState('')
  const [aprRate, setAprRate] = useState('')
  const [valuePerNft, setValuePerNft] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [lockOption, setLockOption] = useState(0)
  const [customLock, setCustomLock] = useState('')
  const [poolEndDate, setPoolEndDate] = useState<Date | null>(null)
  const [estimatedNfts, setEstimatedNfts] = useState('10')

  // Fixed platform fees (not user-configurable)
  const depositFeeBps = 50    // 0.50%
  const withdrawFeeBps = 25   // 0.25%
  const claimFeeBps = 800     // 8.00%

  // Step 5: Requirements
  const [requirementsEnabled, setRequirementsEnabled] = useState(false)
  const [requirements, setRequirements] = useState<PoolRequirement[]>([])

  // Step 6: Multipliers
  const [multipliersEnabled, setMultipliersEnabled] = useState(false)
  const [multipliers, setMultipliers] = useState<BoostMultiplier[]>([])

  const actualLock = lockOption === -1 ? Number(customLock) : lockOption

  const whitelistedAsaIds = useMemo(() => {
    return whitelistInput
      .split(/[\n,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0)
  }, [whitelistInput])

  // Auto-fill verifier with connected wallet
  useEffect(() => {
    if (activeAddress && !verifierAddress) {
      setVerifierAddress(activeAddress)
    }
  }, [activeAddress])

  // Auto-fill creator address
  useEffect(() => {
    if (activeAddress && !collectionCreator) {
      setCollectionCreator(activeAddress)
    }
  }, [activeAddress])

  // NFD lookup
  useEffect(() => {
    const addr = collectionCreator.trim()
    if (addr.length < 58) { setCreatorNfd(null); return }
    let cancelled = false
    lookupNfd(addr).then(name => { if (!cancelled) setCreatorNfd(name) })
    return () => { cancelled = true }
  }, [collectionCreator])

  // Auto-generate pool name
  useEffect(() => {
    if (!useCustomName) {
      const modeSuffix = stakingMode === 'verified-hold' ? 'DePIN Staking' : 'DePIN Pool'
      const prefix = autoCollectionName || creatorNfd || (collectionCreator.trim() ? collectionCreator.slice(0, 8) + '...' : '')
      setPoolName(prefix ? `${prefix} ${modeSuffix}` : modeSuffix)
    }
  }, [collectionCreator, stakingMode, useCustomName, autoCollectionName, creatorNfd])

  // Auto-fetch collection image
  useEffect(() => {
    if (poolImage) return
    let cancelled = false
    const fetchImage = async () => {
      try {
        setAutoFetchingImage(true)
        let asaId: number | null = null

        if ((collectionMode === 0 || collectionMode === 2) && collectionCreator.trim().length >= 58) {
          const res = await axios.get(
            `https://mainnet-idx.4160.nodely.dev/v2/accounts/${collectionCreator.trim()}/created-assets?limit=1`,
            { timeout: 10000 },
          )
          asaId = res.data?.assets?.[0]?.index ?? null
        } else if (collectionMode === 1 && whitelistedAsaIds.length > 0) {
          asaId = whitelistedAsaIds[0]
        }

        if (asaId && !cancelled) {
          const meta = await getNftMetadata(asaId)
          if (meta.imageUrl && !cancelled) setPoolImage(meta.imageUrl)
          if (meta.name && !cancelled) {
            const name = meta.name.replace(/\s*#\d+$/, '').trim()
            if (name) setAutoCollectionName(name)
          }
        }
      } catch { /* skip */ } finally {
        if (!cancelled) setAutoFetchingImage(false)
      }
    }
    fetchImage()
    return () => { cancelled = true }
  }, [collectionCreator, whitelistedAsaIds, collectionMode])

  // Fetch reward token balance
  useEffect(() => {
    if (!rewardToken || !activeAddress) {
      setRewardTokenBalance(null)
      return
    }
    let cancelled = false
    const fetchBalance = async () => {
      setBalanceLoading(true)
      try {
        const algodConfig = getAlgodConfigFromViteEnvironment()
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

  const effectiveDeposit = rewardModel === 'proportional' ? dailyPoolReward : depositAmount
  const depositExceedsBalance = rewardTokenBalance !== null && Number(effectiveDeposit) > 0 && Number(effectiveDeposit) > rewardTokenBalance

  const addRequirement = () => {
    setRequirements([...requirements, {
      requirementId: `req_${Date.now()}`,
      type: 'token_balance',
      label: '',
      description: '',
      params: {},
      enforcement: 'required',
    }])
  }

  const removeRequirement = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index))
  }

  const updateRequirement = (index: number, updates: Partial<PoolRequirement>) => {
    setRequirements(requirements.map((r, i) => i === index ? { ...r, ...updates } : r))
  }

  const addMultiplier = () => {
    setMultipliers([...multipliers, {
      multiplierId: `mult_${Date.now()}`,
      label: '',
      description: '',
      type: 'stake_duration',
      params: {},
      stackable: true,
      maxMultiplier: 100000,
    }])
  }

  const removeMultiplier = (index: number) => {
    setMultipliers(multipliers.filter((_, i) => i !== index))
  }

  const updateMultiplier = (index: number, updates: Partial<BoostMultiplier>) => {
    setMultipliers(multipliers.map((m, i) => i === index ? { ...m, ...updates } : m))
  }

  const resetForm = () => {
    setCurrentStep(0)
    setStakingMode('verified-hold')
    setVerifierAddress('')
    setPoolName('')
    setPoolDescription('')
    setPoolImage('')
    setCollectionMode(0)
    setCollectionCreator('')
    setWhitelistInput('')
    setRewardModel('fixed_rate')
    setRewardToken(null)
    setRewardPerDay('')
    setDailyPoolReward('')
    setAprRate('')
    setValuePerNft('')
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
    setRequirementsEnabled(false)
    setRequirements([])
    setMultipliersEnabled(false)
    setMultipliers([])
  }

  const canProceed = (step: number): boolean => {
    switch (step) {
      case 0:
        return !!stakingMode
      case 1: {
        const needsCreator = collectionMode === 0 || collectionMode === 2
        const needsWhitelist = collectionMode === 1 || collectionMode === 2
        return poolName.trim().length > 0
          && (!needsCreator || collectionCreator.trim().length > 0)
          && (!needsWhitelist || whitelistedAsaIds.length > 0)
      }
      case 2:
        return !!rewardToken
      case 3: {
        if (!poolEndDate) return false
        if (Number(effectiveDeposit) <= 0) return false
        if (depositExceedsBalance) return false
        if (rewardModel === 'fixed_rate') return Number(rewardPerDay) > 0
        if (rewardModel === 'proportional') return Number(dailyPoolReward) > 0
        if (rewardModel === 'apr') return Number(aprRate) > 0 && Number(valuePerNft) > 0
        return false
      }
      case 4:
        if (!requirementsEnabled) return true
        return requirements.every(r => r.type && r.label.trim().length > 0)
      case 5:
        if (!multipliersEnabled) return true
        return multipliers.every(m => m.type && m.label.trim().length > 0)
      case 6:
        return true
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
      toast.error(`Insufficient ${rewardToken.symbol} balance.`)
      return
    }

    setIsSubmitting(true)
    setDeployStatus('Authenticating...')

    try {
      await ensureAuth()

      const poolEndTime = poolEndDate ? Math.floor(poolEndDate.getTime() / 1000) : 0
      const lockPeriodSeconds = actualLock * 86400

      setDeployStatus('Calculating fees...')
      const feeConfig = await fetchFeeConfig()
      const depositAmountMicro = Number(effectiveDeposit) * Math.pow(10, rewardToken.decimals)
      const feeCalc = calculateFeeSimple('poolCreation', depositAmountMicro, feeConfig)

      if (feeCalc.feeAmount > 0) {
        setDeployStatus('Paying creation fee...')
        const algodConfig = getAlgodConfigFromViteEnvironment()
        const algorandClient = algokit.AlgorandClient.fromConfig({ algodConfig })
        algorandClient.setDefaultSigner(signer)
        const algodClient = new algosdk.Algodv2(algodConfig.token as string, algodConfig.server, algodConfig.port)

        await routeFeeViaRouter(activeAddress, signer, feeCalc.feeAmount, rewardToken.id, algodClient, activeChain?.feeRouterAppId, activeChain?.feeRouterAddr)

        await logFee({
          appId: 0,
          userId: activeAddress,
          gasAmount: feeCalc.feeAmount,
          gasType: 'devicePoolCreationFee',
          feeType: 'percentage',
        })
      }

      setDeployStatus('Deploying contract...')
      const stakingModeInt = stakingMode === 'escrow' ? 0 : 1
      const appId = await createDevicePool(
        rewardToken.id,
        REWARD_MODEL_TO_INT[rewardModel],
        collectionMode,
        collectionCreator || activeAddress,
        Number(valuePerNft) * Math.pow(10, rewardToken.decimals) || 0,
        Number(rewardPerDay) * Math.pow(10, rewardToken.decimals) || 0,
        Number(dailyPoolReward) * Math.pow(10, rewardToken.decimals) || 0,
        Number(aprRate) * 100 || 0,
        Number(valuePerNft) * Math.pow(10, rewardToken.decimals) || 0,
        poolEndTime,
        lockPeriodSeconds,
        (activeChain?.feeRouterAddr || FEE_ROUTER_ADDR),
        Number(depositFeeBps),
        Number(withdrawFeeBps),
        Number(claimFeeBps),
        stakingModeInt,
        verifierAddress || activeAddress,
        activeAddress,
        signer,
      )

      if (!appId) throw new Error('App ID not returned from contract.')

      if (rewardToken.id > 0 && depositAmountMicro > 0) {
        setDeployStatus('Opting contract into reward token...')
        await optInDeviceContractToAsset(appId, rewardToken.id, activeAddress, signer)

        setDeployStatus('Depositing rewards...')
        await depositDeviceRewards(appId, rewardToken.id, feeCalc.netAmount, activeAddress, signer)
      } else if (rewardToken.id === 0 && depositAmountMicro > 0) {
        setDeployStatus('Depositing ALGO rewards...')
        await depositDeviceRewardsAlgo(appId, feeCalc.netAmount, activeAddress, signer)
      }

      setDeployStatus('Saving pool data...')
      await addDevicePool({
        appId: String(appId),
        creator: activeAddress,
        name: poolName,
        description: poolDescription,
        imageUrl: poolImage,
        stakingMode,
        verifierAddress: verifierAddress || activeAddress,
        collectionCreator: collectionCreator || activeAddress,
        collectionMode: COLLECTION_MODE_MAP[collectionMode],
        whitelist: whitelistedAsaIds,
        rewardTokenId: rewardToken.id,
        rewardToken: {
          id: rewardToken.id,
          name: rewardToken.name,
          symbol: rewardToken.symbol,
          image: rewardToken.image,
          decimals: rewardToken.decimals,
        },
        rewardModel,
        rewardPerDay: Number(rewardPerDay) * Math.pow(10, rewardToken.decimals) || 0,
        dailyPoolReward: Number(dailyPoolReward) * Math.pow(10, rewardToken.decimals) || 0,
        apr: Number(aprRate) * 100 || 0,
        valuePerNft: Number(valuePerNft) * Math.pow(10, rewardToken.decimals) || 0,
        rewardAmount: depositAmountMicro,
        depositFeeBps: Number(depositFeeBps),
        withdrawFeeBps: Number(withdrawFeeBps),
        claimFeeBps: Number(claimFeeBps),
        endDate: poolEndDate?.toISOString() || null,
        lockPeriod: lockPeriodSeconds,
        requirements: requirementsEnabled ? requirements : [],
        boostMultipliers: multipliersEnabled ? multipliers : [],
      })

      toast.success('Device staking pool created successfully!')
      resetForm()
      setIsOpen(false)
      fetchData()
    } catch (e) {
      console.error('Error creating device pool:', e)
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
    { title: 'Mode' },
    { title: 'Collection' },
    { title: 'Token' },
    { title: 'Rewards' },
    { title: 'Requirements' },
    { title: 'Multipliers' },
    { title: 'Review' },
  ]

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Choose how devices interact with the staking pool.</p>
            <div className="flex flex-col gap-3">
              <div
                onClick={() => setStakingMode('verified-hold')}
                className={`relative p-4 rounded-xl cursor-pointer transition-all border-2 ${
                  stakingMode === 'verified-hold'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/30 ring-1 ring-green-500/30'
                    : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                {stakingMode === 'verified-hold' && (
                  <Icon icon="mdi:check-circle" className="text-green-500 absolute top-3 right-3" width={22} />
                )}
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:shield-check" width={20} className="text-green-600" />
                  <p className="font-medium text-[var(--text-primary)]">Verified Hold</p>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1">DePIN NFT stays in the user's wallet. A verifier periodically confirms ownership.</p>
              </div>
              <div
                onClick={() => setStakingMode('escrow')}
                className={`relative p-4 rounded-xl cursor-pointer transition-all border-2 ${
                  stakingMode === 'escrow'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500/30'
                    : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                {stakingMode === 'escrow' && (
                  <Icon icon="mdi:check-circle" className="text-blue-500 absolute top-3 right-3" width={22} />
                )}
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:lock" width={20} className="text-blue-600" />
                  <p className="font-medium text-[var(--text-primary)]">Escrow Lock</p>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1">DePIN NFT is transferred to and locked in the smart contract.</p>
              </div>
            </div>

            {stakingMode === 'verified-hold' && (
              <div className="border-t border-[var(--border-color)] pt-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModeAdvanced(!showModeAdvanced)}
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon={showModeAdvanced ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="w-4 h-4" />
                  Advanced Settings
                </button>
                {showModeAdvanced && (
                  <div className="flex flex-col gap-4 mt-3">
                    <p className="text-xs text-[var(--text-secondary)] bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
                      <Icon icon="mdi:information-outline" width={14} className="inline mr-1 -mt-0.5" />
                      The Fry platform verifier will automatically handle verification for your pool. Only set a custom address if you need a different verifier.
                    </p>
                    <div className="flex flex-col gap-[10px]">
                      <p className="large text-[var(--text-primary)]">Verifier Address</p>
                      <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                        <Input
                          type="text"
                          placeholder="Address authorized to verify DePIN NFT ownership"
                          value={verifierAddress}
                          onChange={(e) => setVerifierAddress(e.target.value)}
                          className="input-wrapper text-[16px] w-full"
                        />
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">The verifier is the wallet authorized to confirm DePIN NFT ownership on-chain during periodic verification checks. Defaults to your wallet address.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case 1:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Set up your DePIN NFT collection and pool details.</p>

            <div className="flex flex-col gap-[10px]">
              <p className="large text-[var(--text-primary)]">Collection Mode</p>
              <Radio.Group
                value={collectionMode}
                onChange={(e) => setCollectionMode(e.target.value)}
                className="flex flex-col gap-2"
              >
                <Radio value={0}>Creator Address — Accept NFTs from a specific creator</Radio>
                <Radio value={1}>Whitelist — Accept specific NFT ASA IDs</Radio>
                <Radio value={2}>Both — Accept from creator OR whitelist</Radio>
              </Radio.Group>
            </div>

            {(collectionMode === 0 || collectionMode === 2) && (
              <>
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Known DePIN Collections</p>
                <div className="grid grid-cols-2 gap-2">
                  {DEPIN_COLLECTIONS.filter(c => c.creatorAddress).map((collection) => (
                    <div
                      key={collection.name}
                      onClick={() => {
                        setCollectionCreator(collection.creatorAddress)
                        if (!useCustomName) setPoolName(`Stake ${collection.name}`)
                      }}
                      className={`relative p-3 rounded-xl cursor-pointer transition-all border-2 ${
                        collectionCreator === collection.creatorAddress
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/30 ring-1 ring-green-500/30'
                          : 'border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      {collectionCreator === collection.creatorAddress && (
                        <Icon icon="mdi:check-circle" className="text-green-500 absolute top-2 right-2" width={18} />
                      )}
                      <p className="font-medium text-sm text-[var(--text-primary)]">{collection.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{collection.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--input-bg)] rounded px-1.5 py-0.5">
                          {collection.category}
                        </span>
                        {collection.defunct && (
                          <span className="text-[10px] text-orange-500 bg-orange-100 dark:bg-orange-900/20 rounded px-1.5 py-0.5">
                            Defunct
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <div className="flex-1 border-t border-[var(--border-color)]" />
                Or enter a custom creator address
                <div className="flex-1 border-t border-[var(--border-color)]" />
              </div>

              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Collection Creator Address</p>
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input
                    type="text"
                    placeholder="Algorand address of DePIN NFT creator"
                    value={collectionCreator}
                    onChange={(e) => setCollectionCreator(e.target.value)}
                    className="input-wrapper text-[16px] w-full"
                  />
                </div>
                {creatorNfd && <p className="text-xs text-green">{creatorNfd}</p>}
              </div>
              </>
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
                <img src={poolImage} alt="Collection" className="w-12 h-12 rounded-lg object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
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
                  </div>
                  <div className="flex flex-col gap-[10px]">
                    <p className="large text-[var(--text-primary)]">Description (optional)</p>
                    <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                      <Input
                        type="text"
                        placeholder="Describe your DePIN staking pool"
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

      case 2:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Select the token used for staking rewards.</p>
            <TokenSelector
              label="Reward Token"
              selected={rewardToken}
              onSelect={setRewardToken}
            />
            {rewardToken && (
              <div className="bg-[var(--bg-secondary)] rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <TokenImage tokenId={rewardToken.id} src={rewardToken.image} symbol={rewardToken.symbol} size={24} />
                  <span className="font-medium text-[var(--text-primary)]">{rewardToken.symbol}</span>
                </div>
                {balanceLoading ? (
                  <p className="text-xs text-[var(--text-secondary)] mt-2">Loading balance...</p>
                ) : rewardTokenBalance !== null ? (
                  <p className="text-xs text-[var(--text-secondary)] mt-2">
                    Available: {rewardTokenBalance.toLocaleString()} {rewardToken.symbol}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Configure the reward model and parameters.</p>

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

            {rewardModel === 'fixed_rate' && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Rate Per Day (per DePIN)</p>
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input type="number" placeholder="Tokens per DePIN per day" value={rewardPerDay} onChange={(e) => setRewardPerDay(e.target.value)} className="input-wrapper text-[16px] w-full" min={0} />
                </div>
              </div>
            )}

            {rewardModel === 'proportional' && (
              <div className="flex flex-col gap-[10px]">
                <p className="large text-[var(--text-primary)]">Daily Pool Reward</p>
                <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                  <Input type="number" placeholder="Total tokens distributed daily" value={dailyPoolReward} onChange={(e) => setDailyPoolReward(e.target.value)} className="input-wrapper text-[16px] w-full" min={0} />
                </div>
              </div>
            )}

            {rewardModel === 'apr' && (
              <>
                <div className="flex flex-col gap-[10px]">
                  <p className="large text-[var(--text-primary)]">APR Rate (%)</p>
                  <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-[12px] p-[7px] pr-[14px]">
                    <Input type="number" placeholder="Annual percentage rate" value={aprRate} onChange={(e) => setAprRate(e.target.value)} className="input-wrapper text-[16px] w-full" min={0} />
                    <span className="text-[var(--text-secondary)] font-medium">%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-[10px]">
                  <p className="large text-[var(--text-primary)]">Value Per DePIN NFT (in reward token)</p>
                  <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                    <Input type="number" placeholder="Assigned value per DePIN" value={valuePerNft} onChange={(e) => setValuePerNft(e.target.value)} className="input-wrapper text-[16px] w-full" min={0} />
                  </div>
                </div>
              </>
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
                  <Input type="number" placeholder="Custom lock period" value={customLock} onChange={(e) => setCustomLock(e.target.value)} className="input-wrapper text-[16px] w-full" min={0} />
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
                <p className="large text-[var(--text-primary)]">Reward Deposit Amount</p>
                {rewardTokenBalance !== null && (
                  <button type="button" onClick={() => setDepositAmount(String(rewardTokenBalance))} className="text-xs text-blue-500 hover:text-blue-600 transition-colors">Max</button>
                )}
              </div>
              <div className="bg-[var(--input-bg)] rounded-[12px] p-[7px]">
                <Input type="number" placeholder={`Amount of ${rewardToken?.symbol || 'tokens'} to deposit`} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="input-wrapper text-[16px] w-full" min={0} />
              </div>
              {depositExceedsBalance && (
                <p className="text-xs text-red-500">Insufficient balance.</p>
              )}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Optionally add requirements that stakers must meet.</p>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={requirementsEnabled} onChange={(e) => setRequirementsEnabled(e.target.checked)} />
                <span className="text-[var(--text-primary)] font-medium">Enable Requirements</span>
              </label>
            </div>

            {requirementsEnabled && (
              <div className="flex flex-col gap-3">
                {requirements.map((req, idx) => (
                  <div key={idx} className="bg-[var(--bg-secondary)] rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Requirement {idx + 1}</p>
                      <button type="button" onClick={() => removeRequirement(idx)} className="text-red-500 text-sm hover:underline">Remove</button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <select
                        value={req.type}
                        onChange={(e) => updateRequirement(idx, { type: e.target.value as any })}
                        className="w-full bg-[var(--input-bg)] rounded-lg p-2 text-sm text-[var(--input-text)]"
                      >
                        {REQUIREMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <Input type="text" placeholder="Label" value={req.label} onChange={(e) => updateRequirement(idx, { label: e.target.value })} className="input-wrapper text-[14px] w-full" />
                      <Input type="text" placeholder="Description (optional)" value={req.description} onChange={(e) => updateRequirement(idx, { description: e.target.value })} className="input-wrapper text-[14px] w-full" />
                      <div className="flex gap-3">
                        <label className="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="radio" checked={req.enforcement === 'required'} onChange={() => updateRequirement(idx, { enforcement: 'required' })} />
                          <span className="text-[var(--text-primary)]">Required</span>
                        </label>
                        <label className="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="radio" checked={req.enforcement === 'optional_boost'} onChange={() => updateRequirement(idx, { enforcement: 'optional_boost' })} />
                          <span className="text-[var(--text-primary)]">Boost Only</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRequirement} className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600">
                  <Icon icon="ic:sharp-add" width={16} /> Add Requirement
                </button>
              </div>
            )}
          </div>
        )

      case 5:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm">Optionally add boost multipliers for stakers.</p>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={multipliersEnabled} onChange={(e) => setMultipliersEnabled(e.target.checked)} />
                <span className="text-[var(--text-primary)] font-medium">Enable Multipliers</span>
              </label>
            </div>

            {multipliersEnabled && (
              <div className="flex flex-col gap-3">
                {multipliers.map((mult, idx) => (
                  <div key={idx} className="bg-[var(--bg-secondary)] rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Multiplier {idx + 1}</p>
                      <button type="button" onClick={() => removeMultiplier(idx)} className="text-red-500 text-sm hover:underline">Remove</button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <select
                        value={mult.type}
                        onChange={(e) => updateMultiplier(idx, { type: e.target.value as any })}
                        className="w-full bg-[var(--input-bg)] rounded-lg p-2 text-sm text-[var(--input-text)]"
                      >
                        {MULTIPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <Input type="text" placeholder="Label" value={mult.label} onChange={(e) => updateMultiplier(idx, { label: e.target.value })} className="input-wrapper text-[14px] w-full" />
                      <Input type="text" placeholder="Description (optional)" value={mult.description} onChange={(e) => updateMultiplier(idx, { description: e.target.value })} className="input-wrapper text-[14px] w-full" />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={mult.stackable} onChange={(e) => updateMultiplier(idx, { stackable: e.target.checked })} />
                          <span className="text-[var(--text-primary)]">Stackable</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-[var(--text-secondary)]">Max:</span>
                          <Input type="number" value={String(mult.maxMultiplier)} onChange={(e) => updateMultiplier(idx, { maxMultiplier: Number(e.target.value) })} className="input-wrapper text-[12px] w-[80px]" min={10000} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addMultiplier} className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600">
                  <Icon icon="ic:sharp-add" width={16} /> Add Multiplier
                </button>
              </div>
            )}
          </div>
        )

      case 6:
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[var(--text-secondary)] text-sm mb-2">Review your DePIN staking pool configuration before deploying.</p>

            <div className="flex flex-col gap-3 bg-[var(--bg-secondary)] rounded-xl p-4">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Pool Name</span>
                <span className="font-medium text-sm">{poolName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Staking Mode</span>
                <span className={`font-medium text-sm ${stakingMode === 'verified-hold' ? 'text-green' : 'text-blue-500'}`}>
                  {stakingMode === 'verified-hold' ? 'Verified Hold' : 'Escrow Lock'}
                </span>
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

              <div className="border-t border-[var(--border-color)] my-1" />

              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Reward Model</span>
                <span className="font-medium text-sm">{REWARD_MODEL_OPTIONS.find(o => o.value === rewardModel)?.label}</span>
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

              {rewardModel === 'fixed_rate' && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Rate Per Day</span>
                  <span className="font-medium text-sm">{rewardPerDay} {rewardToken?.symbol}/DePIN/day</span>
                </div>
              )}
              {rewardModel === 'proportional' && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Daily Pool Reward</span>
                  <span className="font-medium text-sm">{Number(dailyPoolReward).toLocaleString()} {rewardToken?.symbol}</span>
                </div>
              )}
              {rewardModel === 'apr' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] text-sm">APR Rate</span>
                    <span className="font-medium text-sm text-green">{aprRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] text-sm">Value Per DePIN</span>
                    <span className="font-medium text-sm">{valuePerNft} {rewardToken?.symbol}</span>
                  </div>
                </>
              )}

              <div className="border-t border-[var(--border-color)] my-1" />

              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Reward Deposit</span>
                <span className="font-medium text-sm">{Number(effectiveDeposit).toLocaleString()} {rewardToken?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Lock Period</span>
                <span className="font-medium text-sm">{actualLock === 0 ? 'None' : `${actualLock} days`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Pool End</span>
                <span className="font-medium text-sm">{poolEndDate ? dayjs(poolEndDate).format('MMM D, YYYY') : 'Not set'}</span>
              </div>

              <div className="border-t border-[var(--border-color)] my-1" />

              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Deposit Fee</span>
                <span className="font-medium text-sm">{(Number(depositFeeBps) / 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Withdraw Fee</span>
                <span className="font-medium text-sm">{(Number(withdrawFeeBps) / 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)] text-sm">Claim Fee</span>
                <span className="font-medium text-sm">{(Number(claimFeeBps) / 100).toFixed(2)}%</span>
              </div>

              {requirementsEnabled && requirements.length > 0 && (
                <>
                  <div className="border-t border-[var(--border-color)] my-1" />
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] text-sm">Requirements</span>
                    <span className="font-medium text-sm">{requirements.length}</span>
                  </div>
                </>
              )}

              {multipliersEnabled && multipliers.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Multipliers</span>
                  <span className="font-medium text-sm">{multipliers.length}</span>
                </div>
              )}
            </div>

            {deployStatus && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-400">{deployStatus}</p>
              </div>
            )}

            {!isWalletConnected && (
              <p className="text-red-500 italic text-sm text-center">Please connect your wallet to deploy</p>
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
        <h5 className="text-[var(--text-primary)] font-apex text-center">Create DePIN Staking Pool</h5>
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

          {currentStep < 7 ? (
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
              text={isSubmitting ? deployStatus || 'Deploying...' : 'Create DePIN Pool'}
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

export default CreateDevicePoolWizard
