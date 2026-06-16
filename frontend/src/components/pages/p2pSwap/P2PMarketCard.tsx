import { Link } from 'react-router-dom'
import { Tag } from 'antd'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import type { P2PMarket } from '../../../types/p2pSwap'
import type { P2PMarketConfig } from '../../../config/p2pSwapConfig'

interface P2PMarketCardProps {
  market: P2PMarket | P2PMarketConfig;
  openOfferCount: number;
  onClick?: () => void;
  linkTo?: string;
  isSelected: boolean;
}

function formatAddress(addr: string): string {
  if (!addr) return '-'
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

const P2PMarketCard: React.FC<P2PMarketCardProps> = ({ market, openOfferCount, onClick, linkTo, isSelected }) => {
  const { activeAddress } = useMultiChainWallet()

  const offerSymbol = 'offerAssetSymbol' in market ? market.offerAssetSymbol : ''
  const requestSymbol = 'requestAssetSymbol' in market ? market.requestAssetSymbol : ''
  const feeBps = market.feeBps
  const creator = 'creator' in market ? (market as P2PMarket).creator : ''
  const isYours = creator && activeAddress && creator === activeAddress

  const cardClasses = `cursor-pointer p-4 rounded-lg border transition-all ${
    isSelected
      ? 'border-[#DE0308] bg-[#DE030810]'
      : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[#DE0308] hover:bg-[#DE030808] hover:shadow-md'
  }`

  const content = (
    <>
      <div className="flex items-center gap-3 mb-2">
        <span className="font-bold text-lg text-[var(--text-primary)] font-apex">
          {offerSymbol}/{requestSymbol}
        </span>
        {isYours && <Tag color="blue">Your Market</Tag>}
      </div>
      <div className="flex justify-between text-sm text-[var(--text-secondary)]">
        <span>{openOfferCount} open offer{openOfferCount !== 1 ? 's' : ''}</span>
        <span>Fee: {feeBps / 100}%</span>
      </div>
      {creator && (
        <div className="text-xs text-[var(--text-secondary)] mt-1">
          Creator: {formatAddress(creator)}
        </div>
      )}
    </>
  )

  if (linkTo) {
    return (
      <Link to={linkTo} className={`${cardClasses} block no-underline`}>
        {content}
      </Link>
    )
  }

  return (
    <div onClick={onClick} className={cardClasses}>
      {content}
    </div>
  )
}

export default P2PMarketCard
