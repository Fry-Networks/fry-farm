import { Icon } from '@iconify/react'
import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet'
import { toast } from 'react-toastify'
import type { ProfileFarmPool, FarmFilter } from './P_farmTable'
import { claimRewards, unstakeTokens, getUserStakeForPool, estimateFarmingReward } from '../../../../farming_func'
import { useAuth } from '../../../../hooks/useAuth'
import { fetchFeeConfig, calculateFeeSimple } from '../../../../services/FeeService'
import type { FeeCalculation } from '../../../../services/FeeService'
import FeeConfirmation from '../../../shared/FeeConfirmation'
import { authAxios } from '../../../../services/apiClient'
import { usePreferences } from '../../../../contexts/PreferencesContext'
import { friendlyApr, friendlyPoolSize } from '../../../../utils/grandmaLabels'

const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946;

interface DataType {
  key: React.Key
  pool: React.ReactNode
  tvl: string
  apr: string
  staked: string
  reward: string
  status: React.ReactNode
  ends: React.ReactNode
}

interface P_FTableProps {
  data: ProfileFarmPool[]
  loading: boolean
  activeFilter: FarmFilter
  onRefresh?: () => Promise<void>
}

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0yMCAxMkMxNS41ODIyIDEyIDEyIDE1LjU4MjIgMTIgMjBDMTIgMjQuNDE3OCAxNS41ODIyIDI4IDIwIDI4QzI0LjQxNzggMjggMjggMjQuNDE3OCAyOCAyMEMyOCAxNS41ODIyIDI0LjQxNzggMTIgMjAgMTJaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+'

const EMPTY_MESSAGES: Record<FarmFilter, string> = {
  all: 'No farming pools found',
  active: 'No active farming pools',
  'ending-soon': 'No pools ending soon',
  ended: 'No ended farming pools',
}

function filterPools(pools: ProfileFarmPool[], filter: FarmFilter): ProfileFarmPool[] {
  if (filter === 'all') return pools
  return pools.filter((p) => p.status === filter)
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' },
    'ending-soon': { label: 'Ending Soon', bg: 'bg-yellow-100', text: 'text-yellow-700' },
    ended: { label: 'Ended', bg: 'bg-gray-100', text: 'text-gray-500' },
  }[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-500' }

  return (
    <span className={`${config.bg} ${config.text} px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap`}>
      {config.label}
    </span>
  )
}

