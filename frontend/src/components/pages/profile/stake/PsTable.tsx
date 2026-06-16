import { Icon } from '@iconify/react'
import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMultiChainWallet } from '../../../../hooks/useMultiChainWallet'
import { toast } from 'react-toastify'
import type { ProfileStakePool, PoolFilter } from './PstakeTable'
import { claimTokens, unstakeTokens, estimateStakingReward } from '../../../../staking_func'
import { useAuth } from '../../../../hooks/useAuth'
import { usesBackendClaim } from '../../../../config/stakingPools'
import { getClaimStatus, claimReward } from '../../../../services/stakingClaimApi'
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

interface P_STableProps {
  data: ProfileStakePool[]
  loading: boolean
  activeFilter: PoolFilter
  onRefresh?: () => Promise<void>
}

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0yMCAxMkMxNS41ODIyIDEyIDEyIDE1LjU4MjIgMTIgMjBDMTIgMjQuNDE3OCAxNS41ODIyIDI4IDIwIDI4QzI0LjQxNzggMjggMjggMjQuNDE3OCAyOCAyMEMyOCAxNS41ODIyIDI0LjQxNzggMTIgMjAgMTJaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+'

const EMPTY_MESSAGES: Record<PoolFilter, string> = {
  all: 'No staking positions found',
  active: 'No active staking pools',
  'ending-soon': 'No pools ending soon',
  ended: 'No ended staking pools',
}

