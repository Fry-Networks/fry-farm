import React, { useEffect, useState } from 'react'
import { Modal, Spin, Checkbox } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useWallet } from '@txnlab/use-wallet'
import { useAuth } from '../../hooks/useAuth'
import { useChain } from '../../context/ChainContext'
import { stakeDeviceNft, optInDeviceContractToAsset, registerDeviceHolder } from '../../device_staking_func'
import { getUserNfts, filterEligibleNfts, batchGetNftMetadata } from '../../services/nftCollectionService'
import { stakeDevice } from '../../services/deviceStakingApi'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import type { DevicePool } from '../../types/deviceStaking'
import type { NftAsset, NftMetadata } from '../../types/nftStaking'
import Button from '../../components/shared/button'

interface DeviceStakeModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  pool: DevicePool
}

const DeviceStakeModal: React.FC<DeviceStakeModalProps> = ({ visible, onClose, onSuccess, pool }) => {
  const { activeAddress, signer } = useWallet()
  const { chainId } = useChain()
  const { ensureAuth } = useAuth()

  const [loading, setLoading] = useState(false)
  const [staking, setStaking] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [eligibleNfts, setEligibleNfts] = useState<(NftAsset & { metadata?: NftMetadata })[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const isVerifiedHold = pool.stakingMode === 'verified-hold'

  useEffect(() => {
    if (visible && activeAddress) {
      if (!isVerifiedHold) {
        loadNfts()
      }
    }
    return () => {
      setSelectedIds(new Set())
      setEligibleNfts([])
    }
  }, [visible, activeAddress])

  const loadNfts = async () => {
    if (!activeAddress) return
    setLoading(true)
    try {
      const userNfts = await getUserNfts(activeAddress)
      // Filter by collection creator or whitelist
      const eligible = userNfts.filter((nft) => {
        if (pool.collectionMode === 'creator_address' || pool.collectionMode === 'both') {
          if (nft.creator === pool.collectionCreator) return true
        }
        if (pool.collectionMode === 'whitelist' || pool.collectionMode === 'both') {
          if (pool.whitelist?.includes(nft.asaId)) return true
        }
        return false
      })

      const metadatas = await batchGetNftMetadata(eligible.map((n) => n.asaId))
      const enriched = eligible.map((nft) => ({
        ...nft,
        metadata: metadatas.find((m) => m.asaId === nft.asaId),
      }))

      setEligibleNfts(enriched)
    } catch (err) {
      console.error('Error loading NFTs:', err)
      toast.error('Failed to load your NFTs')
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (asaId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(asaId)) next.delete(asaId)
      else next.add(asaId)
      return next
    })
  }

  const handleStakeEscrow = async () => {
    if (!activeAddress || !signer) {
      toast.error('Please connect your wallet')
      return
    }
    if (selectedIds.size === 0) {
      toast.error('Please select at least one NFT')
      return
    }

    setStaking(true)
    try {
      await ensureAuth()
      const feeConfig = await fetchFeeConfig()
      const selected = eligibleNfts.filter((n) => selectedIds.has(n.asaId))
      let successCount = 0

      for (const nft of selected) {
        try {
          setStatusMsg(`Staking ${nft.metadata?.name || nft.name} (${successCount + 1}/${selected.length})...`)

          const feeCalc = calculateFeeSimple('stakingDeposit', pool.valuePerNft || 1_000_000, feeConfig)

          try {
            await optInDeviceContractToAsset(Number(pool.appId), nft.asaId, activeAddress, signer)
          } catch {
            // Likely already opted in
          }

          const tx = await stakeDeviceNft(
            Number(pool.appId),
            nft.asaId,
            activeAddress,
            signer,
            feeCalc.feeAmount,
            pool.rewardTokenId,
            feeCalc.feeRecipient,
          )

          if (tx instanceof Error) {
            toast.error(`Failed to stake ${nft.name}: ${tx.message}`)
            continue
          }

          await stakeDevice({
            poolAppId: pool.appId,
            deviceNftId: nft.asaId,
            deviceNftName: nft.metadata?.name || nft.name,
          })

          successCount++
        } catch (err: any) {
          if (err?.message?.includes('cancelled') || err?.message?.includes('CANCELLED')) {
            toast.error('Transaction cancelled')
            break
          }
          console.error(`Error staking device NFT ${nft.asaId}:`, err)
          toast.error(`Failed to stake ${nft.name}`)
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully staked ${successCount} device${successCount > 1 ? 's' : ''}!`)
        await onSuccess()
      }
    } catch (err: any) {
      if (!err?.message?.includes('cancelled')) {
        toast.error(err?.message || 'Staking failed')
      }
    } finally {
      setStaking(false)
      setStatusMsg('')
    }
  }

  const handleRegisterHolder = async () => {
    if (!activeAddress || !signer) {
      toast.error('Please connect your wallet')
      return
    }

    setStaking(true)
    setStatusMsg('Registering as verified holder...')
    try {
      await ensureAuth()

      const tx = await registerDeviceHolder(Number(pool.appId), activeAddress, signer)

      if (tx instanceof Error) {
        toast.error(`Registration failed: ${tx.message}`)
        return
      }

      await stakeDevice({
        poolAppId: pool.appId,
        deviceNftId: 0,
        deviceNftName: 'Verified Holder',
      })

      toast.success('Successfully registered as verified holder!')
      await onSuccess()
    } catch (err: any) {
      if (!err?.message?.includes('cancelled') && !err?.message?.includes('CANCELLED')) {
        console.error('Error registering holder:', err)
        toast.error(err?.message || 'Registration failed')
      }
    } finally {
      setStaking(false)
      setStatusMsg('')
    }
  }

  return (
    <Modal
      open={visible}
      onCancel={() => { if (!staking) onClose() }}
      className="del-modal"
      centered
      width={700}
      footer={null}
      maskClosable={!staking}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">
          {isVerifiedHold ? 'Register Device' : 'Stake Device NFT'}
        </h5>
        <p className="text-center text-sm text-[var(--text-secondary)] mt-1">{pool.name}</p>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        {isVerifiedHold ? (
          <div className="flex flex-col gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon icon="mdi:shield-check" width={20} className="text-green-600" />
                <p className="font-medium text-green-700 dark:text-green-400">Verified Hold Mode</p>
              </div>
              <p className="text-sm text-green-600 dark:text-green-500">
                Your device NFT stays in your wallet. The verifier will periodically confirm you still hold it.
                No transfer required.
              </p>
            </div>

            {statusMsg && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-400">{statusMsg}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                text="Cancel"
                className="button btn-red-border flex-1"
                height={48}
                onClick={onClose}
                disabled={staking}
              />
              <Button
                text={staking ? 'Registering...' : 'Register'}
                className="button btn-primary flex-1"
                height={48}
                onClick={handleRegisterHolder}
                disabled={staking || !activeAddress}
                loading={staking}
              />
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Spin size="large" />
                <p className="ml-3 text-[var(--text-secondary)]">Loading your device NFTs...</p>
              </div>
            ) : eligibleNfts.length === 0 ? (
              <div className="text-center py-8">
                <Icon icon="mdi:devices" width={48} className="mx-auto text-gray-400 mb-3" />
                <p className="text-[var(--text-primary)] font-medium">No eligible device NFTs found</p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  You don't have any device NFTs that qualify for this pool.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Select device NFTs to stake ({selectedIds.size} selected)
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar mb-4">
                  {eligibleNfts.map((nft) => (
                    <div
                      key={nft.asaId}
                      onClick={() => !staking && toggleSelect(nft.asaId)}
                      className={`relative rounded-xl p-2 cursor-pointer transition-all border-2 ${
                        selectedIds.has(nft.asaId)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      <Checkbox
                        checked={selectedIds.has(nft.asaId)}
                        className="absolute top-2 right-2 z-10"
                        onChange={() => toggleSelect(nft.asaId)}
                      />
                      <img
                        src={nft.metadata?.imageUrl || nft.imageUrl || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${nft.asaId}/icon.png`)}
                        alt={nft.metadata?.name || nft.name}
                        className="w-full aspect-square object-cover rounded-lg mb-1"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjwvc3ZnPg==' }}
                      />
                      <p className="text-xs text-[var(--text-primary)] truncate text-center">
                        {nft.metadata?.name || nft.name}
                      </p>
                      <p className="text-[10px] text-gray-500 text-center">#{nft.asaId}</p>
                    </div>
                  ))}
                </div>

                {statusMsg && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-3 text-center">
                    <p className="text-sm text-blue-700 dark:text-blue-400">{statusMsg}</p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3">
              <Button
                text="Cancel"
                className="button btn-red-border flex-1"
                height={48}
                onClick={onClose}
                disabled={staking}
              />
              <Button
                text={staking ? 'Staking...' : `Stake ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                className="button btn-primary flex-1"
                height={48}
                onClick={handleStakeEscrow}
                disabled={staking || selectedIds.size === 0 || !activeAddress}
                loading={staking}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default DeviceStakeModal
