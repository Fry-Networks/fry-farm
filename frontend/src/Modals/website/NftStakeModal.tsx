import React, { useEffect, useState } from 'react'
import { Modal, Spin, Checkbox } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useWallet } from '@txnlab/use-wallet'
import { useChain } from '../../context/ChainContext'
import { useAuth } from '../../hooks/useAuth'
import { stakeNft, optInContractToNft } from '../../nft_staking_func'
import { getUserNfts, filterEligibleNfts, batchGetNftMetadata } from '../../services/nftCollectionService'
import { addStakedNft } from '../../services/nftStakingApi'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import type { NftStakingPool, NftAsset, NftMetadata } from '../../types/nftStaking'
import Button from '../../components/shared/button'

interface NftStakeModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  pool: NftStakingPool
}

const NftStakeModal: React.FC<NftStakeModalProps> = ({ visible, onClose, onSuccess, pool }) => {
  const { activeAddress, signer } = useWallet()
  const { chainId } = useChain()
  const { ensureAuth } = useAuth()

  const [loading, setLoading] = useState(false)
  const [staking, setStaking] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [eligibleNfts, setEligibleNfts] = useState<(NftAsset & { metadata?: NftMetadata })[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (visible && activeAddress) {
      loadNfts()
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
      const userNfts = await getUserNfts(activeAddress, chainId)
      const eligible = filterEligibleNfts(userNfts, pool)
      const metadatas = await batchGetNftMetadata(eligible.map((n) => n.asaId), 5, chainId)

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

  const handleStake = async () => {
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

          // Calculate fee
          const feeCalc = calculateFeeSimple('stakingDeposit', pool.nftValue || 1_000_000, feeConfig)

          // Try opt-in first (may fail if already opted in)
          try {
            await optInContractToNft(pool.appId, nft.asaId, activeAddress, signer)
          } catch {
            // Likely already opted in, continue
          }

          // Stake
          const tx = await stakeNft(
            pool.appId,
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

          // Record in backend
          await addStakedNft({
            appId: pool.appId,
            wallet: activeAddress,
            asaId: nft.asaId,
            nftName: nft.metadata?.name || nft.name,
            nftImage: nft.metadata?.imageUrl || nft.imageUrl,
          })

          successCount++
        } catch (err: any) {
          if (err?.message?.includes('cancelled') || err?.message?.includes('CANCELLED')) {
            toast.error('Transaction cancelled')
            break
          }
          console.error(`Error staking NFT ${nft.asaId}:`, err)
          toast.error(`Failed to stake ${nft.name}`)
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully staked ${successCount} NFT${successCount > 1 ? 's' : ''}!`)
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
        <h5 className="text-[var(--text-primary)] font-apex text-center">Stake NFT</h5>
        <p className="text-center text-sm text-[var(--text-secondary)] mt-1">{pool.poolName}</p>
        <div className="red-line w-full h-[1px] mt-[16px] mb-[16px]" />

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
            <p className="ml-3 text-[var(--text-secondary)]">Loading your NFTs...</p>
          </div>
        ) : eligibleNfts.length === 0 ? (
          <div className="text-center py-8">
            <Icon icon="mdi:image-off-outline" width={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-[var(--text-primary)] font-medium">No eligible NFTs found</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              You don't have any NFTs that qualify for this pool.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              Select NFTs to stake ({selectedIds.size} selected)
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
                    src={nft.metadata?.imageUrl || nft.imageUrl || (chainId === 'algorand-mainnet' ? `https://asa-list.tinyman.org/assets/${nft.asaId}/icon.png` : '')}
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
            onClick={handleStake}
            disabled={staking || selectedIds.size === 0 || !activeAddress}
            loading={staking}
          />
        </div>
      </div>
    </Modal>
  )
}

export default NftStakeModal
