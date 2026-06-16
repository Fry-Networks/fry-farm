import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Tag } from 'antd'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useChain } from '../../../context/ChainContext'
import { getP2POffer, getP2PReputation } from '../../../services/p2pSwapApi'
import type { P2POffer, P2PReputation } from '../../../types/p2pSwap'
import type { P2PMarketConfig } from '../../../config/p2pSwapConfig'
import ShareLinkCopy from './ShareLinkCopy'

interface OfferDetailProps {
  chainId: string;
  marketAppId: number;
  offerId: number;
  market: P2PMarketConfig;
  onAccept: (offer: P2POffer) => void;
  onBack: () => void;
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

const OfferDetail: React.FC<OfferDetailProps> = ({
  chainId, marketAppId, offerId, market, onAccept, onBack,
}) => {
  const { activeAddress } = useMultiChainWallet()
  const { activeChain } = useChain()
  const [offer, setOffer] = useState<P2POffer | null>(null)
  const [reputation, setReputation] = useState<P2PReputation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const o = await getP2POffer(chainId, marketAppId, offerId)
        setOffer(o)
        if (o.makerWallet) {
          const rep = await getP2PReputation(o.makerWallet).catch(() => null)
          setReputation(rep)
        }
      } catch {
        setError('Offer not found')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [chainId, marketAppId, offerId])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Icon icon="mdi:loading" className="animate-spin" width={32} />
      </div>
    )
  }

  if (error || !offer) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-secondary)] mb-4">{error || 'Offer not found'}</p>
        <button onClick={onBack} className="text-[#DE0308] hover:underline">Back to offers</button>
      </div>
    )
  }

  const isMaker = offer.makerWallet === activeAddress
  const isOpen = offer.status === 'open'
  const isExpired = offer.expiresAt && new Date(offer.expiresAt) <= new Date()
  const isPrivate = offer.offerType === 'private'
  const canAccept = isOpen && !isMaker && !isExpired && activeAddress &&
    (!isPrivate || offer.counterparty === activeAddress)

  return (
    <div className="max-w-xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
      >
        <Icon icon="mdi:arrow-left" width={20} />
        Back to offers
      </button>

      <div className="p-6 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold font-apex text-[var(--text-primary)]">
            Offer #{offer.offerId}
          </h2>
          <div className="flex items-center gap-2">
            <Tag color={offer.status === 'open' ? 'green' : offer.status === 'filled' ? 'blue' : 'default'}>
              {offer.status.toUpperCase()}
            </Tag>
            <ShareLinkCopy chainId={offer.chainId} marketAppId={offer.marketAppId} offerId={offer.offerId} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
            <span className="text-[var(--text-secondary)]">Offering</span>
            <span className="font-bold text-[var(--text-primary)]">
              {formatAmount(offer.offerAmount, market.offerAssetDecimals)} {market.offerAssetSymbol}
            </span>
          </div>
          <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
            <span className="text-[var(--text-secondary)]">Wanting</span>
            <span className="font-bold text-[var(--text-primary)]">
              {formatAmount(offer.requestAmount, market.requestAssetDecimals)} {market.requestAssetSymbol}
            </span>
          </div>
          <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
            <span className="text-[var(--text-secondary)]">Rate</span>
            <span className="text-[var(--text-primary)]">
              {(Number(offer.requestAmount) / Number(offer.offerAmount) * Math.pow(10, market.offerAssetDecimals) / Math.pow(10, market.requestAssetDecimals)).toFixed(6)} {market.requestAssetSymbol}/{market.offerAssetSymbol}
            </span>
          </div>

          <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
            <span className="text-[var(--text-secondary)]">Maker</span>
            <span className="text-[var(--text-primary)] font-mono text-sm">
              {offer.makerWallet.slice(0, 8)}...{offer.makerWallet.slice(-6)}
              {isMaker && <Tag color="blue" className="ml-2">You</Tag>}
            </span>
          </div>

          {reputation && (
            <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
              <span className="text-[var(--text-secondary)]">Reputation</span>
              <span className="text-[var(--text-primary)]">
                {reputation.totalTrades} trade{reputation.totalTrades !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {isPrivate && (
            <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
              <span className="text-[var(--text-secondary)]">Private for</span>
              <span className="text-[var(--text-primary)] font-mono text-sm">
                {offer.counterparty.slice(0, 8)}...{offer.counterparty.slice(-6)}
              </span>
            </div>
          )}

          {offer.expiresAt && (
            <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
              <span className="text-[var(--text-secondary)]">Expires</span>
              <span className={isExpired ? 'text-[#DE0308]' : 'text-[var(--text-primary)]'}>
                {isExpired ? 'Expired' : new Date(offer.expiresAt).toLocaleString()}
              </span>
            </div>
          )}

          {offer.escrowTxId && (
            <div className="flex justify-between p-3 rounded bg-[var(--bg-secondary)]">
              <span className="text-[var(--text-secondary)]">Escrow Tx</span>
              <a
                href={`${activeChain.explorerBaseUrl}/tx/${offer.escrowTxId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#DE0308] hover:underline flex items-center gap-1"
              >
                View <Icon icon="mdi:open-in-new" width={14} />
              </a>
            </div>
          )}
        </div>

        <div className="mt-6">
          {canAccept && (
            <button
              onClick={() => onAccept(offer)}
              className="w-full py-3 rounded-lg bg-[#08A700] text-white font-bold text-lg hover:opacity-90 transition-opacity"
            >
              Accept Offer
            </button>
          )}
          {isOpen && !activeAddress && (
            <button
              onClick={() => window.dispatchEvent(new Event('openConnectWallet'))}
              className="w-full py-3 rounded-lg bg-[#DE0308] text-white font-bold text-lg hover:opacity-90 transition-opacity"
            >
              Connect Wallet to Accept
            </button>
          )}
          {offer.status === 'filled' && (
            <div className="text-center py-3 text-[var(--text-secondary)]">
              This offer has been filled.
            </div>
          )}
          {offer.status === 'cancelled' && (
            <div className="text-center py-3 text-[var(--text-secondary)]">
              This offer has been cancelled.
            </div>
          )}
          {isOpen && isMaker && (
            <div className="text-center py-3 text-[var(--text-secondary)]">
              This is your offer.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OfferDetail
