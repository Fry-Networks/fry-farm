import React, { useEffect, useState } from 'react'
import { Modal, Spin } from 'antd'
import { toast } from 'react-toastify'
import { useWallet } from '@txnlab/use-wallet'
import { useAuth } from '../../hooks/useAuth'
import { claimDeviceRewardsOnChain, calculateDevicePendingRewards } from '../../device_staking_func'
import { claimDeviceRewards } from '../../services/deviceStakingApi'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import type { DevicePool } from '../../types/deviceStaking'
import Button from '../../components/shared/button'

interface DeviceClaimModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  pool: DevicePool
}

const DeviceClaimModal: React.FC<DeviceClaimModalProps> = ({ visible, onClose, onSuccess, pool }) => {
  const { activeAddress, signer } = useWallet()
  const { ensureAuth } = useAuth()

  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [pendingReward, setPendingReward] = useState(0)
  const [rewardTokenId, setRewardTokenId] = useState(pool.rewardTokenId)
  const [feeAmount, setFeeAmount] = useState(0)
  const [netAmount, setNetAmount] = useState(0)
  const [feePercent, setFeePercent] = useState(0)

  useEffect(() => {
    if (visible && activeAddress) {
      loadPendingRewards()
    }
    return () => {
      setPendingReward(0)
      setFeeAmount(0)
      setNetAmount(0)
    }
  }, [visible, activeAddress])

  const loadPendingRewards = async () => {
    if (!activeAddress || !signer) return
    setLoading(true)
    try {
      const { reward, rewardTokenId: tokenId } = await calculateDevicePendingRewards(Number(pool.appId), activeAddress, signer)
      setPendingReward(reward)
      setRewardTokenId(tokenId || pool.rewardTokenId)

      if (reward > 0) {
        const feeConfig = await fetchFeeConfig()
        const feeCalc = calculateFeeSimple('stakingClaim', reward, feeConfig)
        setFeeAmount(feeCalc.feeAmount)
        setNetAmount(feeCalc.netAmount)
        setFeePercent(feeCalc.feePercent)
      }
    } catch (err) {
      console.error('Error loading pending rewards:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async () => {
    if (!activeAddress || !signer) {
      toast.error('Please connect your wallet')
      return
    }

    setClaiming(true)
    try {
      await ensureAuth()

      const feeConfig = await fetchFeeConfig()
      const feeCalc = calculateFeeSimple('stakingClaim', pendingReward, feeConfig)

      const tx = await claimDeviceRewardsOnChain(
        Number(pool.appId),
        activeAddress,
        signer,
        feeCalc.feeAmount,
        rewardTokenId,
        feeCalc.feeRecipient,
      )

      if (tx instanceof Error) {
        toast.error(`Claim failed: ${tx.message}`)
        return
      }

      const txId = tx?.transaction?.txID?.() || tx?.txID || ''

      await claimDeviceRewards({
        poolAppId: pool.appId,
        rewardClaimed: pendingReward,
        txId,
        feeAmount: feeCalc.feeAmount,
      })

      toast.success('Rewards claimed successfully!')
      await onSuccess()
    } catch (err: any) {
      if (!err?.message?.includes('cancelled') && !err?.message?.includes('CANCELLED')) {
        console.error('Error claiming rewards:', err)
        toast.error(err?.message || 'Claim failed')
      }
    } finally {
      setClaiming(false)
    }
  }

  const decimals = pool.rewardToken?.decimals || 6
  const formatAmount = (micro: number) => (micro / Math.pow(10, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })
  const tokenSymbol = pool.rewardToken?.symbol || ''

  return (
    <Modal
      open={visible}
      onCancel={() => { if (!claiming) onClose() }}
      className="del-modal"
      centered
      width={500}
      footer={null}
      maskClosable={!claiming}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Claim Rewards</h5>
        <p className="text-center text-sm text-[var(--text-secondary)] mt-1">{pool.name}</p>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
            <p className="ml-3 text-[var(--text-secondary)]">Calculating rewards...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)] text-sm">Pending Rewards</span>
                  <span className="font-bold text-lg text-green">
                    {formatAmount(pendingReward)} {tokenSymbol}
                  </span>
                </div>

                {pendingReward > 0 && (
                  <>
                    <div className="border-t border-[var(--border-color)]" />
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)] text-sm">Claim Fee ({feePercent}%)</span>
                      <span className="text-red-500 text-sm">
                        -{formatAmount(feeAmount)} {tokenSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)] text-sm font-medium">You Receive</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {formatAmount(netAmount)} {tokenSymbol}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {pendingReward === 0 && (
              <p className="text-center text-sm text-[var(--text-secondary)]">
                No rewards available to claim yet. Keep your device staked to earn rewards.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <Button
            text="Cancel"
            className="button btn-red-border flex-1"
            height={48}
            onClick={onClose}
            disabled={claiming}
          />
          <Button
            text={claiming ? 'Claiming...' : 'Claim Rewards'}
            className="button btn-primary flex-1"
            height={48}
            onClick={handleClaim}
            disabled={claiming || pendingReward === 0 || !activeAddress}
            loading={claiming}
          />
        </div>
      </div>
    </Modal>
  )
}

export default DeviceClaimModal
