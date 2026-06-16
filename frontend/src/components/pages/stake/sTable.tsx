import { Icon } from '@iconify/react' // Import Iconify
import { useWallet } from '@txnlab/use-wallet'
import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import axios from 'axios'
import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { usePoolData } from '../../../context/PoolDataContext'
import { claimTokens, getStakingData, getUserData, stakeTokens, unstakeTokens, getAlgodClient, estimateStakingReward, topUpRewards, checkPoolRewardBalance, getPoolRewardDeficit } from '../../../staking_func'
import { getAlgodConfigFromViteEnvironment } from '../../../utils/network/getAlgoClientConfigs'
import Button from '../../shared/button'
import Input from '../../shared/input'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import { authAxios } from '../../../services/apiClient'
import { usePreferences } from '../../../contexts/PreferencesContext'
import { friendlyApr, friendlyPoolSize } from '../../../utils/grandmaLabels'
import { useAuth } from '../../../hooks/useAuth'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useChain } from '../../../context/ChainContext'
import { fetchFeeConfig, calculateFeeSimple } from '../../../services/FeeService'
import type { FeeCalculation } from '../../../services/FeeService'
import { loadMarketData, findPool } from '../../../contracts/nomadex/api'
import FeeConfirmation from '../../shared/FeeConfirmation'
import { usesBackendClaim } from '../../../config/stakingPools'
import { getClaimStatus, claimReward } from '../../../services/stakingClaimApi'
import StakeModal from '../../shared/StakeModal'
import WithdrawModal from '../../shared/WithdrawModal'
import AiAnalysisModal from '../../../Modals/AiAnalysisModal'

interface DataType {
  [x: string]: any
  key: React.Key
  pool: string
  tvl: string
  apr: string
  staked: string
  reward: string
  ends: string
  stakingContractId: number
  stakeTokenName?: string
  _id: string
}

interface StakingRecord {
  apr: number
  lockPeriod: number
  poolStartTime: number
  poolEndTime: number
  rewardToken?: number
  stakeToken?: number
  poolTime?: number
  totalStaked?: number
}

interface STableProps {
  stacks: DataType[]
  fetchData: () => Promise<void>
  showExpandable: string
  allPools?: DataType[]
}

const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946;