const P_FTable: React.FC<P_FTableProps> = ({ data, loading, activeFilter, onRefresh }) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const navigate = useNavigate()
  const { activeAddress, signer } = useWallet()
  const { ensureAuth } = useAuth()
  const { isSimpleMode } = usePreferences()

  const [isClaimingId, setIsClaimingId] = useState<string | null>(null)
  const [estimatedRewards, setEstimatedRewards] = useState<Record<string, number>>({})
  const [rewardLoading, setRewardLoading] = useState<Record<string, boolean>>({})

  // Fee confirmation state
  const [feeModalVisible, setFeeModalVisible] = useState(false)
  const [feeCalc, setFeeCalc] = useState<FeeCalculation | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ type: string; args: any } | null>(null)
  const [feeActionLabel, setFeeActionLabel] = useState('')
  const [feeAmountFormatted, setFeeAmountFormatted] = useState('')
  const [netAmountFormatted, setNetAmountFormatted] = useState('')

  const filteredData = filterPools(data, activeFilter)

  const handleToggleExpand = (key: React.Key) => {
    const isExpanding = !expandedKeys.includes(key)
    setExpandedKeys(
      (prev) => (prev.includes(key) ? prev.filter((rowKey) => rowKey !== key) : [key]),
    )
    if (isExpanding && activeAddress && signer) {
      const farm = data.find(f => f.key === key)
      if (farm?.appId) {
        const k = String(key)
        setRewardLoading(prev => ({ ...prev, [k]: true }))
        estimateFarmingReward(farm.appId, activeAddress, signer)
          .then(est => setEstimatedRewards(prev => ({ ...prev, [k]: est.reward / 1e6 })))
          .catch(() => {})
          .finally(() => setRewardLoading(prev => ({ ...prev, [k]: false })))
      }
    }
  }

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
    setIsClaimingId(null)
  }

  const executePendingAction = async () => {
    if (!pendingAction || !feeCalc) return
    setFeeModalVisible(false)
    const { type, args } = pendingAction

    if (type === 'claim') {
      await executeClaim(args)
    } else if (type === 'claimAndWithdraw') {
      await executeClaimAndWithdraw(args)
    }

    setPendingAction(null)
    setFeeCalc(null)
  }

  const handleClaim = async (farm: ProfileFarmPool) => {
    try {
      await ensureAuth()
      setIsClaimingId(farm._id)
      const rewardTokenId = farm.rewardTokenId || FRY_ASSET_ID
      const rewardTokenName = farm.rewardTokenName || 'tokens'

      let rewardMicro = 1_000_000
      try {
        const est = await getUserStakeForPool(farm.appId, activeAddress!, signer)
        if (est && est.reward > 0) {
          rewardMicro = Math.floor(est.reward * 1_000_000)
        }
      } catch { /* use default */ }

      await showFeeConfirmation('farmingClaim', rewardMicro, rewardTokenId, 6, rewardTokenName,
        'Claim rewards', { type: 'claim', args: { appId: farm.appId, _id: farm._id } })
    } catch (error: any) {
      toast.error(error?.message || 'Error during claim')
      setIsClaimingId(null)
    }
  }

  const executeClaim = async (args: any) => {
    try {
      let claimFeeTxId: string | undefined
      let claimFeeTokenId: number | undefined
      try {
        const claimResult = await claimRewards(args.appId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient)
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

      await authAxios.post('/claimfarmrewards/add', {
        walletId: activeAddress,
        poolId: String(args.appId),
        stakedAmount: 0,
        stakeStartTime: Math.floor(Date.now() / 1000),
        claimTime: Math.floor(Date.now() / 1000),
        rewardClaimed: 0,
        feeTxId: claimFeeTxId, feeAssetId: claimFeeTokenId,
      })

      toast.success('Rewards claimed successfully!')
      if (onRefresh) await onRefresh()
    } catch (error: any) {
      toast.error(error?.message || 'Error during claim')
    } finally {
      setIsClaimingId(null)
    }
  }

  const handleClaimAndWithdraw = async (farm: ProfileFarmPool) => {
    try {
      await ensureAuth()
      setIsClaimingId(farm._id)
      const rewardTokenId = farm.rewardTokenId || FRY_ASSET_ID
      const rewardTokenName = farm.rewardTokenName || 'tokens'

      let rewardMicro = 1_000_000
      try {
        const est = await getUserStakeForPool(farm.appId, activeAddress!, signer)
        if (est && est.reward > 0) {
          rewardMicro = Math.floor(est.reward * 1_000_000)
        }
      } catch { /* use default */ }

      await showFeeConfirmation('farmingClaim', rewardMicro, rewardTokenId, 6, rewardTokenName,
        'Claim & Withdraw', { type: 'claimAndWithdraw', args: { appId: farm.appId, _id: farm._id, stakeTokenId: farm.stakeTokenId } })
    } catch (error: any) {
      toast.error(error?.message || 'Error during claim & withdraw')
      setIsClaimingId(null)
    }
  }

  const executeClaimAndWithdraw = async (args: any) => {
    try {
      // Step 1: Claim rewards
      let claimFeeTxId: string | undefined
      let claimFeeTokenId: number | undefined
      try {
        const claimResult = await claimRewards(args.appId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient)
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

      await authAxios.post('/claimfarmrewards/add', {
        walletId: activeAddress,
        poolId: String(args.appId),
        stakedAmount: 0,
        stakeStartTime: Math.floor(Date.now() / 1000),
        claimTime: Math.floor(Date.now() / 1000),
        rewardClaimed: 0,
        feeTxId: claimFeeTxId, feeAssetId: claimFeeTokenId,
      })

      toast.success('Rewards claimed!')

      // Step 2: Withdraw staked tokens
      const est = await getUserStakeForPool(args.appId, activeAddress!, signer)
      const stakedAmount = est?.staked ? Math.floor(est.staked * 1_000_000) : 0

      if (stakedAmount > 0) {
        const config = await fetchFeeConfig()
        const stakeTokenId = args.stakeTokenId || FRY_ASSET_ID
        const withdrawFee = calculateFeeSimple('farmingWithdraw', stakedAmount, config)

        const withdrawResult = await unstakeTokens(args.appId, stakedAmount, activeAddress!, signer, withdrawFee.feeAmount, stakeTokenId, withdrawFee.feeRecipient)

        await authAxios.post('/farmingwithdraw/add', {
          amount: stakedAmount / 1_000_000,
          userWallet: activeAddress!,
          poolId: String(args.appId),
          farmingTokenId: String(args.appId),
          feeTxId: withdrawResult.feeTxId, feeAssetId: withdrawResult.feeTokenId,
        })

        toast.success('Tokens withdrawn!')
      }

      if (onRefresh) await onRefresh()
    } catch (error: any) {
      toast.error(error?.message || 'Error during claim & withdraw')
    } finally {
      setIsClaimingId(null)
    }
  }

  const columns: TableColumnsType<DataType> = [
    { title: <div className="w-[350px]">Pool</div>, dataIndex: 'pool', key: 'pool' },
    {
      title: (
        <div className="flex items-center gap-[2px]">
          {isSimpleMode ? 'Pool Size' : 'TVL'}
          <Icon icon="solar:arrow-down-outline" width={18} height={21} color="var(--text-primary)" />
        </div>
      ),
      dataIndex: 'tvl',
      key: 'tvl',
      render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{isSimpleMode ? friendlyPoolSize(parseFloat(String(value).replace(/[$,\s]/g, '')) || 0) : value}</p>,
    },
    { title: isSimpleMode ? 'Earnings' : 'APR', dataIndex: 'apr', key: 'apr', render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{isSimpleMode ? friendlyApr(parseFloat(value) || 0) : value}</p> },
    { title: 'MY STAKE', dataIndex: 'staked', key: 'staked', render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{value}</p> },
    { title: 'REWARD', dataIndex: 'reward', key: 'reward', render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{value}</p> },
    { title: 'STATUS', dataIndex: 'status', key: 'status' },
    {
      title: 'ENDS',
      dataIndex: 'ends',
      key: 'ends',
      render: (_, record) => (
        <div className="flex items-center justify-between gap-[20px]">
          <div className="max-w-[100px]">{record.ends}</div>
          <Icon
            icon={expandedKeys.includes(record.key) ? 'mdi:chevron-up' : 'mdi:chevron-down'}
            width={36}
            height={36}
            color="#808080"
            className="cursor-pointer"
            onClick={() => handleToggleExpand(record.key)}
          />
        </div>
      ),
    },
  ]

  const tableData: DataType[] = filteredData.map((farm) => ({
    key: farm.key,
    pool: (
      <div className="flex items-center gap-[16px] w-[350px]">
        <div className="flex relative">
          <img
            src={farm.tokenAImage}
            alt={farm.tokenAName}
            className="w-[40px] h-[40px] rounded-full drop-shadow-md"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          />
          <img
            src={farm.tokenBImage}
            alt={farm.tokenBName}
            className="w-[40px] h-[40px] rounded-full drop-shadow-md -ml-4 z-10"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          />
        </div>
        <div className="flex flex-col">
          <h6 className="text-[var(--text-primary)] font-bold tracking-[0.1px]">{farm.pairName}</h6>
          <div className="flex items-center gap-2">
            <img
              src={farm.rewardTokenImage}
              alt={farm.rewardTokenName}
              className="w-[16px] h-[16px] rounded-full"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
            />
            <p className="text-green font-medium small">Earn {farm.rewardTokenName}</p>
            {farm.dexProvider && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">
                {farm.dexProvider}
              </span>
            )}
          </div>
        </div>
      </div>
    ),
    tvl: farm.tvl,
    apr: farm.apr,
    staked: farm.userStaked,
    reward: farm.reward,
    status: <StatusBadge status={farm.status} />,
    ends: (
      <p className="text-[var(--text-secondary)] small font-medium">{farm.endsIn}</p>
    ),
  }))

  if (!loading && filteredData.length === 0) {
    return (
      <div className="w-full py-[60px] flex flex-col items-center gap-[12px]">
        <Icon icon="mdi:tractor" width={48} height={48} color="#808080" />
        <p className="text-[var(--text-secondary)] medium">{EMPTY_MESSAGES[activeFilter]}</p>
      </div>
    )
  }

  return (
    <>
    <div className="w-full overflow-x-auto">
    <Table<DataType>
      className="web-table"
      columns={columns}
      pagination={false}
      loading={loading}
      expandable={{
        expandedRowRender: (record) => {
          const farm = data.find((f) => f.key === record.key)
          const k = String(record.key)
          const isEnded = farm?.status === 'ended'
          const rewardAvailable = estimatedRewards[k] !== undefined ? estimatedRewards[k] > 0 : true
          const isLoading = rewardLoading[k]

          return (
            <div className="expandable">
              <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[var(--text-secondary)] small">
                    {farm?.isCreator ? 'You created this farm' : 'You have farmed in this pool'}
                  </p>
                  {isLoading ? (
                    <p className="text-blue-500 text-sm flex items-center gap-1">
                      <Icon icon="eos-icons:loading" width={14} /> Estimating rewards...
                    </p>
                  ) : estimatedRewards[k] !== undefined && (
                    <p className="text-[var(--text-primary)] font-medium text-sm">
                      Pending Rewards: ~{estimatedRewards[k].toFixed(2)} {farm?.rewardTokenName || 'tokens'}
                    </p>
                  )}
                </div>
                <div className="flex gap-[10px]">
                  {farm && activeAddress && (
                    isClaimingId === farm._id ? (
                      <p className="text-blue-500 font-medium">Processing...</p>
                    ) : (
                      <button
                        className="button btn-primary rounded-[10px] px-[16px] py-[10px] text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed linearGradient"
                        onClick={() => isEnded ? handleClaimAndWithdraw(farm) : handleClaim(farm)}
                        disabled={!!isClaimingId || isLoading || !rewardAvailable}
                      >
                        {isLoading ? 'Checking...' : isEnded ? 'Claim & Withdraw' : 'Claim'}
                      </button>
                    )
                  )}
                  <button
                    className="button btn-red-border rounded-[10px] px-[16px] py-[10px] text-[var(--text-primary)] cursor-pointer"
                    onClick={() => navigate('/farm')}
                  >
                    View on Farm Page
                  </button>
                </div>
              </div>
            </div>
          )
        },
        rowExpandable: () => true,
        expandedRowKeys: expandedKeys,
      }}
      expandIconColumnIndex={-1}
      dataSource={tableData}
      scroll={{ x: '900px' }}
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
    </>
  )
}

export default P_FTable
