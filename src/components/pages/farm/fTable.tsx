import { toast } from 'react-toastify'
import React, { useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useChain } from '../../../context/ChainContext'
import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import { useNavigate } from 'react-router-dom'
import Button from '../../shared/button'
import Input from '../../shared/input'
import { stakeTokens, claimRewards, unstakeTokens, getUserStakeForPool } from '../../../farming_func'
import axios from 'axios'
import algosdk from 'algosdk'
import { usePreferences } from '../../../contexts/PreferencesContext'
import { friendlyApr, friendlyPoolSize } from '../../../utils/grandmaLabels'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import { authAxios } from '../../../services/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { fetchFeeConfig, calculateFeeSimple } from '../../../services/FeeService'
import type { FeeCalculation } from '../../../services/FeeService'
import FeeConfirmation from '../../shared/FeeConfirmation'
import StakeModal from '../../shared/StakeModal'
import WithdrawModal from '../../shared/WithdrawModal'
import AiAnalysisModal from '../../../Modals/AiAnalysisModal'

interface DataType {
  key: React.Key
  pool: React.ReactNode
  tvl: string
  apr: string
  staked: string
  reward: React.ReactNode
  ends: string
  _id: string
  appId: number
  farmEndTime: string
  stakeTokenId?: number
  stakeTokenBId?: number
  rewardTokenId?: number
}

export type TabOption = 'MyLive' | 'MyEnded' | 'Live' | 'Ended' | 'All'

interface FTableProps {
  farms: DataType[]
  fetchData: () => Promise<void>
  showExpandable: TabOption
}

// const FRY_ASSET_ID = 2485314946;
const FRY_ASSET_ID = import.meta.env.VITE_FRY_TOKEN_ID ? Number(import.meta.env.VITE_FRY_TOKEN_ID) : 2485314946;