/** Retry an async function up to `retries` times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries - 1) throw err
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)))
    }
  }
  throw new Error('withRetry exhausted') // unreachable
}

// Define the columns for the table
// const STable: React.FC<STableProps> = memo(({ stacks, fetchData }) => {
const STable: React.FC<STableProps> = memo(({ stacks, fetchData, showExpandable, allPools }) => {
  const { ensureAuth, isAdmin } = useAuth();
  const { isSimpleMode } = usePreferences()

  const api_base_url = import.meta.env.VITE_API_BASE_URL;
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  // stack btc input value
  const [stackValue, setStackValue] = useState<number>()
  const [withdrawValue, setWithdrawValue] = useState<number>()
  const [fryBalance, setFryBalance] = useState<number>(0) // 🔹 Store FRY balance
  const [tokenBalances, setTokenBalances] = useState<{ [key: string]: number }>({})
  const [isStaking, setIsStaking] = useState(false);
  const isStakingRef = useRef(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [isClaimingId, setIsClaimingId] = useState<string | null>(null); // Holds the _id of the pool being claimed
  const [estimatedRewards, setEstimatedRewards] = useState<Record<string, number>>({})
  const [rewardLoading, setRewardLoading] = useState<Record<string, boolean>>({})
  const [userStakes, setUserStakes] = useState<Record<string, number>>({})
  const [userStakeTimes, setUserStakeTimes] = useState<Record<string, number>>({})
  const [isMigrating, setIsMigrating] = useState<string | null>(null)
  const [withdrawLoading, setWithdrawLoading] = useState<Record<string, boolean>>({})

  // Fee confirmation state
  const [feeModalVisible, setFeeModalVisible] = useState(false)
  const [feeCalc, setFeeCalc] = useState<FeeCalculation | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ type: string; args: any } | null>(null)
  const [feeActionLabel, setFeeActionLabel] = useState('')
  const [feeAmountFormatted, setFeeAmountFormatted] = useState('')
  const [netAmountFormatted, setNetAmountFormatted] = useState('')

  // Modal state
  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [modalTarget, setModalTarget] = useState<{ appId: number; stakeTokenId: number; stakeTokenName: string; userStake: number; rewardTokenId?: number; contractVersion?: number } | null>(null)

  // AI Analysis modal state
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPoolTarget, setAiPoolTarget] = useState<DataType | null>(null)

  const navigate = useNavigate()

  const algoConfig = getAlgodConfigFromViteEnvironment()
  const networkName = useMemo(() => {
    return algoConfig.network === '' ? 'localnet' : algoConfig.network.toLocaleLowerCase()
  }, [algoConfig.network])
  const { setPoolData } = usePoolData() // Get the function to set poolData from context

  const { providers, clients, activeAccount, activeAddress: algoAddress, signer: algoSigner } = useWallet()
  const { activeAddress, signer: multiSigner } = useMultiChainWallet()
  const { getAlgodClient: getChainAlgodClient, activeChain, chainId } = useChain()
  // Use multi-chain signer, falling back to Algorand signer for staking operations
  const signer = multiSigner || algoSigner
  // Build algod config for chain-aware staking functions
  const chainAlgodConfig = 'algodServer' in (activeChain.connection as any)
    ? { server: (activeChain.connection as any).algodServer, port: (activeChain.connection as any).algodPort, token: (activeChain.connection as any).algodToken }
    : undefined
  const fryAssetId = activeChain.fryTokenId ? Number(activeChain.fryTokenId) : FRY_ASSET_ID
  const handleToggleExpand = (key: React.Key, stakeTokenId?: number) => {
    const isExpanding = !expandedKeys.includes(key)
    setExpandedKeys(
      (prev) => (prev.includes(key) ? prev.filter((rowKey) => rowKey !== key) : [key]), // Allow only one row to expand at a time
    )
    if (isExpanding) {
      if (stakeTokenId) fetchTokenBalance(key, stakeTokenId)
      // Fetch user's individual staked amount from smart contract
      if (activeAddress) {
        const pool = stacks.find(s => s.key === key)
        if (pool?.stakingContractId) {
          const k = String(key)
          getUserData(pool.stakingContractId, activeAddress, getChainAlgodClient())
            .then(data => {
              setUserStakes(prev => ({ ...prev, [k]: Number(data.stakedAmount || 0) / 1_000_000 }))
              setUserStakeTimes(prev => ({ ...prev, [k]: Number(data.stakeTime || 0) }))
            })
            .catch(async () => {
              // On-chain box read failed (common for V1 pools) — fallback to backend records
              try {
                const res = await axios.get(`${api_base_url}/stakingtoken/wallet/${activeAddress}`)
                const records = res.data?.data || []
                const match = records.find((r: any) =>
                  r.appId === pool.stakingContractId || r.poolId === pool._id
                )
                if (match && match.totalStaked > 0) {
                  setUserStakes(prev => ({ ...prev, [k]: match.totalStaked / 1_000_000 }))
                  return
                }
              } catch { /* ignore backend fallback errors */ }
              setUserStakes(prev => ({ ...prev, [k]: 0 }))
            })
          // Estimate reward for grey-out logic
          if (signer) {
            setRewardLoading(prev => ({ ...prev, [k]: true }))
            estimateStakingReward(pool.stakingContractId, activeAddress, signer, chainAlgodConfig, pool.contractVersion)
              .then(est => setEstimatedRewards(prev => ({ ...prev, [k]: est.reward })))
              .catch(() => {}) // on error, leave undefined = button stays enabled
              .finally(() => setRewardLoading(prev => ({ ...prev, [k]: false })))
          }
        }
      }
    }
  }

  const [claimedPools, setClaimedPools] = useState<string[]>([])

  const fetchClaimedPools = async () => {
    if (!activeAddress) return

    try {
      const res = await axios.get(`${api_base_url}/stakerData/${activeAddress}`)
      if (res.status === 200) {
        console.log('staker data')
        console.log(res)
        const poolIds = res.data.data.map((item: any) => item.poolId)
        setClaimedPools(poolIds)
      }
    } catch (error) {
      console.error("Error fetching claimed pools:", error)
    }
  }

  const fetchBalance = async () => {
    if (!activeAddress) {
      setFryBalance(0)
      return
    }

    try {
      const algod = getChainAlgodClient()
      const info = await algod.accountAssetInformation(activeAddress, fryAssetId).do()
      const amount = Number(info?.['asset-holding']?.amount ?? 0)
      setFryBalance(amount / 1_000_000)
    } catch {
      setFryBalance(0)
    }
  }

  const fetchTokenBalance = async (key: React.Key, stakeTokenId: number) => {
    if (!activeAddress || stakeTokenId == null) return
    try {
      const algod = getChainAlgodClient()
      let balance: number
      if (stakeTokenId === 0) {
        // Native token (ALGO/VOI) — use accountInformation
        const info = await algod.accountInformation(activeAddress).do()
        balance = Number(info?.amount ?? 0)
      } else {
        const assetInfo = await algod.accountAssetInformation(activeAddress, stakeTokenId).do()
        balance = Number(assetInfo?.['asset-holding']?.amount ?? 0)
      }
      setTokenBalances((prev) => ({ ...prev, [String(key)]: balance / 1_000_000 }))
    } catch {
      setTokenBalances((prev) => ({ ...prev, [String(key)]: 0 }))
    }
  }

  useEffect(() => {
    fetchBalance()
    fetchClaimedPools()
  }, [activeAddress]) // 🔹 Fetch balance whenever the wallet address changes

  useEffect(() => {
    // console.log(stacks, 'stacks')
  }, [stacks])
  const columns: TableColumnsType<DataType> = [
    { title: <div className=" w-[350px]">Pool </div>, dataIndex: 'pool', key: 'pool' },
    {
      title: isSimpleMode ? 'Pool Size' : 'TVL',
      dataIndex: 'tvl',
      key: 'tvl',
      sorter: (a, b) => (parseFloat(a.tvl.replace(/[$,\s]/g, '')) || 0) - (parseFloat(b.tvl.replace(/[$,\s]/g, '')) || 0),
      render: (value) => <p className="text-text_clr font-medium medium">{isSimpleMode ? friendlyPoolSize(parseFloat(value.replace(/[$,\s]/g, '')) || 0) : value}</p>,
    },
    { title: isSimpleMode ? 'Earnings' : 'APR', dataIndex: 'apr', key: 'apr', sorter: (a, b) => (parseFloat(a.apr) || 0) - (parseFloat(b.apr) || 0), render: (value) => <p className="text-text_clr font-medium medium">{isSimpleMode ? friendlyApr(parseFloat(value) || 0) : value}</p> },
    { title: isSimpleMode ? 'Pool Size' : 'Staked', dataIndex: 'staked', key: 'staked', sorter: (a, b) => (a.totalAmountStaked || 0) - (b.totalAmountStaked || 0), render: (value) => <p className="text-text_clr font-medium medium">{isSimpleMode ? friendlyPoolSize(parseFloat(String(value).replace(/[$,\s]/g, '')) || 0) : value}</p> },
    {
      title: 'POOL REWARDS',
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
          sorter: (a: DataType, b: DataType) => (a.stakingEndTime || 0) - (b.stakingEndTime || 0),
          render: (value: string, record: DataType) => (
            <div className="flex items-center justify-between gap-[20px]">
              <div className="max-w-[71px]">
                <p className="text-text_clr medium leading-[27px]">{value}</p>
              </div>
              <Icon
                icon={expandedKeys.includes(record.key) ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                width={36}
                height={36}
                color="#808080"
                className="cursor-pointer"
                onClick={() => handleToggleExpand(record.key, record.stakeTokenId)}
              />
            </div>
          ),
        },
      ]
      : []),
  ]

  // Fee confirmation helpers

  const showFeeConfirmation = async (actionType: string, amountMicro: number, tokenAsaId: number, tokenDecimals: number, tokenName: string, label: string, action: { type: string; args: any }) => {
    try {
      setFeeLoading(true)
      const config = await fetchFeeConfig()
      const fee = calculateFeeSimple(actionType, amountMicro, config, activeChain.feeRecipient)

      // Check for flat VOI fee fallback on Voi
      let actualFeeAmount = fee.feeAmount
      let actualFeeTokenId = tokenAsaId
      let feeDisplay = `${(fee.feeAmount / Math.pow(10, tokenDecimals)).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`
      if (chainId === 'voi-mainnet' && activeChain.flatFeeNative) {
        await loadMarketData()
        const hasLP = findPool(tokenAsaId, 0) || findPool(tokenAsaId, 395614)
        if (!hasLP) {
          const flatFeeKey = actionType.includes('Deposit') || actionType.includes('stake') ? 'stake'
            : actionType.includes('Withdraw') || actionType.includes('unstake') ? 'unstake'
            : 'claim'
          const mappedKey = actionType === 'stakingDeposit' ? 'stake' : actionType === 'stakingWithdraw' ? 'unstake' : actionType === 'stakingClaim' ? 'claim' : flatFeeKey
          actualFeeAmount = activeChain.flatFeeNative[mappedKey as keyof typeof activeChain.flatFeeNative]
          actualFeeTokenId = 0
          feeDisplay = `${(actualFeeAmount / 1_000_000).toFixed(4)} VOI`
        }
      }

      setFeeCalc(fee)
      const divisor = Math.pow(10, tokenDecimals)
      setFeeAmountFormatted(feeDisplay)
      setNetAmountFormatted(actualFeeTokenId === 0
        ? `${(amountMicro / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`
        : `${(fee.netAmount / divisor).toFixed(tokenDecimals > 2 ? 4 : 2)} ${tokenName}`)
      setFeeActionLabel(label)
      setPendingAction({ ...action, args: { ...action.args, feeAmount: actualFeeAmount, feeTokenId: actualFeeTokenId, feeRecipient: fee.feeRecipient } })
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
    setIsStaking(false)
    setIsWithdrawing(false)
    isStakingRef.current = false
    setIsClaimingId(null)
  }

  const executePendingAction = async () => {
    if (!pendingAction || !feeCalc) return
    setFeeModalVisible(false)
    const { type, args } = pendingAction

    if (type === 'stake') {
      setIsStaking(true)
      try {
        const stakeResult = await stakeTokens(args.stakingContractId, args.adjustedStackValue, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient, chainAlgodConfig, args.contractVersion);
        if (stakeResult instanceof Error) {
          toast.error('Transaction canceled or staking failed.');
          return;
        }
        const { tx: StackToken, feeTxId: stakeFeetxId, feeTokenId: stakeFeeTokenId } = stakeResult as any;
        if (!activeAddress) {
          toast.error('No active address found for staking.');
          return;
        }

        // Backend updates — retry up to 3x after successful on-chain stake
        try {
          await withRetry(async () => {
            await ensureAuth();
            const getStakingRecord = await getStakingData(args.stakingContractId, activeAddress, signer, chainAlgodConfig, args.contractVersion) as StakingRecord;
            const StakerData = await getUserData(args.stakingContractId, activeAddress, getChainAlgodClient());
            const stakingTokenPayload = {
              apr: getStakingRecord.apr,
              lockPeriod: getStakingRecord.lockPeriod,
              poolStartTime: getStakingRecord.poolStartTime,
              poolEndTime: getStakingRecord.poolEndTime,
              poolTime: getStakingRecord.poolTime || (getStakingRecord.poolEndTime - getStakingRecord.poolStartTime),
              rewardToken: Number(getStakingRecord.rewardToken ?? FRY_ASSET_ID),
              stakeTokens: Number(getStakingRecord.stakeToken ?? FRY_ASSET_ID),
              totalStaked: args.adjustedStackValue - (args.feeAmount || 0),
              poolId: args._id,
              appId: Number(args.stakingContractId),
              wallet: activeAddress,
              feeTxId: stakeFeetxId,
              feeAssetId: stakeFeeTokenId,
            };
            await authAxios.post('/stakingtoken/add', stakingTokenPayload);
            const { stakeTime } = StakerData;
            await authAxios.put(`/staking/update/${args._id}`, {
              totalAmountStaked: Number(getStakingRecord.totalStaked ?? 0) / 1_000_000,
              totalStakers: 1,
              stakingTime: stakeTime,
            });
          });
        } catch (backendErr) {
          console.warn('Backend update failed after successful stake (retries exhausted):', backendErr);
        }

        // Always show success since on-chain stake succeeded
        await new Promise(r => setTimeout(r, 500));
        await fetchData();
        fetchBalance();
        const pool = stacks.find(s => s._id === args._id)
        if (pool?.stakeTokenId && pool?.key) fetchTokenBalance(pool.key, pool.stakeTokenId)
        toast.success('Staking successful!');
        setStackValue(0);
      } catch (error: any) {
        console.error('Error during staking operation:', error);
        const msg = error?.response?.data?.message || error?.message || 'Error during staking operation.';
        toast.error(msg);
      } finally {
        setIsStaking(false);
        isStakingRef.current = false;
      }
    } else if (type === 'withdraw') {
      await executeWithdraw(args)
    } else if (type === 'claim') {
      await executeClaim(args)
    } else if (type === 'claimAndWithdraw') {
      await executeClaimAndWithdraw(args)
    }

    setPendingAction(null)
    setFeeCalc(null)
  }

  // stacking function

  const handleStack = async (stakingContractId: number, _id: string) => {
    if (isStakingRef.current) return
    isStakingRef.current = true

    if (!stackValue) {
      toast.error('Please enter a valid amount');
      isStakingRef.current = false
      return;
    }

    try {
      await ensureAuth();
      const adjustedStackValue = stackValue * 1000000;
      const pool = stacks.find(s => s._id === _id);
      const stakeTokenId = pool?.stakeTokenId ?? FRY_ASSET_ID;
      const tokenName = pool?.stakeTokenName || 'tokens';
      await showFeeConfirmation('stakingDeposit', adjustedStackValue, stakeTokenId, 6, tokenName, `Stake ${stackValue} ${tokenName}`, {
        type: 'stake', args: { stakingContractId, _id, adjustedStackValue, contractVersion: pool?.contractVersion }
      })
    } catch (error: any) {
      toast.error(error?.message || 'Error preparing stake');
      isStakingRef.current = false
    } finally {
      setIsStaking(false); // ✅ Done loading
      isStakingRef.current = false
    }
  };

  const handleWithdraw = async (stakingContractId: number, _id: string) => {
    if (!withdrawValue || withdrawValue <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const poolData = stacks.find((item) => item._id === _id);
    if (!poolData) {
      toast.error('Pool data not found');
      return;
    }

    const userStakedAmount = userStakes[String(poolData.key)] || 0;

    if (withdrawValue > userStakedAmount) {
      toast.error(`Withdraw amount exceeds staked amount (${userStakedAmount} fry_token)`);
      return;
    }

    try {
      await ensureAuth();
      const adjustedWithdrawValue = withdrawValue * 1_000_000;
      const stakeTokenId = poolData.stakeTokenId ?? FRY_ASSET_ID;
      const tokenName = poolData.stakeTokenName || 'tokens';
      await showFeeConfirmation('stakingWithdraw', adjustedWithdrawValue, stakeTokenId, 6, tokenName, `Withdraw ${withdrawValue} ${tokenName}`, {
        type: 'withdraw', args: { stakingContractId, _id, adjustedWithdrawValue, contractVersion: poolData.contractVersion }
      })
    } catch (error: any) {
      toast.error(error?.message || 'Error preparing withdrawal');
      setIsWithdrawing(false);
    }
  };

  const executeWithdraw = async (args: any) => {
    setIsWithdrawing(true);
    try {
      const withdrawResult = await unstakeTokens(args.stakingContractId, args.adjustedWithdrawValue, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient, chainAlgodConfig, args.contractVersion);

      if (withdrawResult instanceof Error) {
        toast.error(`Transaction failed: ${withdrawResult.message}`);
        return;
      }
      if (!withdrawResult) {
        toast.error('Withdrawal failed due to invalid response');
        return;
      }
      const { tx: withdrawToken, feeTxId: withdrawFeeTxId, feeTokenId: withdrawFeeTokenId } = withdrawResult as any;

      // Backend updates — retry up to 3x after successful on-chain unstake
      try {
        await withRetry(async () => {
          await ensureAuth();
          const getStakingRecord = await getStakingData(args.stakingContractId, activeAddress!, signer, chainAlgodConfig, args.contractVersion) as StakingRecord;
          const StakerData = await getUserData(args.stakingContractId, activeAddress!, getChainAlgodClient());

          const { stakeTime } = StakerData;
          const calculateAPR = getStakingRecord.apr / 100;

          await authAxios.put(`/staking/update/${args._id}`, {
            totalAmountStaked: Number(getStakingRecord.totalStaked ?? 0) / 1_000_000,
            totalStakers: 1,
            stakingTime: stakeTime,
          });
          await authAxios.post('/withdraw/add', {
            tokens: Number(withdrawValue),
            wallet: activeAddress,
            poolId: args._id,
            appId: Number(args.stakingContractId),
            feeTxId: withdrawFeeTxId,
            feeAssetId: withdrawFeeTokenId,
          });
        });
      } catch (backendErr) {
        console.warn('Backend update failed after successful withdraw (retries exhausted):', backendErr);
      }

      // Always show success since on-chain unstake succeeded
      await new Promise(r => setTimeout(r, 500));
      await fetchData();
      fetchBalance();
      const pool = stacks.find(s => s._id === args._id)
      if (pool?.stakeTokenId && pool?.key) fetchTokenBalance(pool.key, pool.stakeTokenId)
      toast.success('Withdrawal successful');
      setWithdrawValue(0);
    } catch (error: any) {
      if (error?.message?.includes('Network mismatch')) {
        toast.error('Network mismatch: Please switch wallet to correct network.');
      } else {
        console.error('Error during withdrawal:', error);
        const msg = error?.response?.data?.message || error?.message || 'Error during withdrawal.';
        toast.error(msg);
      }
    } finally {
      setIsWithdrawing(false);
    }
  };



  // claim function

  const handleClaim = async (stakingContractId: number, _id: string) => {
    try {
      await ensureAuth();
      setIsClaimingId(_id);
      const poolData = stacks.find(s => s._id === _id);
      const rewardTokenId = poolData?.rewardTokenId ?? FRY_ASSET_ID;
      const rewardTokenName = poolData?.rewardTokenName || 'tokens';

      if (usesBackendClaim(stakingContractId)) {
        // Backend claim: get status from API
        const status = await getClaimStatus(Number(stakingContractId), activeAddress!);
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
          `Claim rewards`, { type: 'claim', args: { stakingContractId, _id, useBackend: true, contractVersion: poolData?.contractVersion } });
      } else {
        // On-chain claim: existing flow
        const est = await estimateStakingReward(stakingContractId, activeAddress!, signer, chainAlgodConfig, poolData?.contractVersion);
        const rewardMicro = est.reward > 0 ? est.reward : 1_000_000;
        await showFeeConfirmation('stakingClaim', rewardMicro, est.rewardTokenId || rewardTokenId, 6, rewardTokenName,
          `Claim rewards`, { type: 'claim', args: { stakingContractId, _id, useBackend: false, contractVersion: poolData?.contractVersion } });
      }
    } catch (error: any) {
      console.error('Error during claim:', error);
      const msg = error?.response?.data?.message || error?.message || 'Error during claim.';
      toast.error(msg);
      setIsClaimingId(null);
    }
  };

  const executeClaim = async (args: any) => {
    try {
      if (args.useBackend) {
        // Backend claim: treasury sends rewards directly
        const result = await claimReward(Number(args.stakingContractId), activeAddress!);
        if (!result.success) {
          toast.error(result.message || 'Claim failed');
          return;
        }
        toast.success(`Claimed ${result.amountDisplay.toFixed(2)} FRY`);
        // Log to existing backend endpoints for consistency
        await authAxios.post('/claimreward/add', {
          walletId: activeAddress,
          poolId: args._id,
          rewardClaimed: result.amountDisplay,
          feeTxId: result.txId,
          feeAssetId: result.rewardToken,
        }, { headers: { 'Content-Type': 'application/json' } }).catch(() => {});
        setClaimedPools((prev) => [...prev, args._id]);
        await new Promise(r => setTimeout(r, 500));
        await fetchData();
        fetchBalance();
      } else {
        // On-chain claim: existing contract flow
        const claimToken = await claimTokens(args.stakingContractId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient, chainAlgodConfig, args.contractVersion);
        if (claimToken.error) {
          toast.error('Claim failed. Please try again.');
          return;
        }
        const { rewardClaimed, stakedAmount, stakedTime, feeTxId: claimFeeTxId, feeTokenId: claimFeeTokenId } = claimToken;
        await authAxios.post('/stakerData/add', {
          walletId: activeAddress, stakedAmount, stakeTime: stakedTime,
          poolId: args._id, rewardClaimed, feeTxId: claimFeeTxId, feeAssetId: claimFeeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });
        await authAxios.post('/claimreward/add', {
          walletId: activeAddress, stakedAmount, stakedTime,
          poolId: args._id, rewardClaimed, feeTxId: claimFeeTxId, feeAssetId: claimFeeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });
        toast.success('Rewards claimed successfully');
        setClaimedPools((prev) => [...prev, args._id]);
        await new Promise(r => setTimeout(r, 500));
        await fetchData();
        fetchBalance();
      }
    } catch (error: any) {
      console.error('Error during claim:', error);
      const msg = error?.response?.data?.message || error?.message || 'Error during claim.';
      toast.error(msg);
    } finally {
      setIsClaimingId(null);
    }
  };

  const handleClaimAndWithdraw = async (stakingContractId: number, _id: string) => {
    try {
      await ensureAuth();
      setIsClaimingId(_id);
      const poolData = stacks.find(s => s._id === _id);
      const rewardTokenId = poolData?.rewardTokenId ?? FRY_ASSET_ID;
      const rewardTokenName = poolData?.rewardTokenName || 'tokens';
      const useBackend = usesBackendClaim(stakingContractId);

      if (useBackend) {
        const status = await getClaimStatus(Number(stakingContractId), activeAddress!);
        const rewardMicro = status.pendingReward > 0 ? status.pendingReward : 0;
        await showFeeConfirmation('stakingClaim', rewardMicro, status.rewardToken || rewardTokenId, 6, rewardTokenName,
          'Claim & Withdraw', { type: 'claimAndWithdraw', args: { stakingContractId, _id, useBackend: true, contractVersion: poolData?.contractVersion } });
      } else {
        const est = await estimateStakingReward(stakingContractId, activeAddress!, signer, chainAlgodConfig, poolData?.contractVersion);
        const rewardMicro = est.reward > 0 ? est.reward : 1_000_000;
        await showFeeConfirmation('stakingClaim', rewardMicro, est.rewardTokenId || rewardTokenId, 6, rewardTokenName,
          'Claim & Withdraw', { type: 'claimAndWithdraw', args: { stakingContractId, _id, useBackend: false, contractVersion: poolData?.contractVersion } });
      }
    } catch (error: any) {
      console.error('Error during claim & withdraw:', error);
      toast.error(error?.message || 'Error during claim & withdraw');
      setIsClaimingId(null);
    }
  };

  const executeClaimAndWithdraw = async (args: any) => {
    try {
      let rewardClaimed = 0;
      let stakedAmount = 0;

      // Step 1: Claim rewards
      if (args.useBackend) {
        // Backend claim: treasury sends rewards
        const result = await claimReward(Number(args.stakingContractId), activeAddress!);
        if (!result.success) {
          toast.error(result.message || 'Claim failed. Withdrawal not attempted.');
          return;
        }
        rewardClaimed = result.amountDisplay;
        await authAxios.post('/claimreward/add', {
          walletId: activeAddress, poolId: args._id, rewardClaimed,
          feeTxId: result.txId, feeAssetId: result.rewardToken,
        }, { headers: { 'Content-Type': 'application/json' } }).catch(() => {});
        // Read staked amount from on-chain for unstake
        try {
          const userData = await getUserData(Number(args.stakingContractId), activeAddress!, getChainAlgodClient());
          stakedAmount = Number(userData.stakedAmount);
        } catch { stakedAmount = 0; }
      } else {
        // On-chain claim: existing contract flow
        const claimResult = await claimTokens(args.stakingContractId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient, chainAlgodConfig, args.contractVersion);
        if (claimResult.error) {
          toast.error('Claim failed. Withdrawal not attempted.');
          return;
        }
        rewardClaimed = claimResult.rewardClaimed || 0;
        stakedAmount = claimResult.stakedAmount || 0;
        const stakedTime = claimResult.stakedTime || 0;
        const { feeTxId: cwClaimFeeTxId, feeTokenId: cwClaimFeeTokenId } = claimResult;
        await authAxios.post('/stakerData/add', {
          walletId: activeAddress, stakedAmount, stakeTime: stakedTime,
          poolId: args._id, rewardClaimed, feeTxId: cwClaimFeeTxId, feeAssetId: cwClaimFeeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });
        await authAxios.post('/claimreward/add', {
          walletId: activeAddress, stakedAmount, stakedTime,
          poolId: args._id, rewardClaimed, feeTxId: cwClaimFeeTxId, feeAssetId: cwClaimFeeTokenId,
        }, { headers: { 'Content-Type': 'application/json' } });
      }

      // Step 2: Withdraw full staked amount (if any)
      if (stakedAmount > 0) {
        const config = await fetchFeeConfig();
        const pool = stacks.find(s => s._id === args._id);
        const stakeTokenId = pool?.stakeTokenId ?? FRY_ASSET_ID;
        const withdrawFee = calculateFeeSimple('stakingWithdraw', stakedAmount, config, activeChain.feeRecipient);

        // Flat VOI fee fallback for compound withdraw
        let cwFeeAmount = withdrawFee.feeAmount
        let cwFeeTokenId = stakeTokenId
        if (chainId === 'voi-mainnet' && activeChain.flatFeeNative) {
          await loadMarketData()
          if (!findPool(stakeTokenId, 0) && !findPool(stakeTokenId, 395614)) {
            cwFeeAmount = activeChain.flatFeeNative.unstake
            cwFeeTokenId = 0
          }
        }

        const cwWithdrawResult = await unstakeTokens(
          args.stakingContractId, stakedAmount, activeAddress!, signer,
          cwFeeAmount, cwFeeTokenId, withdrawFee.feeRecipient, chainAlgodConfig, args.contractVersion
        );

        if (cwWithdrawResult instanceof Error) {
          toast.warning('Rewards claimed but withdrawal failed: ' + cwWithdrawResult.message);
        } else {
          const { feeTxId: cwWithdrawFeeTxId, feeTokenId: cwWithdrawFeeTokenId } = cwWithdrawResult as any;
          await authAxios.post('/withdraw/add', {
            tokens: stakedAmount / 1_000_000, wallet: activeAddress,
            poolId: args._id, appId: Number(args.stakingContractId),
            feeTxId: cwWithdrawFeeTxId, feeAssetId: cwWithdrawFeeTokenId,
          });
          toast.success('Rewards claimed and tokens withdrawn!');
        }
      } else {
        toast.success('Rewards claimed (no tokens to withdraw).');
      }

      setClaimedPools(prev => [...prev, args._id]);
      await new Promise(r => setTimeout(r, 500));
      await fetchData();
      fetchBalance();
    } catch (error: any) {
      console.error('Error during claim & withdraw:', error);
      toast.error(error?.message || 'Error during claim & withdraw');
    } finally {
      setIsClaimingId(null);
    }
  };

  const handleMigrate = async (record: DataType) => {
    if (!activeAddress || !signer) {
      toast.error('Wallet not connected.')
      return
    }

    const k = String(record.key)
    const userStaked = userStakes[k]
    if (!userStaked || userStaked <= 0) {
      toast.error('No staked tokens to migrate.')
      return
    }

    // Find matching V2 pool (same stake + reward token pair) — search all pools, not just filtered tab
    const v2SearchPools = allPools || stacks
    const v2Pool = v2SearchPools.find(p =>
      p.contractVersion >= 2 &&
      p.stakeTokenId === record.stakeTokenId &&
      p.rewardTokenId === record.rewardTokenId
    )
    if (!v2Pool) {
      toast.error('No matching V2 pool found yet.')
      return
    }

    try {
      await ensureAuth()
      setIsMigrating(record._id)

      const stakedMicro = Math.round(userStaked * 1_000_000)

      // Step 1: Unstake from V1 (with zero fee for migration)
      toast.info('Step 1/2: Unstaking from legacy pool...')
      const migrateUnstakeResult = await unstakeTokens(
        record.stakingContractId, stakedMicro, activeAddress, signer,
        0, record.stakeTokenId, '', chainAlgodConfig
      )

      if (migrateUnstakeResult instanceof Error) {
        toast.error('Unstake failed: ' + migrateUnstakeResult.message)
        return
      }
      const { feeTxId: migrateUnstakeFeeTxId, feeTokenId: migrateUnstakeFeeTokenId } = migrateUnstakeResult as any;

      // Step 2: Stake into V2 (with zero fee for migration)
      toast.info('Step 2/2: Staking into V2 pool...')
      const migrateStakeResult = await stakeTokens(
        v2Pool.stakingContractId, stakedMicro, activeAddress, signer,
        0, record.stakeTokenId, '', chainAlgodConfig, v2Pool.contractVersion
      )

      if (migrateStakeResult instanceof Error) {
        toast.warning('Unstake succeeded but V2 stake failed. Your tokens are in your wallet — please stake manually.')
        return
      }
      const { feeTxId: migrateStakeFeeTxId, feeTokenId: migrateStakeFeeTokenId } = migrateStakeResult as any;

      // Backend updates — best-effort after successful on-chain migration
      try {
        const getStakingRecord = await getStakingData(v2Pool.stakingContractId, activeAddress, signer, chainAlgodConfig) as StakingRecord
        const stakerData = await getUserData(v2Pool.stakingContractId, activeAddress, getChainAlgodClient())

        await authAxios.post('/stakingtoken/add', {
          apr: getStakingRecord.apr,
          lockPeriod: getStakingRecord.lockPeriod,
          poolStartTime: getStakingRecord.poolStartTime,
          poolEndTime: getStakingRecord.poolEndTime,
          poolTime: getStakingRecord.poolTime || (getStakingRecord.poolEndTime - getStakingRecord.poolStartTime),
          rewardToken: Number(getStakingRecord.rewardToken ?? FRY_ASSET_ID),
          stakeTokens: Number(getStakingRecord.stakeToken ?? FRY_ASSET_ID),
          totalStaked: stakedMicro,
          poolId: v2Pool._id,
          appId: Number(v2Pool.stakingContractId),
          wallet: activeAddress,
          feeTxId: migrateStakeFeeTxId,
          feeAssetId: migrateStakeFeeTokenId,
        })

        await authAxios.put(`/staking/update/${v2Pool._id}`, {
          totalAmountStaked: Number(getStakingRecord.totalStaked ?? 0) / 1_000_000,
          totalStakers: 1,
          stakingTime: stakerData.stakeTime,
        })
      } catch (backendErr) {
        console.warn('Backend update failed after successful migration:', backendErr)
      }

      toast.success('Migration complete! Your tokens are now in the V2 pool.')
      await new Promise(r => setTimeout(r, 500))
      await fetchData()
    } catch (error: any) {
      console.error('Migration error:', error)
      const msg = error?.message || ''
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User rejected') || msg.includes('4001')) {
        toast.error('Transaction cancelled by wallet.')
      } else if (msg.includes('4100') || msg.includes('pending')) {
        toast.error('You have a pending transaction in your wallet. Please approve or reject it first.')
      } else if (msg.includes('Network') || msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
        toast.error('Network error. Please check your connection and try again.')
      } else {
        toast.error('Migration failed: ' + (msg || 'Unknown error'))
      }
    } finally {
      setIsMigrating(null)
    }
  }

  // Function to handle the "View details" click
  // Function to handle the "View details" click
  const handleViewDetailsClick = (record: DataType) => {
    // Extract the plain data from React elements

    console.log('pooldate', record)

    // Set the pool data in context
    setPoolData(record)

    // Navigate to the pool stats page
    navigate('/stake-pool-stats')
  }

  return (
    <>
    <div className="w-full overflow-x-auto">
    <Table<DataType>
      className="web-table"
      columns={columns}
      pagination={false}
      expandable={
        showExpandable !== 'All'
          ? {
            // {
            expandedRowRender: (record) => (
              <div className="expandable">
                {(!record.contractVersion || record.contractVersion === 1) && (
                  <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-3 mb-3 w-full">
                    <p className="text-red-400 font-medium text-sm">V1 Contract Bug Warning</p>
                    <p className="text-xs text-red-500/70">
                      Claiming rewards on this legacy pool will reset your stake timer and yield 0 rewards.
                      Use Withdraw only, or migrate to V2.
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">

                  {/* Left */}
                  <div className="flex flex-col gap-[4px]">
                    <Button
                      text={`Get ${record.stakeTokenName || 'Token'}`}
                      className="button btn-red-border"
                      height={45}
                      width={156}
                      onClick={() => window.open(
                        `https://app.tinyman.org/swap?asset_in=0&asset_out=${record.stakeTokenId}`,
                        '_blank'
                      )}
                    />
                    <a
                      href={`https://explorer.perawallet.app/application/${record.stakingContractId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline mt-1"
                    >
                      View Contract ↗
                    </a>
                    {(() => {
                      const k = String(record.key)
                      const stakeTime = userStakeTimes[k]
                      const lockSecs = record.lockPeriod || 0
                      if (stakeTime && lockSecs > 0) {
                        const unlockTime = stakeTime + lockSecs
                        const now = Math.floor(Date.now() / 1000)
                        if (now < unlockTime) {
                          const daysLeft = Math.ceil((unlockTime - now) / 86400)
                          return (
                            <p className="text-xs text-yellow-500 mt-1">
                              🔒 Unlocks in {daysLeft} {daysLeft === 1 ? 'day' : 'days'} ({new Date(unlockTime * 1000).toLocaleDateString()})
                            </p>
                          )
                        } else if (userStakes[k] > 0) {
                          return <p className="text-xs text-green mt-1">🔓 Unlocked — ready to withdraw</p>
                        }
                      }
                      return null
                    })()}
                    {/* Migrate button for V1 pools */}
                    {(!record.contractVersion || record.contractVersion === 1) && activeAddress && (() => {
                      const k = String(record.key)
                      const userStaked = userStakes[k] || 0
                      const stakeTime = userStakeTimes[k]
                      const lockSecs = record.lockPeriod || 0
                      const now = Math.floor(Date.now() / 1000)
                      const isLocked = stakeTime && lockSecs > 0 && (stakeTime + lockSecs) > now
                      const v2SearchPools = allPools || stacks
                      const hasV2 = v2SearchPools.some(p => p.contractVersion >= 2 && p.stakeTokenId === record.stakeTokenId && p.rewardTokenId === record.rewardTokenId)

                      if (userStaked <= 0) return null

                      return (
                        <div className="mt-2">
                          {isLocked ? (
                            <>
                              <Button
                                text="Migrate to V2"
                                className="button btn-primary"
                                height={36}
                                width={140}
                                disabled={true}
                              />
                              <p className="text-xs text-yellow-500 mt-1">
                                Unlocks {new Date((stakeTime + lockSecs) * 1000).toLocaleDateString()}
                              </p>
                            </>
                          ) : !hasV2 ? (
                            <p className="text-xs text-gray-500">V2 pool coming soon</p>
                          ) : (
                            <>
                              <Button
                                text={isMigrating === record._id ? 'Migrating...' : 'Migrate to V2'}
                                className="button btn-primary"
                                height={36}
                                width={140}
                                onClick={() => handleMigrate(record)}
                                disabled={!!isMigrating}
                              />
                              <p className="text-[10px] text-green-400 mt-1">Fee waived for migration!</p>
                            </>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  {/* Right */}
                  {/* stake */}{/* withdraw */}
                  <div className="flex gap-[24px] w-full justify-end">
                    {
                      (showExpandable === 'Live' || showExpandable === 'MyLive' || showExpandable === 'Ended' || showExpandable === 'MyEnded') &&
                      <div className="flex gap-[10px]">
                        {(!record.contractVersion || record.contractVersion === 1) ? (
                          <div className="flex flex-col items-center">
                            <Button
                              text="Stake"
                              className="button btn-primary"
                              height={45}
                              width={106}
                              disabled={true}
                            />
                            <p className="text-[10px] text-yellow-500 mt-1">Deposits disabled — use V2</p>
                          </div>
                        ) : (
                          <Button
                            text="Stake"
                            className="button btn-primary"
                            height={45}
                            width={106}
                            onClick={() => {
                              setModalTarget({
                                appId: record.stakingContractId,
                                stakeTokenId: record.stakeTokenId ?? FRY_ASSET_ID,
                                stakeTokenName: record.stakeTokenName || 'tokens',
                                userStake: userStakes[String(record.key)] || 0,
                                contractVersion: record.contractVersion,
                              })
                              setStakeModalOpen(true)
                            }}
                          />
                        )}
                        <Button
                          text={withdrawLoading[String(record.key)] ? 'Loading...' : 'Withdraw'}
                          className="button btn-primary"
                          height={45}
                          width={106}
                          disabled={withdrawLoading[String(record.key)]}
                          onClick={async () => {
                            const k = String(record.key)
                            let stake = userStakes[k] || 0

                            // If stake is 0, fetch on-chain (handles race condition + V1 pools)
                            if (stake === 0 && activeAddress && record.stakingContractId) {
                              setWithdrawLoading(prev => ({ ...prev, [k]: true }))
                              try {
                                const data = await getUserData(record.stakingContractId, activeAddress, getChainAlgodClient())
                                stake = Number(data.stakedAmount || 0) / 1_000_000
                                setUserStakes(prev => ({ ...prev, [k]: stake }))
                              } catch {
                                // On-chain failed — try backend as last resort
                                try {
                                  const res = await axios.get(`${api_base_url}/stakingtoken/wallet/${activeAddress}`)
                                  const match = (res.data?.data || []).find((r: any) =>
                                    r.appId === record.stakingContractId || r.poolId === record._id
                                  )
                                  if (match?.totalStaked > 0) stake = match.totalStaked / 1_000_000
                                } catch { /* ignore */ }
                              } finally {
                                setWithdrawLoading(prev => ({ ...prev, [k]: false }))
                              }
                            }

                            setModalTarget({
                              appId: record.stakingContractId,
                              stakeTokenId: record.stakeTokenId ?? FRY_ASSET_ID,
                              stakeTokenName: record.stakeTokenName || 'tokens',
                              userStake: stake,
                              rewardTokenId: record.rewardTokenId ?? FRY_ASSET_ID,
                            })
                            setWithdrawModalOpen(true)
                          }}
                        />
                      </div>
                    }
                    {/* Claim & Withdraw */}

                    <div className="flex gap-[10px]">
                      {activeAddress && (
                        (!record.contractVersion || record.contractVersion === 1) ? (
                          <div className="flex flex-col items-center">
                            <Button
                              text="Claim"
                              className="button btn-primary"
                              height={45}
                              width={106}
                              disabled={true}
                            />
                            <p className="text-[10px] text-red-500 mt-1">Claim disabled — use Withdraw</p>
                          </div>
                        ) : (() => {
                          const k = String(record.key)
                          const _stakeTime = userStakeTimes[k]
                          const _lockSecs = record.lockPeriod || 0
                          const _now = Math.floor(Date.now() / 1000)
                          const _isLocked = _stakeTime && _lockSecs > 0 && (_stakeTime + _lockSecs) > _now
                          return _isLocked ? (
                            <div className="flex flex-col items-center">
                              <Button
                                text="Claim"
                                className="button btn-primary"
                                height={45}
                                width={106}
                                disabled={true}
                              />
                              <p className="text-[10px] text-yellow-500 mt-1">
                                Locked until {new Date((_stakeTime + _lockSecs) * 1000).toLocaleDateString()}
                              </p>
                            </div>
                          ) : (
                            <Button
                              text={isClaimingId === record._id ? 'Claiming...' : 'Claim'}
                              className="button btn-primary"
                              height={45}
                              width={106}
                              onClick={() => handleClaim(record.stakingContractId, record._id)}
                              disabled={
                                !!isClaimingId ||
                                rewardLoading[k] ||
                                (estimatedRewards[k] !== undefined && estimatedRewards[k] <= 0) ||
                                (userStakes[k] !== undefined && userStakes[k] <= 0)
                              }
                              loading={isClaimingId === record._id}
                            />
                          )
                        })()
                      )}
                      {
                        (showExpandable === 'Ended' || showExpandable === 'MyEnded') &&
                        activeAddress && (
                          isClaimingId === record._id ? (
                            <p className="text-blue-500 font-medium mt-2">Processing...</p>
                          ) : claimedPools.includes(record._id) ? (
                            <p className="text-green font-semibold mt-2">✅ Rewards Claimed</p>
                          ) : (
                            (!record.contractVersion || record.contractVersion === 1) ? (
                              <div className="flex flex-col items-center">
                                <Button
                                  text="Claim & Withdraw"
                                  className="button btn-primary"
                                  height={45}
                                  width={156}
                                  disabled={true}
                                />
                                <p className="text-[10px] text-red-500 mt-1">Claim disabled — use Withdraw</p>
                              </div>
                            ) : (
                              <Button
                                text={rewardLoading[String(record.key)] ? "Checking..." : "Claim & Withdraw"}
                                data-id="claim"
                                onClick={() => {
                                  setIsClaimingId(record._id)
                                  handleClaimAndWithdraw(record.stakingContractId, record._id).finally(() => setIsClaimingId(null))
                                }}
                                className="button btn-primary"
                                height={45}
                                width={156}
                                disabled={
                                  !!isClaimingId ||
                                  rewardLoading[String(record.key)] ||
                                  (estimatedRewards[String(record.key)] !== undefined && estimatedRewards[String(record.key)] <= 0)
                                }
                              />
                            )
                          )
                        )
                      }

                      {/* <Button text="Compound" className="button btn-red-border" height={45} width={106} /> */}
                      <Button
                        text="View details"
                        data-id="compound"
                        className="button btn-red-border"
                        height={45}
                        width={128}
                        onClick={() => navigate(`/stake-pool-stats?appId=${record.stakingContractId}`)}
                      />
                      <Button
                        text="AI Analysis"
                        className="button btn-red-border"
                        height={45}
                        width={128}
                        img="mdi:sparkles"
                        onClick={() => { setAiPoolTarget(record); setAiModalOpen(true) }}
                      />
                      {isAdmin && (showExpandable === 'Ended' || showExpandable === 'MyEnded') && (
                        <Button
                          text="Top Up Rewards"
                          className="button btn-red-border"
                          height={45}
                          width={156}
                          onClick={async () => {
                            try {
                              await ensureAuth()
                              const rewardTokenId = record.rewardTokenId ?? FRY_ASSET_ID
                              const info = await getPoolRewardDeficit(record.stakingContractId, rewardTokenId, signer, activeAddress!, chainAlgodConfig, record.contractVersion, record.rewardToken?.decimals)
                              const message = [
                                `Pool Reward Status:`,
                                `  Configured: ${info.totalConfigured.toLocaleString()} tokens`,
                                `  Claimed: ${info.totalDistributed.toLocaleString()} tokens`,
                                `  Unclaimed (owed): ${info.unclaimed.toLocaleString()} tokens`,
                                `  Contract balance: ${info.currentBalance.toLocaleString()} tokens`,
                                `  Deficit: ${info.deficit.toLocaleString()} tokens`,
                                ``,
                                `Enter amount to top up (e.g. 1000):`,
                                info.deficit > 0 ? `Suggested: ${Math.ceil(info.deficit)}` : `No deficit detected.`
                              ].join('\n')
                              const input = window.prompt(message, info.deficit > 0 ? String(Math.ceil(info.deficit)) : '')
                              if (!input) return
                              const humanAmount = parseFloat(input)
                              if (isNaN(humanAmount) || humanAmount <= 0) { toast.error('Invalid amount'); return }
                              const microAmount = Math.floor(humanAmount * Math.pow(10, info.decimals))
                              await topUpRewards(record.stakingContractId, rewardTokenId, microAmount, activeAddress!, signer, record.contractVersion)
                              await authAxios.post('/staking/admin/topup', { poolId: record._id, amount: microAmount })
                              toast.success(`Topped up ${humanAmount} reward tokens`)
                              await fetchData()
                            } catch (err: any) {
                              console.error('Top up failed:', err)
                              toast.error(err?.message || 'Top up failed')
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ),
            rowExpandable: () => true,
            expandedRowKeys: expandedKeys,
          }
          : undefined
      }
      expandIconColumnIndex={-1}
      dataSource={stacks}
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
          key={`stake-${modalTarget.appId}`}
          visible={stakeModalOpen}
          onClose={() => { setStakeModalOpen(false); setModalTarget(null) }}
          onSuccess={async () => { setStakeModalOpen(false); setModalTarget(null); await fetchData(); fetchBalance() }}
          appId={modalTarget.appId}
          stakeTokenId={modalTarget.stakeTokenId}
          stakeTokenName={modalTarget.stakeTokenName}
          isLpFarm={false}
          contractVersion={modalTarget.contractVersion}
        />
        <WithdrawModal
          key={`withdraw-${modalTarget.appId}`}
          visible={withdrawModalOpen}
          onClose={() => { setWithdrawModalOpen(false); setModalTarget(null) }}
          onSuccess={async () => { setWithdrawModalOpen(false); setModalTarget(null); await fetchData(); fetchBalance() }}
          appId={modalTarget.appId}
          stakeTokenId={modalTarget.stakeTokenId}
          stakeTokenName={modalTarget.stakeTokenName}
          userStake={modalTarget.userStake}
          isLpFarm={false}
          rewardTokenId={modalTarget.rewardTokenId}
          contractVersion={modalTarget.contractVersion}
        />
      </>
    )}
    <AiAnalysisModal
      isOpen={aiModalOpen}
      onClose={() => { setAiModalOpen(false); setAiPoolTarget(null) }}
      type="pool"
      poolId={aiPoolTarget?._id}
      poolName={aiPoolTarget?.stakeTokenName || 'Pool'}
    />
    </>
  )
})

export default STable
