import { Icon } from '@iconify/react' // Import Iconify
import { useWallet } from '@txnlab/use-wallet'
import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import axios from 'axios'
import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { usePoolData } from '../../../context/PoolDataContext'
import { claimTokens, getStakingData, getUserData, stakeTokens, unstakeTokens, getAlgodClient, estimateStakingReward } from '../../../staking_func'
import { getAlgodConfigFromViteEnvironment } from '../../../utils/network/getAlgoClientConfigs'
import Button from '../../shared/button'
import Input from '../../shared/input'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import { authAxios } from '../../../services/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import { fetchFeeConfig, calculateFeeSimple } from '../../../services/FeeService'
import type { FeeCalculation } from '../../../services/FeeService'
import FeeConfirmation from '../../shared/FeeConfirmation'

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
}

interface STableProps {
  stacks: DataType[]
  fetchData: () => Promise<void>
  showExpandable: string
}

const FRY_ASSET_ID = Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946;

// Define the columns for the table
// const STable: React.FC<STableProps> = memo(({ stacks, fetchData }) => {
const STable: React.FC<STableProps> = memo(({ stacks, fetchData, showExpandable }) => {
  const { ensureAuth } = useAuth();

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

  // Fee confirmation state
  const [feeModalVisible, setFeeModalVisible] = useState(false)
  const [feeCalc, setFeeCalc] = useState<FeeCalculation | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ type: string; args: any } | null>(null)
  const [feeActionLabel, setFeeActionLabel] = useState('')
  const [feeAmountFormatted, setFeeAmountFormatted] = useState('')
  const [netAmountFormatted, setNetAmountFormatted] = useState('')

  const navigate = useNavigate()

  const algoConfig = getAlgodConfigFromViteEnvironment()
  const networkName = useMemo(() => {
    return algoConfig.network === '' ? 'localnet' : algoConfig.network.toLocaleLowerCase()
  }, [algoConfig.network])
  const { setPoolData } = usePoolData() // Get the function to set poolData from context

  const { providers, clients, activeAccount, activeAddress, signer } = useWallet()
  const handleToggleExpand = (key: React.Key, stakeTokenId?: number) => {
    const isExpanding = !expandedKeys.includes(key)
    setExpandedKeys(
      (prev) => (prev.includes(key) ? prev.filter((rowKey) => rowKey !== key) : [key]), // Allow only one row to expand at a time
    )
    if (isExpanding && stakeTokenId) {
      fetchTokenBalance(key, stakeTokenId)
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
    if (!activeAddress || !clients) {
      setFryBalance(0)
      return
    }

    try {
      const provider = clients?.pera || clients?.myalgo || clients?.defly
      if (!provider) {
        return
      }

      const accountInfo = await provider.getAccountInfo(activeAddress)

      if (!accountInfo || !accountInfo.assets) {
        setFryBalance(0)
        return
      }

      const fryToken = accountInfo.assets.find((asset: any) => asset['asset-id'] === FRY_ASSET_ID || asset.id === FRY_ASSET_ID)

      if (!fryToken) {
        setFryBalance(0)
        return
      }

      const normalFryBalance = fryToken.amount / 1_000_000
      setFryBalance(normalFryBalance)
    } catch (error) {
      console.error('Error fetching balance:', error)
      setFryBalance(0)
    }
  }

  const fetchTokenBalance = async (key: React.Key, stakeTokenId: number) => {
    if (!activeAddress || !stakeTokenId) return
    try {
      const algod = await getAlgodClient()
      const assetInfo = await algod.accountAssetInformation(activeAddress, stakeTokenId).do()
      const balance = Number(assetInfo?.['asset-holding']?.amount ?? 0)
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
      title: (
        <div className="flex items-center gap-[2px]">
          TVL
          <Icon icon="solar:arrow-down-outline" width={18} height={21} color="var(--text-primary)" />
        </div>
      ),
      dataIndex: 'tvl',
      key: 'tvl',
      render: (value) => <p className="text-text_clr font-medium medium">{value}</p>,
    },
    { title: 'APR', dataIndex: 'apr', key: 'apr', render: (value) => <p className="text-text_clr font-medium medium">{value}</p> },
    { title: 'STAKED', dataIndex: 'staked', key: 'staked', render: (value) => <p className="text-text_clr font-medium medium">{value}</p> },
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
    setIsStaking(false)
    setIsWithdrawing(false)
    isStakingRef.current = false
  }

  const executePendingAction = async () => {
    if (!pendingAction || !feeCalc) return
    setFeeModalVisible(false)
    const { type, args } = pendingAction

    if (type === 'stake') {
      setIsStaking(true)
      try {
        const StackToken = await stakeTokens(args.stakingContractId, args.adjustedStackValue, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient);
        if (StackToken instanceof Error) {
          toast.error('Transaction canceled or staking failed.');
          return;
        }
        if (!activeAddress) {
          toast.error('No active address found for staking.');
          return;
        }
        const getStakingRecord = await getStakingData(args.stakingContractId, activeAddress, signer) as StakingRecord;
        const StakerData = await getUserData(args.stakingContractId, activeAddress);
        const stakingTokenPayload = {
          apr: getStakingRecord.apr,
          lockPeriod: getStakingRecord.lockPeriod,
          poolStartTime: getStakingRecord.poolStartTime,
          poolEndTime: getStakingRecord.poolEndTime,
          poolTime: getStakingRecord.poolTime || (getStakingRecord.poolEndTime - getStakingRecord.poolStartTime),
          rewardToken: Number(getStakingRecord.rewardToken || FRY_ASSET_ID),
          stakeTokens: Number(getStakingRecord.stakeToken || FRY_ASSET_ID),
          totalStaked: args.adjustedStackValue,
          poolId: args._id,
          appId: Number(args.stakingContractId),
          wallet: activeAddress
        };
        await authAxios.post('/stakingtoken/add', stakingTokenPayload);
        const { stakedAmount, stakeTime } = StakerData;
        const apr_response = await authAxios.put(`/staking/update/${args._id}`, {
          aprRate: getStakingRecord.apr / 100,
          totalAmountStaked: Number(stakedAmount) / 1_000_000,
          totalStakers: 1,
          stakingTime: stakeTime,
        });
        if (apr_response.status >= 200 && apr_response.status < 300) {
          await new Promise(r => setTimeout(r, 500));
          await fetchData();
          fetchBalance();
          const pool = stacks.find(s => s._id === args._id)
          if (pool?.stakeTokenId && pool?.key) fetchTokenBalance(pool.key, pool.stakeTokenId)
          toast.success('Staking successful!');
          setStackValue(0);
        } else {
          toast.error('Failed to update staking data.');
        }
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
      const stakeTokenId = pool?.stakeTokenId || FRY_ASSET_ID;
      const tokenName = pool?.stakeTokenName || 'tokens';
      await showFeeConfirmation('stakingDeposit', adjustedStackValue, stakeTokenId, 6, tokenName, `Stake ${stackValue} ${tokenName}`, {
        type: 'stake', args: { stakingContractId, _id, adjustedStackValue }
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

    const userStakedAmount = Number(poolData.totalAmountStaked) || 0;

    if (withdrawValue > userStakedAmount) {
      toast.error(`Withdraw amount exceeds staked amount (${userStakedAmount} fry_token)`);
      return;
    }

    try {
      await ensureAuth();
      const adjustedWithdrawValue = withdrawValue * 1_000_000;
      const stakeTokenId = poolData.stakeTokenId || FRY_ASSET_ID;
      const tokenName = poolData.stakeTokenName || 'tokens';
      await showFeeConfirmation('stakingWithdraw', adjustedWithdrawValue, stakeTokenId, 6, tokenName, `Withdraw ${withdrawValue} ${tokenName}`, {
        type: 'withdraw', args: { stakingContractId, _id, adjustedWithdrawValue }
      })
    } catch (error: any) {
      toast.error(error?.message || 'Error preparing withdrawal');
      setIsWithdrawing(false);
    }
  };

  const executeWithdraw = async (args: any) => {
    setIsWithdrawing(true);
    try {
      const withdrawToken = await unstakeTokens(args.stakingContractId, args.adjustedWithdrawValue, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient);

      if (withdrawToken instanceof Error) {
        toast.error(`Transaction failed: ${withdrawToken.message}`);
        return;
      }
      if (!withdrawToken) {
        toast.error('Withdrawal failed due to invalid response');
        return;
      }

      const getStakingRecord = await getStakingData(args.stakingContractId, activeAddress!, signer);
      const StakerData = await getUserData(args.stakingContractId, activeAddress!);

      if (!getStakingRecord || typeof (getStakingRecord as { apr: number }).apr !== 'number') {
        toast.error('Invalid staking record received');
        return;
      }
      if (!StakerData || typeof StakerData.stakedAmount !== 'number') {
        toast.error('Invalid staker data received');
        return;
      }

      const { stakedAmount, stakeTime } = StakerData;
      const calculateAPR = (getStakingRecord as { apr: number }).apr / 100;

      const apr_response = await authAxios.put(`/staking/update/${args._id}`, {
        aprRate: calculateAPR,
        totalAmountStaked: Number(stakedAmount) / 1_000_000,
        totalStakers: 1,
        stakingTime: stakeTime,
      });

      if (apr_response.status >= 200 && apr_response.status < 300) {
        const logResponse = await authAxios.post('/withdraw/add', {
          tokens: Number(withdrawValue),
          wallet: activeAddress,
          poolId: args._id,
          appId: Number(args.stakingContractId),
        });
        if (logResponse.status === 201) {
          console.log("Withdrawal log saved:", logResponse.data);
        }
        await new Promise(r => setTimeout(r, 500));
        await fetchData();
        fetchBalance();
        const pool = stacks.find(s => s._id === args._id)
        if (pool?.stakeTokenId && pool?.key) fetchTokenBalance(pool.key, pool.stakeTokenId)
        toast.success('Withdrawal successful');
        setWithdrawValue(0);
      } else {
        toast.error('Failed to update staking data');
      }
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
      const rewardTokenId = poolData?.rewardTokenId || FRY_ASSET_ID;
      const rewardTokenName = poolData?.rewardTokenName || 'tokens';

      // Estimate reward for fee calculation
      const est = await estimateStakingReward(stakingContractId, activeAddress!, signer);
      const rewardMicro = est.reward > 0 ? est.reward : 1_000_000; // fallback to 1 token if 0

      await showFeeConfirmation('stakingClaim', rewardMicro, est.rewardTokenId || rewardTokenId, 6, rewardTokenName,
        `Claim rewards`, { type: 'claim', args: { stakingContractId, _id } })
    } catch (error: any) {
      console.error('Error during claim:', error);
      const msg = error?.response?.data?.message || error?.message || 'Error during claim.';
      toast.error(msg);
      setIsClaimingId(null);
    }
  };

  const executeClaim = async (args: any) => {
    try {
      const claimToken = await claimTokens(args.stakingContractId, activeAddress!, signer, args.feeAmount, args.feeTokenId, args.feeRecipient);
      console.log('claimToken:', claimToken);

      const { rewardClaimed, stakedAmount, updatedApr, tx, stakedTime } = claimToken;

      const stakerData = {
        walletId: activeAddress,
        stakedAmount,
        stakeTime: stakedTime,
        poolId: args._id,
        rewardClaimed,
      };

      const claimData = {
        walletId: activeAddress,
        stakedAmount,
        stakedTime,
        poolId: args._id,
        rewardClaimed,
      };

      const stakerRes = await authAxios.post('/stakerData/add', stakerData, {
        headers: { 'Content-Type': 'application/json' },
      });

      const claimResponse = await authAxios.post('/claimreward/add', claimData, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (claimResponse.status === 201) {
        toast.success('Rewards claimed successfully');
        setClaimedPools((prev) => [...prev, args._id]);
        await new Promise(r => setTimeout(r, 500));
        await fetchData();
        fetchBalance();
      } else {
        toast.error('Reward claim logged, but backend response was not OK.');
      }
    } catch (error: any) {
      console.error('Error during claim:', error);
      const msg = error?.response?.data?.message || error?.message || 'Error during claim.';
      toast.error(msg);
    } finally {
      setIsClaimingId(null);
    }
  };

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
                <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">

                <Button
                        text="Staking Addr"
                        className="button btn-red-border"
                        height={45}
                        width={156}
                        onClick={() => {
                          // Redirect to Pera Wallet (mobile/web compatible)
                          window.open('https://explorer.perawallet.app/application/' + record.stakingContractId, '_blank');
                        }}
                      />
                  {/* Left */}
                  {showExpandable === 'Live' && (
                    <div className="flex flex-col gap-[4px]">
                      <Button text="Get FRY" className="button btn-red-border" height={45} width={106} />
                      {/* <a
                  className="text-link underline small cursor-pointer"
                  target="blank"
                  href={`https://lora.algokit.io/${networkName}/application/${record.stakingContractId}`}
                >
                  Contract
                </a> */}
                    </div>
                  )}
                  {/* Right */}
                  {/* stake */}{/* withdraw */}
                  <div className="flex gap-[24px] w-full justify-end">
                    {
                      (showExpandable === 'Live' || showExpandable === 'MyLive') &&
                      <div>
                        <div className="flex flex-col gap-[4px]">
                          <div className="bg-[var(--input-bg)] rounded-[10px] flex gap-[13px] items-center">
                            <Input
                              type="number"
                              name="number"
                              placeholder="0"
                              id="stake"
                              value={stackValue || ''}
                              onChange={(e) => setStackValue(Number(e.target.value))}
                              className="input-wrapper text-[16px] w-full max-w-[150px]"
                              disabled={isStaking} // 🔒 disable while staking
                            />
                            <p className="text-text_clr medium cursor-pointer hover:text-[var(--text-primary)]"
                               onClick={() => setStackValue(tokenBalances[String(record.key)] || 0)}>Max</p>
                            <Button
                              text={isStaking ? "Processing..." : "Stake"}
                              className="button btn-primary"
                              onClick={() => handleStack(record.stakingContractId, record._id)}
                              height={45}
                              width={106}
                              disabled={isStaking} // 🔒 disable button
                            />

                          </div>
                          <p className="text-text_clr e-small">Balance: {tokenBalances[String(record.key)]?.toFixed(2) || '0'} token</p>
                        </div>
                        <div className="flex flex-col gap-[4px]">
                          <div className="bg-[var(--input-bg)] rounded-[10px] flex gap-[13px] items-center">
                            <Input
                              type="number"
                              name="number"
                              id="withdraw"
                              value={withdrawValue}
                              onChange={(e) => setWithdrawValue(Number(e.target.value))}
                              placeholder="0"
                              className="input-wrapper text-[16px] w-full max-w-[150px]"
                              disabled={isWithdrawing}
                            />
                            <p className="text-text_clr medium cursor-pointer hover:text-[var(--text-primary)]"
                               onClick={() => setWithdrawValue(Number(record.totalAmountStaked) || 0)}>Max</p>
                            <Button
                              text={isWithdrawing ? "Processing..." : "Withdraw"}
                              onClick={() => handleWithdraw(record.stakingContractId, record._id)}
                              className="button btn-primary"
                              height={45}
                              width={106}
                              disabled={isWithdrawing}
                            />
                          </div>
                          <p className="text-text_clr e-small">
                            In Pool: {record.totalAmountStaked ? record.totalAmountStaked.toFixed(2) : '0'} token
                          </p>
                        </div>
                      </div>
                    }
                    {/* Claim */}

                    <div className="flex gap-[10px]">
                      {
                        (showExpandable === 'Ended' || showExpandable === 'MyEnded') &&
                        record.userAddress?.toLowerCase() === activeAddress?.toLowerCase() && (
                          isClaimingId === record._id ? (
                            <p className="text-blue-500 font-medium mt-2">Claiming...</p>
                          ) : claimedPools.includes(record._id) ? (
                            <p className="text-green font-semibold mt-2">✅ Rewards Claimed</p>
                          ) : (
                            <Button
                              text="Claim"
                              data-id="claim"
                              onClick={() => {
                                setIsClaimingId(record._id) // Show spinner/status
                                handleClaim(record.stakingContractId, record._id).finally(() => setIsClaimingId(null))
                              }}
                              className="button btn-primary"
                              height={45}
                              width={106}
                              disabled={!!isClaimingId} // disable button while claiming
                            />
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
                        // onClick={() => handleViewDetailsClick(record)} // Use the function here
                      />
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
})

export default STable
