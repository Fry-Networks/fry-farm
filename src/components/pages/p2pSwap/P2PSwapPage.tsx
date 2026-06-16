import { useCallback, useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useChain } from '../../../context/ChainContext'
import { P2P_MARKETS, type P2PMarketConfig } from '../../../config/p2pSwapConfig'
import { ChainId } from '../../../config/chains/types'
import { getP2PMarkets } from '../../../services/p2pSwapApi'
import type { P2PMarket } from '../../../types/p2pSwap'
import P2PExperimentalBanner from './P2PExperimentalBanner'
import P2PMarketCard from './P2PMarketCard'
import CreateP2PMarketModal from '../../../Modals/website/CreateP2PMarketModal'

const P2PSwapPage: React.FC = () => {
  const { chainId } = useChain()
  const [searchParams] = useSearchParams()

  const fallbackMarket = P2P_MARKETS[chainId as ChainId]

  // Market state
  const [markets, setMarkets] = useState<P2PMarket[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [createMarketOpen, setCreateMarketOpen] = useState(false)

  // Share link redirect: ?offer=chainId/appId/offerId → /p2p/:appId?offer=...
  const offerParam = searchParams.get('offer')
  const shareLink = offerParam ? offerParam.split('/') : null
  if (shareLink && shareLink.length === 3) {
    return <Navigate to={`/p2p/${shareLink[1]}?offer=${offerParam}`} replace />
  }

  // Fetch markets from backend
  const fetchMarkets = useCallback(async () => {
    setLoading(true)
    try {
      const apiMarkets = await getP2PMarkets()
      setMarkets(apiMarkets)
    } catch (err) {
      console.error('Failed to fetch markets:', err)
    }
    setLoading(false)
  }, [chainId])

  useEffect(() => {
    fetchMarkets()
  }, [fetchMarkets])

  return (
    <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
      <div className="max-w-[1400px] m-auto">
        <P2PExperimentalBanner />

        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold font-apex text-[var(--text-primary)]">
              P2P Trading
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Trade directly with other users — permissionless, on-chain settlement
            </p>
          </div>
          <button
            onClick={() => setCreateMarketOpen(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] font-bold hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <Icon icon="mdi:store-plus" width={20} />
            Create Market
          </button>
        </div>

        {/* Market cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {loading && markets.length === 0 ? (
            <div className="col-span-full text-center py-12 text-[var(--text-secondary)]">
              Loading markets...
            </div>
          ) : markets.length > 0 ? (
            markets.map((m) => (
              <P2PMarketCard
                key={m._id}
                market={m}
                openOfferCount={m.openOfferCount ?? 0}
                linkTo={`/p2p/${m.appId}`}
                isSelected={false}
              />
            ))
          ) : (
            <P2PMarketCard
              market={fallbackMarket}
              openOfferCount={0}
              linkTo={`/p2p/${fallbackMarket.appId}`}
              isSelected={false}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateP2PMarketModal
        isOpen={createMarketOpen}
        setIsOpen={setCreateMarketOpen}
        onSuccess={() => { setCreateMarketOpen(false); fetchMarkets() }}
      />
    </div>
  )
}

export default P2PSwapPage
