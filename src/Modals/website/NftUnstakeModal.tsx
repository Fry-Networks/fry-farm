import React, { useEffect, useState } from 'react'
import { Modal, Spin, Checkbox } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useWallet } from '@txnlab/use-wallet'
import { useAuth } from '../../hooks/useAuth'
import { useChain } from '../../context/ChainContext'
import { unstakeNft as unstakeNftOnChain } from '../../nft_staking_func'
import { getStakedNftsByWallet, unstakeNft as unstakeNftApi } from '../../services/nftStakingApi'
import { batchGetNftMetadata } from '../../services/nftCollectionService'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import type { NftStakingPool, StakedNft, NftMetadata } from '../../types/nftStaking'
import Button from '../../components/shared/button'

interface NftUnstakeModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  pool: NftStakingPool
}

const NftUnstakeModal: React.FC<NftUnstakeModalProps> = ({ visible, onClose, onSuccess, pool }) => {
  const { activeAddress, signer } = useWallet()
  const { chainId } = useChain()
  const { ensureAuth } = useAuth()

  const [loading, setLoading] = useState(false)
  const [unstaking, setUnstaking] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [stakedNfts, setStakedNfts] = useState<(StakedNft & { metadata?: NftMetadata })[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (visible && activeAddress) {
      loadStakedNfts()
    }
    return () => {
      setSelectedIds(new Set())
      setStakedNfts([])
    }
  }, [visible, activeAddress])

  const loadStakedNfts = async () => {
    if (!activeAddress) return
    setLoading(true)
    try {
      const allStakes = await getStakedNftsByWallet(activeAddress)
      const poolStakes = allStakes.filter((s) => s.appId === pool.appId && s.isStaked)

      const metadatas = await batchGetNftMetadata(poolStakes.map((s) => s.asaId))

      const enriched = poolStakes.map((stake) => ({
        ...stake,
        metadata: metadatas.find((m) => m.asaId === stake.asaId),
      }))

      setStakedNfts(enriched)
    } catch (err) {
      console.error('Error loading staked NFTs:', err)
      toast.error('Failed to load staked NFTs')
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

  const isLocked = (stake: StakedNft): boolean => {
    if (!pool.lockPeriod || pool.lockPeriod === 0) return false
    const unlockTime = stake.stakeTime + pool.lockPeriod
    return Math.floor(Date.now() / 1000) < unlockTime
  }

  const handleUnstake = async () => {
    if (!activeAddress || !signer) {
      toast.error('Please connect your wallet')
      return
    }
    if (selectedIds.size === 0) {
      toast.error('Please select at least one NFT')
      return
    }

    setUnstaking(true)
    try {
      await ensureAuth()

      const feeConfig = await fetchFeeConfig()
      const selected = stakedNfts.filter((n) => selectedIds.has(n.asaId))
      let successCount = 0

      for (const nft of selected) {
        try {
          setStatusMsg(`Unstaking ${nft.metadata?.name || nft.nftName} (${successCount + 1}/${selected.length})...`)

          const feeCalc = calculateFeeSimple('stakingWithdraw', pool.nftValue || 1_000_000, feeConfig)

          const tx = await unstakeNftOnChain(
            pool.appId,
            nft.asaId,
            activeAddress,
            signer,
            feeCalc.feeAmount,
            pool.rewardTokenId,
            feeCalc.feeRecipient,
          )

          if (tx instanceof Error) {
            toast.error(`Failed to unstake ${nft.nftName}: ${tx.message}`)
            continue
          }

          await unstakeNftApi({
            appId: pool.appId,
            wallet: activeAddress,
            asaId: nft.asaId,
          })

          successCount++
        } catch (err: any) {
          if (err?.message?.includes('cancelled') || err?.message?.includes('CANCELLED')) {
            toast.error('Transaction cancelled')
            break
          }
          console.error(`Error unstaking NFT ${nft.asaId}:`, err)
          toast.error(`Failed to unstake ${nft.nftName}`)
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully unstaked ${successCount} NFT${successCount > 1 ? 's' : ''}! Rewards auto-claimed.`)
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

  return (
    <Modal
      open={visible}
      onCancel={() => { if (!unstaking) onClose() }}
      className="del-modal"
      centered
      width={700}
      footer={null}
      maskClosable={!unstaking}
    >
      <div className="modal-content flex flex-col pt-[24px] pb-[24px] px-[24px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Unstake NFT</h5>
        <p className="text-center text-sm text-[var(--text-secondary)] mt-1">{pool.poolName}</p>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
            <p className="ml-3 text-[var(--text-secondary)]">Loading staked NFTs...</p>
          </div>
        ) : stakedNfts.length === 0 ? (
          <div className="text-center py-8">
            <Icon icon="mdi:image-off-outline" width={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-[var(--text-primary)] font-medium">No staked NFTs found</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              You don't have any NFTs staked in this pool.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-1">
              Select NFTs to unstake ({selectedIds.size} selected)
            </p>
            <p className="text-xs text-yellow-500 mb-3">
              Note: Unstaking auto-claims any pending rewards.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar mb-4">
              {stakedNfts.map((nft) => {
                const locked = isLocked(nft)
                return (
                  <div
                    key={nft.asaId}
                    onClick={() => !unstaking && !locked && toggleSelect(nft.asaId)}
                    className={`relative rounded-xl p-2 transition-all border-2 ${
                      locked
                        ? 'border-transparent bg-gray-100 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                        : selectedIds.has(nft.asaId)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 cursor-pointer'
                          : 'border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] cursor-pointer'
                    }`}
                  >
                    {locked ? (
                      <div className="absolute top-2 right-2 z-10">
                        <Icon icon="mdi:lock" width={16} className="text-gray-500" />
                      </div>
                    ) : (
                      <Checkbox
                        checked={selectedIds.has(nft.asaId)}
                        className="absolute top-2 right-2 z-10"
                        onChange={() => toggleSelect(nft.asaId)}
                      />
                    )}
                    <img
                      src={nft.metadata?.imageUrl || nft.nftImage || (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${nft.asaId}/icon.png`)}
                      alt={nft.metadata?.name || nft.nftName}
                      className="w-full aspect-square object-cover rounded-lg mb-1"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjwvc3ZnPg==' }}
                    />
                    <p className="text-xs text-[var(--text-primary)] truncate text-center">
                      {nft.metadata?.name || nft.nftName}
                    </p>
                    {locked && (
                      <p className="text-[10px] text-red-500 text-center">Locked</p>
                    )}
                  </div>
                )
              })}
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
            disabled={unstaking}
          />
          <Button
            text={unstaking ? 'Unstaking...' : `Unstake ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
            className="button btn-primary flex-1"
            height={48}
            onClick={handleUnstake}
            disabled={unstaking || selectedIds.size === 0 || !activeAddress}
            loading={unstaking}
          />
        </div>
      </div>
    </Modal>
  )
}

export default NftUnstakeModal