const FTable: React.FC<FTableProps> = ({ farms, fetchData, showExpandable }) => {
  const { isSimpleMode } = usePreferences()
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [stakeInput, setStakeInput] = useState<{ [key: string]: string }>({})
  const [withdrawInput, setWithdrawInput] = useState<{ [key: string]: string }>({})
  const [stakeLoadingKeys, setStakeLoadingKeys] = useState<React.Key[]>([])
  const [withdrawLoadingKeys, setWithdrawLoadingKeys] = useState<React.Key[]>([])
  const [userStakes, setUserStakes] = useState<{ [key: string]: number }>({})
  const [poolData, setPoolData] = useState<{ [key: string]: number }>({})
  const [lpBalances, setLpBalances] = useState<{ [key: string]: number }>({})
  const [claimButtonDisabled, setClaimButtonDisabled] = useState<{ [key: string]: boolean }>({})
  const [claimingKeys, setClaimingKeys] = useState<React.Key[]>([])
  const [isOptedIn, setIsOptedIn] = useState<boolean | null>(null)

  // Modal state
  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [modalTarget, setModalTarget] = useState<{ appId: number; stakeTokenId: number; stakeTokenBId: number; pairName: string; userStake: number } | null>(null)

  // AI Analysis modal state
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPoolTarget, setAiPoolTarget] = useState<any>(null)

  // Fee confirmation state
  const [feeModalVisible, setFeeModalVisible] = useState(false)
  const [feeCalc, setFeeCalc] = useState<FeeCalculation | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ type: string; args: any } | null>(null)
  const [feeActionLabel, setFeeActionLabel] = useState('')
  const [feeAmountFormatted, setFeeAmountFormatted] = useState('')
  const [netAmountFormatted, setNetAmountFormatted] = useState('')

  const { activeAddress, signer: walletSigner } = useMultiChainWallet()
  const signer = walletSigner!
  const { chainId, activeChain, getAlgodClient } = useChain()
  const { ensureAuth } = useAuth()

  const navigate = useNavigate()

  React.useEffect(() => {
    async function checkOptIn() {
      if (!activeAddress) return
      try {
        const indexer = new algosdk.Indexer('', import.meta.env.VITE_INDEXER_SERVER || 'https://mainnet-idx.algonode.cloud', '')
        const accountInfo = await indexer.lookupAccountByID(activeAddress).do()
        const assets = accountInfo.account.assets || []
        setIsOptedIn(assets.some((asset: any) => asset['asset-id'] === FRY_ASSET_ID))
      } catch (e) {
        setIsOptedIn(null)
      }
    }
    checkOptIn()
  }, [activeAddress, chainId])

  const handleOptIn = async () => {
    if (!activeAddress || !signer) return
    try {
      const algod = new algosdk.Algodv2('', import.meta.env.VITE_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud', '')
      const params = await algod.getTransactionParams().do()
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: activeAddress,
        to: activeAddress,
        assetIndex: FRY_ASSET_ID,
        amount: 0,
        suggestedParams: params,
      })

      const signedTxns: any = await signer([txn], [0])
      const { txId } = await algod.sendRawTransaction(signedTxns).do()
      await algosdk.waitForConfirmation(algod, txId, 4)
      toast.success('Opt-in to FRY successful!')
      setIsOptedIn(true)
    } catch (err) {
      console.error('Opt-in failed:', err)
      toast.error('Opt-in to FRY failed.')
    }
  }

  const fetchLpBalance = async (key: React.Key, stakeTokenId: number) => {
    if (!activeAddress || !stakeTokenId) return
    try {
      const algod = getAlgodClient()
      const assetInfo = await algod.accountAssetInformation(activeAddress, stakeTokenId).do()
      const balance = Number(assetInfo?.['asset-holding']?.amount ?? 0)
      setLpBalances((prev) => ({ ...prev, [String(key)]: balance / 1_000_000 }))
    } catch {
      setLpBalances((prev) => ({ ...prev, [String(key)]: 0 }))
    }
  }

  const handleToggleExpand = async (key: React.Key, appId?: number, stakeTokenId?: number) => {
    if (expandedKeys.includes(key)) {
      setExpandedKeys((prev) => prev.filter((rowKey) => rowKey !== key))
    } else {
      setExpandedKeys([key])

      if (stakeTokenId) {
        fetchLpBalance(key, stakeTokenId)
      }

      if (appId) {
        try {
          // Fetch user's staking data for the expanded pool
          const userRes = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${appId}/user/${activeAddress}`)
          const totalStaked = userRes.data?.totalStaked || 0

          // Update the user stakes state for the current pool
          setUserStakes((prev) => ({
            ...prev,
            [String(key)]: totalStaked,
          }))

          // Fetch pool data for total tokens in the pool and total withdrawn
          const poolRes = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${appId}`)

          const updatedTotalTokens = poolRes.data?.totalBalance || 0

          setPoolData((prev) => ({
            ...prev,
            [String(key)]: updatedTotalTokens,
          }))

          // Get the farm end time from the pool data
          const currentTime = Date.now()
          const farmEndTime = poolRes.data?.ends
          const isFarmEnded = currentTime > farmEndTime

          // Update the state to disable or show the Claim button
          setClaimButtonDisabled((prev) => ({
            ...prev,
            [String(key)]: !isFarmEnded, // Disable button if farm has not ended
          }))
        } catch (err) {
          console.error('Error fetching data:', err)
          setUserStakes((prev) => ({ ...prev, [String(key)]: 0 }))
          setPoolData((prev) => ({ ...prev, [String(key)]: 0 }))
        }
      }
    }
  }

  const isStakingRef = useRef(false)

  // Fee confirmation helpers

  const showFeeConfirmation = async (actionType: string, amountMicro: number, tokenAsaId: number, tokenDecimals: number, tokenName: string, label: string, action: { type: string; args: any }) => {
    try {
      setFeeLoading(true)
      const config = await fetchFeeConfig()
      const fee = calculateFeeSimple(actionType, amountMicro, config)

      setFeeCalc(fee)
      const divisor = Math.pow(10, tokenDecimals)
      setFeeAmountFormatted(`${(fee.feeAmount / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`)
      setNetAmountFormatted(`${(fee.netAmount / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`)
      setFeeActionLabel(label)
      setPendingAction({ ...action, args: { ...action.args, feeAmount: fee.feeAmount, feeTokenId: tokenAsaId, feeRecipient: fee.feeRecipient } })
      setFeeModalVisible(true)
    } catch (error: any) {
      toast.error(error?.message || 'Error calculating fee')
    } finally {
      setFeeLoading(false)
    }
  }

  const cancelFeeModal = () => {
    setFeeModalVisible(false)
    setPendingAction(null)
    setFeeCalc(null)
    setFeeAmountFormatted('')
    setNetAmountFormatted('')
    isStakingRef.current = false
  }

  const executePendingAction = async () => {
    if (!pendingAction || !feeCalc) return
    setFeeModalVisible(false)
    const { type, args } = pendingAction

    if (type === 'stake') await executeStake(args)
    else if (type === 'withdraw') await executeWithdraw(args)
    else if (type === 'claim') await executeClaim(args)
    else if (type === 'claimAndWithdraw') await executeClaimAndWithdraw(args)

    setPendingAction(null)
    setFeeCalc(null)
  }

  const handleStake = async (record: DataType) => {
    if (isStakingRef.current) return
    isStakingRef.current = true

    const keyStr = String(record.key)
    const amountStr = stakeInput[keyStr] || '0'
    const floatAmount = parseFloat(amountStr)

    if (isNaN(floatAmount) || floatAmount <= 0) {
      toast.error('Invalid stake amount')
      isStakingRef.current = false
      return
    }

    const stakeAmount = Math.floor(floatAmount * 1_000_000)

    try {
      await ensureAuth()
      const tokenId = record.stakeTokenId || FRY_ASSET_ID
      const tokenName = (record as any).stakeTokenName || 'tokens'
      await showFeeConfirmation('farmingDeposit', stakeAmount, tokenId, 6, tokenName, `Stake ${floatAmount} ${tokenName}`, {
        type: 'stake', args: { record, stakeAmount, floatAmount, keyStr }
      })
    } catch (err) {
      console.error('Staking failed:', err)
      toast.error('Staking failed. Please try again.')
      isStakingRef.current = false
    }
  }

  const executeStake = async (args: any) => {
    const { record, stakeAmount, floatAmount, keyStr } = args
    try {
      setStakeLoadingKeys((prev) => [...prev, record.key])

      const stakeResult = await stakeTokens(record.appId, stakeAmount, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient) as any
      const { result: tx, feeTxId, feeTokenId } = stakeResult

      const netFloat = floatAmount - ((args.feeAmount || 0) / 1_000_000)
      const stakingData = {
        tokens: netFloat,
        wallet: activeAddress!,
        poolId: record.appId,
        stakedAmount: netFloat,
        earnedReward: 0,
        lastStakedAt: Date.now(),
        claimedAt: null,
        feeTxId,
        feeAssetId: feeTokenId,
      }

      await authAxios.post('/stakingfarmingtoken/add', stakingData)
      toast.success('Stake successful')

      const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${record.appId}/user/${activeAddress}`)
      const updatedStake = res.data?.totalStaked

      setUserStakes((prev) => ({
        ...prev,
        [String(record.key)]: updatedStake ? updatedStake : 0,
      }))

      const poolRes = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${record.appId}`)
      const updatedTotalTokens = poolRes.data?.totalBalance || 0
      setPoolData((prev) => ({
        ...prev,
        [String(record.key)]: updatedTotalTokens,
      }))

      setStakeInput((prev) => ({ ...prev, [keyStr]: '' }))
      await new Promise(r => setTimeout(r, 500));
      await fetchData()
      if (record.stakeTokenId) fetchLpBalance(record.key, record.stakeTokenId)
    } catch (err) {
      console.error('Staking failed:', err)
      toast.error('Staking failed. Please try again.')
    } finally {
      setStakeLoadingKeys((prev) => prev.filter((k) => k !== record.key))
      isStakingRef.current = false
    }
  }

  const handleWithdraw = async (record: DataType) => {
    const keyStr = String(record.key)
    const withdrawAmountStr = withdrawInput[keyStr] || '0'
    const floatAmount = parseFloat(withdrawAmountStr)

    if (isNaN(floatAmount) || floatAmount <= 0) {
      toast.error('Withdraw amount must be greater than zero')
      return
    }

    try {
      await ensureAuth()
      const adjustedWithdrawValue = floatAmount * 1_000_000
      const tokenId = record.stakeTokenId || FRY_ASSET_ID
      const tokenName = (record as any).stakeTokenName || 'tokens'
      await showFeeConfirmation('farmingWithdraw', adjustedWithdrawValue, tokenId, 6, tokenName, `Withdraw ${floatAmount} ${tokenName}`, {
        type: 'withdraw', args: { record, adjustedWithdrawValue, floatAmount, keyStr }
      })
    } catch (err: any) {
      console.error('Withdrawal failed:', err)
      toast.error(`Withdrawal failed: ${err.message || 'Unknown error'}`)
    }
  }

  const executeWithdraw = async (args: any) => {
    const { record, adjustedWithdrawValue, floatAmount, keyStr } = args
    try {
      setWithdrawLoadingKeys((prev) => [...prev, record.key])

      const { tx: withdrawToken, feeTxId, feeTokenId } = await unstakeTokens(record.appId, adjustedWithdrawValue, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient)

      await authAxios.post('/farmingwithdraw/add', {
        amount: floatAmount,
        userWallet: activeAddress!,
        poolId: String(record.appId),
        farmingTokenId: String(record.appId),
        feeTxId,
        feeAssetId: feeTokenId,
      })

      toast.success('Withdraw successful')

      const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${record.appId}/user/${activeAddress}`)
      const updatedStake = res.data?.totalStaked

      setUserStakes((prev) => ({
        ...prev,
        [String(record.key)]: updatedStake ? updatedStake : 0,
      }))

      const poolRes = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${record.appId}`)
      const updatedTotalTokens = poolRes.data?.totalBalance || 0
      setPoolData((prev) => ({
        ...prev,
        [String(record.key)]: updatedTotalTokens,
      }))

      setWithdrawInput((prev) => ({ ...prev, [keyStr]: '' }))
      await new Promise(r => setTimeout(r, 500));
      await fetchData()
      if (record.stakeTokenId) fetchLpBalance(record.key, record.stakeTokenId)
    } catch (err: any) {
      console.error('Withdrawal failed:', err)
      toast.error(`Withdrawal failed: ${err.message || 'Unknown error'}`)
    } finally {
      setWithdrawLoadingKeys((prev) => prev.filter((k) => k !== record.key))
    }
  }

  const handleClaim = async (record: DataType) => {
    try {
      await ensureAuth()
      setClaimingKeys((prev) => [...prev, record.key])

      const rewardTokenId = record.rewardTokenId || FRY_ASSET_ID

      // Estimate reward for fee calculation
      let rewardMicro = 1_000_000 // default 1 token
      try {
        const stakeInfo = await getUserStakeForPool(record.appId, activeAddress!, signer)
        if (stakeInfo && stakeInfo.reward > 0) {
          rewardMicro = Math.floor(stakeInfo.reward * 1_000_000)
        }
      } catch { /* use default */ }

      const rewardTokenName = (record as any).rewardTokenName || 'tokens'
      await showFeeConfirmation('farmingClaim', rewardMicro, rewardTokenId, 6, rewardTokenName, `Claim rewards`, {
        type: 'claim', args: { record }
      })
    } catch (error: any) {
      console.error('Claim failed:', error)
      toast.error(error.message || 'Claim failed')
      setClaimingKeys((prev) => prev.filter((k) => k !== record.key))
    }
  }

  const executeClaim = async (args: any) => {
    const { record } = args
    try {
      let result: any
      let feeTxId: string | undefined
      let feeTokenId: string | number | undefined
      try {
        const claimResult = await claimRewards(record.appId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient)
        result = claimResult.tx
        feeTxId = claimResult.feeTxId
        feeTokenId = claimResult.feeTokenId
      } catch (error: any) {
        const msg = error?.message || ''
        if (msg.includes('Farming not active') || msg.includes('assert') || msg.includes('logic eval error')) {
          toast.error('This farm was created before the update — rewards cannot be claimed after the farm ended. Please contact support.')
          return
        }
        throw error
      }
      toast.success('Claim successful')

      const userBox = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${record.appId}/user/${activeAddress}`)
      const { totalStaked, stakeTime } = userBox.data || {}

      const dbResult = await authAxios.post('/claimfarmrewards/add', {
        walletId: activeAddress,
        poolId: String(record.appId),
        stakedAmount: totalStaked || 0,
        stakeStartTime: stakeTime || Math.floor(Date.now() / 1000),
        claimTime: Math.floor(Date.now() / 1000),
        rewardClaimed: Number(result?.claimedAmount || 0),
        feeTxId,
        feeAssetId: feeTokenId,
      })

      console.log(dbResult)
      await new Promise(r => setTimeout(r, 500));
      await fetchData()
    } catch (error: any) {
      console.error('Claim failed:', error)
      toast.error(error.message || 'Claim failed')
    } finally {
      setClaimingKeys((prev) => prev.filter((k) => k !== record.key))
    }
  }

  const handleClaimAndWithdraw = async (record: DataType) => {
    try {
      await ensureAuth()
      setClaimingKeys((prev) => [...prev, record.key])

      const rewardTokenId = record.rewardTokenId || FRY_ASSET_ID

      let rewardMicro = 1_000_000
      try {
        const stakeInfo = await getUserStakeForPool(record.appId, activeAddress!, signer)
        if (stakeInfo && stakeInfo.reward > 0) {
          rewardMicro = Math.floor(stakeInfo.reward * 1_000_000)
        }
      } catch { /* use default */ }

      const rewardTokenName = (record as any).rewardTokenName || 'tokens'
      await showFeeConfirmation('farmingClaim', rewardMicro, rewardTokenId, 6, rewardTokenName, 'Claim & Withdraw', {
        type: 'claimAndWithdraw', args: { record }
      })
    } catch (error: any) {
      console.error('Claim & Withdraw failed:', error)
      toast.error(error.message || 'Claim & Withdraw failed')
      setClaimingKeys((prev) => prev.filter((k) => k !== record.key))
    }
  }

  const executeClaimAndWithdraw = async (args: any) => {
    const { record } = args
    try {
      // Step 1: Claim rewards
      let claimFeeTxId: string | undefined
      let claimFeeTokenId: string | number | undefined
      try {
        const claimResult = await claimRewards(record.appId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient)
        claimFeeTxId = claimResult.feeTxId
        claimFeeTokenId = claimResult.feeTokenId
      } catch (error: any) {
        const msg = error?.message || ''
        if (msg.includes('Farming not active') || msg.includes('assert') || msg.includes('logic eval error')) {
          toast.error('This farm was created before the update — rewards cannot be claimed after the farm ended. Please contact support.')
          return
        }
        throw error
      }

      const userBox = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/pool/${record.appId}/user/${activeAddress}`)
      const { totalStaked, stakeTime } = userBox.data || {}

      await authAxios.post('/claimfarmrewards/add', {
        walletId: activeAddress,
        poolId: String(record.appId),
        stakedAmount: totalStaked || 0,
        stakeStartTime: stakeTime || Math.floor(Date.now() / 1000),
        claimTime: Math.floor(Date.now() / 1000),
        rewardClaimed: 0,
        feeTxId: claimFeeTxId,
        feeAssetId: claimFeeTokenId,
      })

      toast.success('Rewards claimed!')

      // Step 2: Withdraw staked tokens
      const stakedAmount = userStakes[String(record.key)] * 1_000_000
      if (stakedAmount > 0) {
        const config = await fetchFeeConfig()
        const stakeTokenId = record.stakeTokenId || FRY_ASSET_ID
        const stakeTokenName = (record as any).stakeTokenName || 'tokens'
        const withdrawFee = calculateFeeSimple('farmingWithdraw', stakedAmount, config)

        const { feeTxId: withdrawFeeTxId, feeTokenId: withdrawFeeTokenId } = await unstakeTokens(record.appId, stakedAmount, activeAddress!, signer, withdrawFee.feeAmount, stakeTokenId, withdrawFee.feeRecipient)

        await authAxios.post('/farmingwithdraw/add', {
          amount: stakedAmount / 1_000_000,
          userWallet: activeAddress!,
          poolId: String(record.appId),
          farmingTokenId: String(record.appId),
          feeTxId: withdrawFeeTxId,
          feeAssetId: withdrawFeeTokenId,
        })

        toast.success('Tokens withdrawn!')
      }

      await new Promise(r => setTimeout(r, 500))
      await fetchData()
    } catch (error: any) {
      console.error('Claim & Withdraw failed:', error)
      toast.error(error.message || 'Claim & Withdraw failed')
    } finally {
      setClaimingKeys((prev) => prev.filter((k) => k !== record.key))
    }
  }

  const columns: TableColumnsType<DataType> = [
    { title: <div className="w-[350px]">Pool</div>, dataIndex: 'pool', key: 'pool' },
    {
      title: isSimpleMode ? 'Pool Size' : 'TVL',
      dataIndex: 'tvl',
      key: 'tvl',
      sorter: (a, b) => (parseFloat(a.tvl.replace(/[$,\s]/g, '')) || 0) - (parseFloat(b.tvl.replace(/[$,\s]/g, '')) || 0),
      defaultSortOrder: 'descend' as const,
      render: (value) => <p className="text-text_clr font-medium medium">{isSimpleMode ? friendlyPoolSize(parseFloat(value.replace(/[$,\s]/g, '')) || 0) : value}</p>,
    },
    { title: isSimpleMode ? 'Earnings' : 'APR', dataIndex: 'apr', key: 'apr', sorter: (a, b) => (parseFloat(a.apr) || 0) - (parseFloat(b.apr) || 0), render: (value) => <p className="text-text_clr font-medium medium">{isSimpleMode ? friendlyApr(parseFloat(value) || 0) : value}</p> },
    { title: 'STAKED', dataIndex: 'staked', key: 'staked', sorter: (a, b) => (parseFloat(a.staked.replace(/[$,\s]/g, '')) || 0) - (parseFloat(b.staked.replace(/[$,\s]/g, '')) || 0), render: (value) => <p className="text-text_clr font-medium medium">{value}</p> },
    {
      title: 'REWARD',
      dataIndex: 'reward',
      key: 'reward',
      render: (value) => value,
    },
    ...(showExpandable !== 'All'
      ? [
          {
            title: 'ENDS',
            dataIndex: 'ends',
            key: 'ends',
            sorter: (a: DataType, b: DataType) => Number(a.farmEndTime || 0) - Number(b.farmEndTime || 0),
            render: (value: string, record: DataType) => (
              <div className="flex items-center justify-between gap-[20px]">
                {(showExpandable == 'Live' || showExpandable == 'MyLive') && (
                  <div className="max-w-[71px]">
                    <p className="text-text_clr medium leading-[27px]">Ends in {value}</p>
                  </div>
                )}
                <Icon
                  icon={expandedKeys.includes(record.key) ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                  width={36}
                  height={36}
                  color="#808080"
                  className="cursor-pointer"
                  onClick={() => handleToggleExpand(record.key, record.appId, record.stakeTokenId)}
                />
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
     {isOptedIn === false && (
  <Button
    text="Opt-in to FRY Token"
    onClick={handleOptIn}
    className="button btn-primary"
    height={45}
    width={200}

  />
)}
      <div className="w-full overflow-x-auto">
      <Table<DataType>
        className="web-table"
        columns={columns}
        pagination={false}
        expandable={
          showExpandable !== 'All'
            ? {
                expandedRowRender: (record: any) => {
                  // Check if the pool has ended
                  const currentTime = Date.now()
                  const farmEndTime = record.farmEndTime // Assuming the "ends" field holds the farm end time
                  const isFarmEnded = currentTime > farmEndTime

                  return (
                    <div className="expandable">
                      <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">
                        {/* Left */}
                        <div className="flex flex-col gap-[4px]">
                          {record.stakeTokenId && record.stakeTokenBId && record.stakeTokenId !== record.stakeTokenBId && (
                            <Button
                              text="Get LP Tokens"
                              className="button btn-red-border"
                              height={45}
                              width={156}
                              onClick={() => {
                                window.open(
                                  `https://app.tinyman.org/pool/${record.stakeTokenId}/${record.stakeTokenBId}/add-liquidity`,
                                  '_blank'
                                )
                              }}
                            />
                          )}
                          <a
                            href={`${activeChain.explorerBaseUrl}/application/${record.appId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline mt-1"
                          >
                            View Contract ↗
                          </a>
                        </div>

                        {/* Right */}
                        <div className="flex gap-[24px] w-full justify-end">
                          {/* Show Stake and Withdraw buttons only if the farm is still live */}
                          {(showExpandable === 'Live' || showExpandable === 'MyLive' || showExpandable === 'Ended' || showExpandable === 'MyEnded') && (
                            // (currentTime < farmEndTime) &&
                            <>
                              {/* Stake */}
                              <div className="flex flex-col gap-[4px]">
                                {record.stakeTokenId && record.stakeTokenBId && record.stakeTokenId !== record.stakeTokenBId ? (
                                  <Button
                                    text="Stake"
                                    className="button btn-primary"
                                    height={45}
                                    width={106}
                                    onClick={() => {
                                      setModalTarget({
                                        appId: record.appId,
                                        stakeTokenId: record.stakeTokenId!,
                                        stakeTokenBId: record.stakeTokenBId!,
                                        pairName: (record as any).stakeTokenName || 'LP',
                                        userStake: userStakes[String(record.key)] || 0,
                                      })
                                      setStakeModalOpen(true)
                                    }}
                                  />
                                ) : (
                                  <>
                                    <div className="bg-[var(--input-bg)] rounded-[10px] flex gap-[13px] items-center">
                                      <Input
                                        type="number"
                                        name="stake"
                                        placeholder="0"
                                        value={stakeInput[record.key] || ''}
                                        onChange={(e) => setStakeInput((prev) => ({ ...prev, [record.key]: e.target.value }))}
                                        className="input-wrapper text-[16px] w-full max-w-[150px]"
                                      />
                                      <p className="text-text_clr medium cursor-pointer hover:text-[var(--text-primary)]"
                                         onClick={() => setStakeInput((prev) => ({ ...prev, [record.key]: String(lpBalances[String(record.key)] || 0) }))}>Max</p>
                                      <Button
                                        text={stakeLoadingKeys.includes(record.key) ? 'Staking...' : 'Stake'}
                                        className="button btn-primary"
                                        height={45}
                                        width={106}
                                        onClick={() => handleStake(record)}
                                        disabled={stakeLoadingKeys.includes(record.key)}
                                      />
                                    </div>
                                    <p className="text-text_clr e-small">Balance: {lpBalances[String(record.key)]?.toFixed(2) || '0'} token</p>
                                  </>
                                )}
                              </div>

                              {/* Withdraw */}
                              <Button
                                text="Withdraw"
                                className="button btn-primary"
                                height={45}
                                width={106}
                                onClick={() => {
                                  setModalTarget({
                                    appId: record.appId,
                                    stakeTokenId: record.stakeTokenId!,
                                    stakeTokenBId: record.stakeTokenBId || 0,
                                    pairName: (record as any).stakeTokenName || 'LP',
                                    userStake: userStakes[String(record.key)] || 0,
                                  })
                                  setWithdrawModalOpen(true)
                                }}
                              />
                            </>
                          )}
                          {/* <p>
                          Ends on:{' '}
                          {record.farmEndTime}
                          {record.farmEndTime
                            ? new Date(Number(record.farmEndTime) * 1000).toLocaleString()
                            : 'N/A'}
                          <br />
                          Now: {new Date(currentTime).toLocaleString()}
                        </p> */}
                          {/* Claim button */}
                          <Button
                            text={claimingKeys.includes(record.key) ? 'Claiming...' : 'Claim'}
                            className="button btn-primary"
                            height={45}
                            width={106}
                            onClick={() => handleClaim(record)}
                            disabled={claimingKeys.includes(record.key)}
                          />
                          {/* Claim & Withdraw for ended farms */}
                          {(showExpandable === 'Ended' || showExpandable === 'MyEnded') &&
                            userStakes[String(record.key)] > 0 && (
                              <Button
                                text={claimingKeys.includes(record.key) ? 'Processing...' : 'Claim & Withdraw'}
                                className="button btn-primary"
                                height={45}
                                width={156}
                                onClick={() => handleClaimAndWithdraw(record)}
                                disabled={claimingKeys.includes(record.key)}
                              />
                          )}

                          <Button
                            text="View details"
                            className="button btn-red-border"
                            height={45}
                            width={128}
                            onClick={() => navigate(`/farm-pool-stats?appId=${record.appId}`)}
                          />
                          <Button
                            text="AI Analysis"
                            className="button btn-red-border"
                            height={45}
                            width={128}
                            img="mdi:sparkles"
                            onClick={() => { setAiPoolTarget(record); setAiModalOpen(true) }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                },
                rowExpandable: () => true,
                expandedRowKeys: expandedKeys,
              }
            : undefined
        }
        expandIconColumnIndex={-1}
        dataSource={farms}
        scroll={{ x: '1000px' }}
      />
      </div>
      <FeeConfirmation
        visible={feeModalVisible}
        onConfirm={executePendingAction}
        onCancel={cancelFeeModal}
        actionLabel={feeActionLabel}
        feePercent={feeCalc?.feePercent ?? 0}
        feeAmountFormatted={feeAmountFormatted}
        netAmountFormatted={netAmountFormatted}
        loading={feeLoading}
      />
      {modalTarget && (
        <>
          <StakeModal
            visible={stakeModalOpen}
            onClose={() => { setStakeModalOpen(false); setModalTarget(null) }}
            onSuccess={() => { setStakeModalOpen(false); setModalTarget(null); fetchData() }}
            appId={modalTarget.appId}
            stakeTokenId={modalTarget.stakeTokenId}
            stakeTokenName={modalTarget.pairName}
            isLpFarm={true}
            stakeTokenBId={modalTarget.stakeTokenBId}
            pairName={modalTarget.pairName}
          />
          <WithdrawModal
            visible={withdrawModalOpen}
            onClose={() => { setWithdrawModalOpen(false); setModalTarget(null) }}
            onSuccess={() => { setWithdrawModalOpen(false); setModalTarget(null); fetchData() }}
            appId={modalTarget.appId}
            stakeTokenId={modalTarget.stakeTokenId}
            stakeTokenName={modalTarget.pairName}
            userStake={modalTarget.userStake}
            isLpFarm={modalTarget.stakeTokenBId !== 0 && modalTarget.stakeTokenId !== modalTarget.stakeTokenBId}
            stakeTokenBId={modalTarget.stakeTokenBId}
            pairName={modalTarget.pairName}
          />
        </>
      )}
      <AiAnalysisModal
        isOpen={aiModalOpen}
        onClose={() => { setAiModalOpen(false); setAiPoolTarget(null) }}
        type="pool"
        poolId={aiPoolTarget?._id}
        poolName={aiPoolTarget?.pairName || 'Farm'}
      />
    </div>
  )
}

export default FTable
