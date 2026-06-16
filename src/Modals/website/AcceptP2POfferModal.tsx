import { useState } from 'react'
import { Modal } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import { useChain } from '../../context/ChainContext'
import { useAuth } from '../../hooks/useAuth'
import { acceptOfferAlgo, acceptOfferAsa } from '../../p2p_swap_func'
import { recordP2PAccept } from '../../services/p2pSwapApi'
import { fetchFeeConfig, calculateFeeSimple } from '../../services/FeeService'
import type { P2POffer } from '../../types/p2pSwap'
import type { P2PMarketConfig } from '../../config/p2pSwapConfig'

interface AcceptP2POfferModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  offer: P2POffer;
  market: P2PMarketConfig;
  onSuccess: () => void;
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

const AcceptP2POfferModal: React.FC<AcceptP2POfferModalProps> = ({
  isOpen, setIsOpen, offer, market, onSuccess,
}) => {
  const { activeAddress, signer } = useMultiChainWallet()
  const { activeChain } = useChain()
  const { ensureAuth } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requestAmountMicro = Number(offer.requestAmount)
  const offerAmountMicro = Number(offer.offerAmount)
  const fee = Math.floor(offerAmountMicro * market.feeBps / 10000)
  const takerReceives = offerAmountMicro - fee

  const handleAccept = async () => {
    if (!activeAddress || !signer) return
    setIsSubmitting(true)

    try {
      await ensureAuth()

      const algodConfig = {
        server: (activeChain.connection as any).algodServer,
        port: String((activeChain.connection as any).algodPort),
        token: (activeChain.connection as any).algodToken,
      }

      // Compute platform fee
      const feeConfig = await fetchFeeConfig()
      const feeCalc = calculateFeeSimple('p2pAccept', requestAmountMicro, feeConfig, activeChain.feeRecipient)

      // Determine if taker sends native or ASA
      const isRequestNative = market.requestAssetId === 0

      let txId: string
      let feeTxId: string | undefined

      if (isRequestNative) {
        // Taker sends ALGO/VOI (native) — primary path for FRY/ALGO market
        const result = await acceptOfferAlgo(
          market.appId, offer.offerId, requestAmountMicro,
          market.feeRecipient, offer.makerWallet,
          activeAddress, signer, algodConfig,
          feeCalc.feeAmount, market.requestAssetId, feeCalc.feeRecipient,
        )
        txId = result.txId
        feeTxId = result.feeTxId
      } else {
        // Taker sends ASA
        const result = await acceptOfferAsa(
          market.appId, offer.offerId, market.requestAssetId, requestAmountMicro,
          market.feeRecipient, offer.makerWallet,
          activeAddress, signer, algodConfig,
          feeCalc.feeAmount, market.requestAssetId, feeCalc.feeRecipient,
        )
        txId = result.txId
        feeTxId = result.feeTxId
      }

      // Record in backend
      await recordP2PAccept(offer.offerId, {
        marketAppId: market.appId,
        settlementTxId: txId,
        requestAmount: requestAmountMicro,
        ...(feeTxId ? { feeTxId, feeAssetId: market.requestAssetId } : {}),
      })

      toast.success('Offer accepted! Trade complete.')
      setIsOpen(false)
      onSuccess()
    } catch (err: any) {
      console.error('Accept failed:', err)
      toast.error(err?.message || 'Failed to accept offer')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onCancel={() => setIsOpen(false)}
      title={<span className="font-apex text-lg">Accept Offer #{offer.offerId}</span>}
      footer={null}
      width={450}
      destroyOnClose
    >
      <div className="space-y-3 mb-6">
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] space-y-3">
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">You send</span>
            <span className="font-bold text-[var(--text-primary)]">
              {formatAmount(offer.requestAmount, market.requestAssetDecimals)} {market.requestAssetSymbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">You receive</span>
            <span className="font-bold text-[#08A700]">
              {formatAmount(String(takerReceives), market.offerAssetDecimals)} {market.offerAssetSymbol}
            </span>
          </div>
          <hr className="border-[var(--border-color)]" />
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Taker fee ({market.feeBps / 100}%)</span>
            <span className="text-[var(--text-primary)]">
              {formatAmount(String(fee), market.offerAssetDecimals)} {market.offerAssetSymbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Maker receives</span>
            <span className="text-[var(--text-primary)]">
              {formatAmount(offer.requestAmount, market.requestAssetDecimals)} {market.requestAssetSymbol}
            </span>
          </div>
        </div>

        <div className="text-xs text-[var(--text-secondary)] text-center">
          This trade settles atomically on-chain. Either both sides complete or neither does.
        </div>
      </div>

      <button
        onClick={handleAccept}
        disabled={isSubmitting || !activeAddress || !signer}
        className="w-full py-3 rounded-lg bg-[#08A700] text-white font-bold text-lg disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Icon icon="mdi:loading" className="animate-spin" width={20} />
            Accepting...
          </>
        ) : (
          'Confirm Accept'
        )}
      </button>
    </Modal>
  )
}

export default AcceptP2POfferModal