function filterPools(pools: ProfileStakePool[], filter: PoolFilter): ProfileStakePool[] {
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

const P_STable: React.FC<P_STableProps> = ({ data, loading, activeFilter, onRefresh }) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const navigate = useNavigate()
  const { activeAddress, signer: multiSigner } = useMultiChainWallet()
  const signer = multiSigner!
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
      const pool = data.find(p => p.key === key)
      if (pool?.stakingContractId) {
        const k = String(key)
        setRewardLoading(prev => ({ ...prev, [k]: true }))
        estimateStakingReward(pool.stakingContractId, activeAddress, signer, undefined, pool.contractVersion)
          .then(est => setEstimatedRewards(prev => ({ ...prev, [k]: est.reward })))
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

  const handleClaim = async (pool: ProfileStakePool) => {
    try {
      await ensureAuth();
      setIsClaimingId(pool._id);
      const rewardTokenId = pool.rewardTokenId ?? FRY_ASSET_ID;
      const rewardTokenName = pool.rewardTokenName || 'tokens';

      if (usesBackendClaim(pool.stakingContractId)) {
        const status = await getClaimStatus(Number(pool.stakingContractId), activeAddress!);
        if (status.isLocked) {
          const lockDate = status.lockEndsAt ? new Date(status.lockEndsAt * 1000).toLocaleDateString() : 'later';
          toast.error(`Claim available after ${lockDate}`);
          setIsClaimingId(null);
          return;
        }
        const rewardMicro = status.pendingReward > 0 ? status.pendingReward : 0;
        if (rewardMicro <= 0) {
          toast.error('No rewards to claim');
          setIsClaimingId(null);
          return;
        }
        await showFeeConfirmation('stakingClaim', rewardMicro, status.rewardToken || rewardTokenId, 6, rewardTokenName,
          'Claim rewards', { type: 'claim', args: { stakingContractId: pool.stakingContractId, _id: pool._id, useBackend: true, contractVersion: pool.contractVersion } });
      } else {
        const est = await estimateStakingReward(pool.stakingContractId, activeAddress!, signer, undefined, pool.contractVersion);
        const rewardMicro = est.reward > 0 ? est.reward : 1_000_000;
        await showFeeConfirmation('stakingClaim', rewardMicro, est.rewardTokenId || rewardTokenId, 6, rewardTokenName,
          'Claim rewards', { type: 'claim', args: { stakingContractId: pool.stakingContractId, _id: pool._id, useBackend: false, contractVersion: pool.contractVersion } });
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Error during claim';
      toast.error(msg);
      setIsClaimingId(null);
    }
  };

  const executeClaim = async (args: any) => {
    try {
      if (args.useBackend) {
        const result = await claimReward(Number(args.stakingContractId), activeAddress!);
        if (!result.success) {
          toast.error(result.message || 'Claim failed');
          return;
        }
        toast.success(`Claimed ${result.amountDisplay.toFixed(2)} tokens`);
        await authAxios.post('/claimreward/add', {
          walletId: activeAddress,
          poolId: args._id,
          rewardClaimed: result.amountDisplay,
          feeTxId: result.txId,
          feeAssetId: result.rewardToken,
        }, { headers: { 'Content-Type': 'application/json' } }).catch(() => {});
        if (onRefresh) await onRefresh();
      } else {
        const claimResult = await claimTokens(args.stakingContractId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient, undefined, args.contractVersion);
        if (claimResult.error) {
          toast.error('Claim failed.');
          return;
        }

        const { feeTxId, feeTokenId } = claimResult;
        const rewardClaimed = claimResult.rewardClaimed || 0;
        const stakedAmount = claimResult.stakedAmount || 0;
        const stakedTime = claimResult.stakedTime || 0;

        await authAxios.post('/stakerData/add', {
          walletId: activeAddress, stakedAmount, stakeTime: stakedTime,
          poolId: args._id, rewardClaimed, feeTxId, feeAssetId: feeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });

        await authAxios.post('/claimreward/add', {
          walletId: activeAddress, stakedAmount, stakedTime,
          poolId: args._id, rewardClaimed, feeTxId, feeAssetId: feeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });

        toast.success('Rewards claimed successfully!');
        if (onRefresh) await onRefresh();
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Error during claim';
      toast.error(msg);
    } finally {
      setIsClaimingId(null);
    }
  };

  const handleClaimAndWithdraw = async (pool: ProfileStakePool) => {
    try {
      await ensureAuth();
      setIsClaimingId(pool._id);
      const rewardTokenId = pool.rewardTokenId ?? FRY_ASSET_ID;
      const rewardTokenName = pool.rewardTokenName || 'tokens';
      const useBackend = usesBackendClaim(pool.stakingContractId);

      if (useBackend) {
        const status = await getClaimStatus(Number(pool.stakingContractId), activeAddress!);
        const rewardMicro = status.pendingReward > 0 ? status.pendingReward : 0;
        await showFeeConfirmation('stakingClaim', rewardMicro, status.rewardToken || rewardTokenId, 6, rewardTokenName,
          'Claim & Withdraw', { type: 'claimAndWithdraw', args: { stakingContractId: pool.stakingContractId, _id: pool._id, stakeTokenId: pool.stakeTokenId, useBackend: true, contractVersion: pool.contractVersion } });
      } else {
        const est = await estimateStakingReward(pool.stakingContractId, activeAddress!, signer, undefined, pool.contractVersion);
        const rewardMicro = est.reward > 0 ? est.reward : 1_000_000;
        await showFeeConfirmation('stakingClaim', rewardMicro, est.rewardTokenId || rewardTokenId, 6, rewardTokenName,
          'Claim & Withdraw', { type: 'claimAndWithdraw', args: { stakingContractId: pool.stakingContractId, _id: pool._id, stakeTokenId: pool.stakeTokenId, useBackend: false, contractVersion: pool.contractVersion } });
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Error during claim & withdraw';
      toast.error(msg);
      setIsClaimingId(null);
    }
  };

  const executeClaimAndWithdraw = async (args: any) => {
    try {
      let stakedAmount = 0;

      if (args.useBackend) {
        // Backend claim
        const result = await claimReward(Number(args.stakingContractId), activeAddress!);
        if (!result.success) {
          toast.error(result.message || 'Claim failed. Withdrawal not attempted.');
          return;
        }
        toast.success(`Claimed ${result.amountDisplay.toFixed(2)} tokens`);
        await authAxios.post('/claimreward/add', {
          walletId: activeAddress,
          poolId: args._id,
          rewardClaimed: result.amountDisplay,
          feeTxId: result.txId,
          feeAssetId: result.rewardToken,
        }, { headers: { 'Content-Type': 'application/json' } }).catch(() => {});

        // For withdrawal after backend claim, estimate staked amount from the pool data
        const pool = data.find(p => p._id === args._id);
        stakedAmount = pool ? parseFloat(pool.userStaked) * 1_000_000 : 0;
      } else {
        // On-chain claim
        const claimResult = await claimTokens(args.stakingContractId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient, undefined, args.contractVersion);
        if (claimResult.error) {
          toast.error('Claim failed. Withdrawal not attempted.');
          return;
        }

        const { feeTxId: claimFeeTxId, feeTokenId: claimFeeTokenId } = claimResult;
        const rewardClaimed = claimResult.rewardClaimed || 0;
        stakedAmount = claimResult.stakedAmount || 0;
        const stakedTime = claimResult.stakedTime || 0;

        await authAxios.post('/stakerData/add', {
          walletId: activeAddress, stakedAmount, stakeTime: stakedTime,
          poolId: args._id, rewardClaimed, feeTxId: claimFeeTxId, feeAssetId: claimFeeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });

        await authAxios.post('/claimreward/add', {
          walletId: activeAddress, stakedAmount, stakedTime,
          poolId: args._id, rewardClaimed, feeTxId: claimFeeTxId, feeAssetId: claimFeeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });
      }

      // Step 2: Withdraw full staked amount
      if (stakedAmount > 0) {
        const config = await fetchFeeConfig();
        const stakeTokenId = args.stakeTokenId ?? FRY_ASSET_ID;
        const withdrawFee = calculateFeeSimple('stakingWithdraw', stakedAmount, config);

        const withdrawResult = await unstakeTokens(
          args.stakingContractId, stakedAmount, activeAddress!, signer,
          withdrawFee.feeAmount, stakeTokenId, withdrawFee.feeRecipient, undefined, args.contractVersion
        );

        if (withdrawResult instanceof Error) {
          toast.warning('Rewards claimed but withdrawal failed: ' + withdrawResult.message);
        } else {
          const { feeTxId: wFeeTxId, feeTokenId: wFeeTokenId } = withdrawResult as any;
          await authAxios.post('/withdraw/add', {
            tokens: stakedAmount / 1_000_000, wallet: activeAddress,
            poolId: args._id, appId: Number(args.stakingContractId),
            feeTxId: wFeeTxId, feeAssetId: wFeeTokenId,
          });
          toast.success('Rewards claimed and tokens withdrawn!');
        }
      } else {
        toast.success('Rewards claimed (no tokens to withdraw).');
      }

      if (onRefresh) await onRefresh();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Error during claim & withdraw';
      toast.error(msg);
    } finally {
      setIsClaimingId(null);
    }
  };

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

  const tableData: DataType[] = filteredData.map((pool) => ({
    key: pool.key,
    pool: (
      <div className="flex items-center gap-[16px] w-[350px]">
        <div className="flex relative">
          <img
            src={pool.rewardTokenImage}
            alt={pool.rewardTokenName}
            className="w-[40px] h-[40px] rounded-full drop-shadow-md"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          />
          <img
            src={pool.stakeTokenImage}
            alt={pool.stakeTokenName}
            className="w-[40px] h-[40px] rounded-full drop-shadow-md z-10 -ml-4"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          />
        </div>
        <div className="flex flex-col">
          <h6 className="text-[var(--text-primary)] font-bold tracking-[0.1px]">{pool.poolName}</h6>
          <p className="text-green font-medium small">Earn {pool.rewardTokenName}</p>
          <p className="text-[var(--text-secondary)] small">with {pool.lockDays} days lock</p>
        </div>
      </div>
    ),
    tvl: pool.tvl,
    apr: pool.apr,
    staked: pool.userStaked,
    reward: pool.reward,
    status: <StatusBadge status={pool.status} />,
    ends: (
      <p className="text-[var(--text-secondary)] small font-medium">{pool.endsIn}</p>
    ),
  }))

  if (!loading && filteredData.length === 0) {
    return (
      <div className="w-full py-[60px] flex flex-col items-center gap-[12px]">
        <Icon icon="mdi:wallet-outline" width={48} height={48} color="#808080" />
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
          const pool = data.find((p) => p.key === record.key)
          const k = String(record.key)
          const isEnded = pool?.status === 'ended'
          const rewardAvailable = estimatedRewards[k] !== undefined ? estimatedRewards[k] > 0 : true
          const isLoading = rewardLoading[k]

          return (
            <div className="expandable">
              <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[var(--text-secondary)] small">
                    {pool?.isCreator ? 'You created this pool' : 'You have staked in this pool'}
                  </p>
                  {isLoading ? (
                    <p className="text-blue-500 text-sm flex items-center gap-1">
                      <Icon icon="eos-icons:loading" width={14} /> Estimating rewards...
                    </p>
                  ) : estimatedRewards[k] !== undefined && (
                    <p className="text-[var(--text-primary)] font-medium text-sm">
                      Pending Rewards: ~{(estimatedRewards[k] / 1_000_000).toFixed(2)} {pool?.rewardTokenName || 'tokens'}
                    </p>
                  )}
                  {pool && (!pool.contractVersion || pool.contractVersion === 1) && (
                    <p className="text-red-400 text-xs font-medium mt-1">
                      V1 legacy pool — claiming is disabled to protect your rewards. Use Withdraw on the Stake page.
                    </p>
                  )}
                </div>
                <div className="flex gap-[10px]">
                  {pool && activeAddress && (() => {
                    if (isClaimingId === pool._id) {
                      return <p className="text-blue-500 font-medium">Processing...</p>
                    }
                    if (!pool.contractVersion || pool.contractVersion === 1) {
                      return (
                        <div className="flex flex-col items-center">
                          <button
                            className="button btn-primary rounded-[10px] px-[16px] py-[10px] text-white opacity-40 cursor-not-allowed linearGradient"
                            disabled={true}
                          >
                            {isEnded ? 'Claim & Withdraw' : 'Claim'}
                          </button>
                          <p className="text-[10px] text-red-500 mt-1">Claim disabled — use Withdraw on Stake page</p>
                        </div>
                      )
                    }
                    // Lock period check for V2 pools
                    const stakeTime = pool.userStakeTime
                    const lockSecs = pool.lockPeriodSecs
                    const now = Math.floor(Date.now() / 1000)
                    const isPoolLocked = stakeTime && lockSecs > 0 && (stakeTime + lockSecs) > now

                    if (isPoolLocked) {
                      return (
                        <div className="flex flex-col items-center">
                          <button
                            className="button btn-primary rounded-[10px] px-[16px] py-[10px] text-white opacity-40 cursor-not-allowed linearGradient"
                            disabled={true}
                          >
                            {isEnded ? 'Claim & Withdraw' : 'Claim'}
                          </button>
                          <p className="text-[10px] text-yellow-500 mt-1">
                            Locked until {new Date((stakeTime + lockSecs) * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      )
                    }

                    return (
                      <button
                        className="button btn-primary rounded-[10px] px-[16px] py-[10px] text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed linearGradient"
                        onClick={() => isEnded ? handleClaimAndWithdraw(pool) : handleClaim(pool)}
                        disabled={!!isClaimingId || isLoading || !rewardAvailable}
                      >
                        {isLoading ? 'Checking...' : isEnded ? 'Claim & Withdraw' : 'Claim'}
                      </button>
                    )
                  })()}
                  <button
                    className="button btn-red-border rounded-[10px] px-[16px] py-[10px] text-[var(--text-primary)] cursor-pointer"
                    onClick={() => navigate('/token-stake')}
                  >
                    View on Stake Page
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
    </>
  )
}

export default P_STable
