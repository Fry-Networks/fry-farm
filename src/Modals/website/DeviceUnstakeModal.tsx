import React, { useEffect, useState } from 'react'
import { Modal, Spin } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useWallet } from '@txnlab/use-wallet'
import { useAuth } from '../../hooks/useAuth'
import { unstakeDeviceNft, unregisterDeviceHolder } from '../../device_staking_func'
import { unstakeDevice, getPositionsByWallet } from '../../services/deviceStakingApi'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import type { DevicePool, DevicePosition } from '../../types/deviceStaking'
import Button from '../../components/shared/button'

interface DeviceUnstakeModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  pool: DevicePool
}

const DeviceUnstakeModal: React.FC<DeviceUnstakeModalProps> = ({ visible, onClose, onSuccess, pool }) => {
  const { activeAddress, signer } = useWallet()
  const { ensureAuth } = useAuth()

  const [loading, setLoading] = useState(false)
  const [unstaking, setUnstaking] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [positions, setPositions] = useState<DevicePosition[]>([])

  const isVerifiedHold = pool.stakingMode === 'verified-hold'

  useEffect(() => {
    if (visible && activeAddress) {
      loadPositions()
    }
    return () => {
      setPositions([])
    }
  }, [visible, activeAddress])

  const loadPositions = async () => {
    if (!activeAddress) return
    setLoading(true)
    try {
      const allPositions = await getPositionsByWallet(activeAddress)
      const poolPositions = allPositions.filter(
        (p) => p.poolAppId === pool.appId && (p.status === 'active' || p.status === 'escrow_locked')
      )
      setPositions(poolPositions)
    } catch (err) {
      console.error('Error loading positions:', err)
      toast.error('Failed to load your positions')
    } finally {
      setLoading(false)
    }
  }

  const isLocked = (position: DevicePosition): boolean => {
    if (!position.lockExpiry) return false
    return new Date(position.lockExpiry) > new Date()
  }

  const handleUnstakeEscrow = async () => {
    if (!activeAddress || !signer) {
      toast.error('Please connect your wallet')
      return
    }

    setUnstaking(true)
    try {
      await ensureAuth()
      const feeConfig = await fetchFeeConfig()
      let successCount = 0

      for (const position of positions) {
        if (isLocked(position)) continue
        try {
          setStatusMsg(`Unstaking device ${position.deviceNftName || position.deviceNftId} (${successCount + 1}/${positions.length})...`)

          const feeCalc = calculateFeeSimple('stakingWithdraw', pool.valuePerNft || 1_000_000, feeConfig)

          const tx = await unstakeDeviceNft(
            Number(pool.appId),
            position.deviceNftId,
            activeAddress,
            signer,
            feeCalc.feeAmount,
            pool.rewardTokenId,
            feeCalc.feeRecipient,
          )

          if (tx instanceof Error) {
            toast.error(`Failed to unstake: ${tx.message}`)
            continue
          }

          await unstakeDevice({
            poolAppId: pool.appId,
            deviceNftId: position.deviceNftId,
          })

          successCount++
        } catch (err: any) {
          if (err?.message?.includes('cancelled') || err?.message?.includes('CANCELLED')) {
            toast.error('Transaction cancelled')
            break
          }
          console.error(`Error unstaking device ${position.deviceNftId}:`, err)
          toast.error(`Failed to unstake device`)
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully unstaked ${successCount} device${successCount > 1 ? 's' : ''}! Rewards auto-claimed.`)
        await onSuccess()
      }
    } catch (err: any) {
      if (!err?.message?.includes('cancelled')) {
        toast.error(err?.message || 'Unstaking failed')
      }
    } finally {
      setUnstaking(false)
      setStatusMsg('')
    }
  }

  const handleUnregister = async () => {
    if (!activeAddress || !signer) {
      toast.error('Please connect your wallet')
      return
    }

    setUnstaking(true)
    setStatusMsg('Unregistering from pool...')
    try {
      await ensureAuth()
      const feeConfig = await fetchFeeConfig()
      const feeCalc = calculateFeeSimple('stakingWithdraw', pool.valuePerNft || 1_000_000, feeConfig)

      const tx = await unregisterDeviceHolder(
        Number(pool.appId),
        activeAddress,
        signer,
        feeCalc.feeAmount,
        pool.rewardTokenId,
        feeCalc.feeRecipient,
      )

      if (tx instanceof Error) {
        toast.error(`Unregister failed: ${tx.message}`)
        return
      }

      await unstakeDevice({
        poolAppId: pool.appId,
        deviceNftId: 0,
      })

      toast.success('Successfully unregistered! Rewards auto-claimed.')
      await onSuccess()
    } catch (err: any) {
      if (!err?.message?.includes('cancelled') && !err?.message?.includes('CANCELLED')) {
        console.error('Error unregistering:', err)
        toast.error(err?.message || 'Unregister failed')
      }
    } finally {
      setUnstaking(false)
      setStatusMsg('')
    }
  }

  const unlockedCount = positions.filter((p) => !isLocked(p)).length
  const lockedCount = positions.filter((p) => isLocked(p)).length

  return (
    <Modal
      open={visible}
      onCancel={() => { if (!unstaking) onClose() }}
      className="del-modal"
      centered
      width={600}
      footer={null}
      maskClosable={!unstaking}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">
          {isVerifiedHold ? 'Unregister Device' : 'Unstake Device'}
        </h5>
        <p className="text-center text-sm text-[var(--text-secondary)] mt-1">{pool.name}</p>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
            <p className="ml-3 text-[var(--text-secondary)]">Loading your positions...</p>
          </div>
        ) : positions.length === 0 && !isVerifiedHold ? (
          <div className="text-center py-8">
            <Icon icon="mdi:devices" width={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-[var(--text-primary)] font-medium">No active positions</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              You don't have any devices staked in this pool.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {isVerifiedHold ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  This will unregister you from the pool and auto-claim any pending rewards.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-[var(--text-secondary)] text-sm">Active Positions</span>
                    <span className="font-medium text-[var(--text-primary)]">{positions.length}</span>
                  </div>
                  {lockedCount > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <Icon icon="mdi:lock" width={14} className="text-red-500" />
                      <span className="text-xs text-red-500">{lockedCount} position(s) still locked</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-yellow-500">
                  Note: Unstaking auto-claims any pending rewards.
                </p>
              </>
            )}

            {statusMsg && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-400">{statusMsg}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <Button
            text="Cancel"
            className="button btn-red-border flex-1"
            height={48}
            onClick={onClose}
            disabled={unstaking}
          />
          <Button
            text={unstaking ? (isVerifiedHold ? 'Unregistering...' : 'Unstaking...') : (isVerifiedHold ? 'Unregister' : `Unstake (${unlockedCount})`)}
            className="button btn-primary flex-1"
            height={48}
            onClick={isVerifiedHold ? handleUnregister : handleUnstakeEscrow}
            disabled={unstaking || (!isVerifiedHold && unlockedCount === 0) || !activeAddress}
            loading={unstaking}
          />
        </div>
      </div>
    </Modal>
  )
}

export default DeviceUnstakeModal
