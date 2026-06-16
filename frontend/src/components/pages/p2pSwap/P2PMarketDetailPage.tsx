import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Tabs, Tag } from 'antd'
import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'
import { useChain } from '../../../context/ChainContext'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useAuth } from '../../../hooks/useAuth'
import { P2P_MARKETS, type P2PMarketConfig } from '../../../config/p2pSwapConfig'
import { ChainId } from '../../../config/chains/types'
import {
  getP2PMarketDetail, getP2PMarketStats, getP2PMarketTrades,
  getP2POffers, getMyP2POffers, getP2PHistory, recordP2PCancel,
} from '../../../services/p2pSwapApi'
import { cancelP2POffer } from '../../../p2p_swap_func'
import type { P2PMarket, P2PMarketStats, P2POffer, P2PTrade, P2POfferPagination } from '../../../types/p2pSwap'
import P2PExperimentalBanner from './P2PExperimentalBanner'
import OfferTable from './OfferTable'
import OfferDetail from './OfferDetail'
import MyOffersTable from './MyOffersTable'
import HistoryTable from './HistoryTable'
import CreateP2POfferWizard from '../../../Modals/website/CreateP2POfferWizard'
import AcceptP2POfferModal from '../../../Modals/website/AcceptP2POfferModal'

function marketToConfig(m: P2PMarket): P2PMarketConfig {
  return {
    appId: m.appId,
    appAddress: m.appAddress,
    offerAssetId: m.offerAssetId,
    offerAssetName: m.offerAssetName,
    offerAssetSymbol: m.offerAssetSymbol,
    offerAssetDecimals: m.offerAssetDecimals,
    requestAssetId: m.requestAssetId,
    requestAssetName: m.requestAssetName,
    requestAssetSymbol: m.requestAssetSymbol,
    requestAssetDecimals: m.requestAssetDecimals,
    feeBps: m.feeBps,
    feeRecipient: m.feeRecipient,
  }
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

function formatAddress(addr: string): string {
  if (!addr) return '-'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const P2PMarketDetailPage: React.FC = () => {
  const { appId: appIdParam } = useParams<{ appId: string }>()
  const appId = Number(appIdParam)
  const { chainId, activeChain, switchChain } = useChain()
  const { activeAddress, signer } = useMultiChainWallet()
  const { ensureAuth, isAuthenticated } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const fallbackMarket = P2P_MARKETS[chainId as ChainId]

  // Market state
  const [market, setMarket] = useState<P2PMarket | null>(null)
  const [stats, setStats] = useState<P2PMarketStats | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [gatedDenied, setGatedDenied] = useState(false)

  // Derive market config
  const marketConfig: P2PMarketConfig = market
    ? marketToConfig(market)
    : (fallbackMarket.appId === appId ? fallbackMarket : { ...fallbackMarket, appId })

  // Data state
  const [offers, setOffers] = useState<P2POffer[]>([])
  const [offerPagination, setOfferPagination] = useState<P2POfferPagination | undefined>()
  const [myOffers, setMyOffers] = useState<P2POffer[]>([])
  const [myHistory, setMyHistory] = useState<P2PTrade[]>([])
  const [marketTrades, setMarketTrades] = useState<P2PTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('offers')

  // Modal state
  const [createWizardOpen, setCreateWizardOpen] = useState(false)
  const [acceptOffer, setAcceptOffer] = useState<P2POffer | null>(null)

  // Share link: ?offer=chainId/appId/offerId
  const offerParam = searchParams.get('offer')
  const shareLink = offerParam ? offerParam.split('/') : null
  const showDetail = shareLink && shareLink.length === 3

  const fetchMarket = useCallback(async (): Promise<boolean> => {
    try {
      const m = await getP2PMarketDetail(appId)
      setMarket(m)
      // Auto-switch chain if market belongs to a different chain (cross-chain shared link)
      if (m.chainId !== chainId) {
        switchChain(m.chainId as ChainId)
        return true
      }
      return false
    } catch {
      setNotFound(true)
      return false
    }
  }, [appId, chainId, switchChain])

  const fetchStats = useCallback(async () => {
    try {
      const s = await getP2PMarketStats(appId)
      setStats(s)
    } catch (err) {
      console.error('Failed to fetch market stats:', err)
    }
  }, [appId, chainId])

  const fetchOffers = useCallback(async (page = 1) => {
    try {
      const result = await getP2POffers({ marketAppId: appId, status: 'open', page, limit: 20 })
      setOffers(result.data)
      setOfferPagination(result.pagination)
    } catch (err) {
      console.error('Failed to fetch offers:', err)
    }
  }, [appId, chainId])

  const fetchMyOffers = useCallback(async () => {
    if (!activeAddress || !isAuthenticated) return
    try {
      const result = await getMyP2POffers({ marketAppId: appId })
      setMyOffers(result.data)
    } catch (err) {
      console.error('Failed to fetch my offers:', err)
    }
  }, [appId, activeAddress, chainId, isAuthenticated])

  const fetchMyHistory = useCallback(async () => {
    if (!activeAddress || !isAuthenticated) return
    try {
      const result = await getP2PHistory({ marketAppId: appId })
      setMyHistory(result.data)
    } catch (err) {
      console.error('Failed to fetch my history:', err)
    }
  }, [appId, activeAddress, chainId, isAuthenticated])

  const fetchMarketTrades = useCallback(async () => {
    try {
      const result = await getP2PMarketTrades({ appId })
      setMarketTrades(result.data)
    } catch (err) {
      console.error('Failed to fetch market trades:', err)
    }
  }, [appId, chainId])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const switched = await fetchMarket()
    if (switched) return  // chain switch will trigger re-render and re-fetch
    await Promise.all([
      fetchStats(), fetchOffers(),
      fetchMyOffers(), fetchMyHistory(), fetchMarketTrades(),
    ])
    setLoading(false)
  }, [fetchMarket, fetchStats, fetchOffers, fetchMyOffers, fetchMyHistory, fetchMarketTrades])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Clear stale my-offers/history when wallet or auth changes
  useEffect(() => {
    if (!activeAddress || !isAuthenticated) {
      setMyOffers([])
      setMyHistory([])
    }
  }, [activeAddress, isAuthenticated])

  // Recheck wallet gating when wallet changes
  useEffect(() => {
    if (market?.gatedWallet && market.gatedWallet !== '') {
      setGatedDenied(activeAddress !== market.gatedWallet)
    } else {
      setGatedDenied(false)
    }
  }, [activeAddress, market])

  // Handle cancel
  const handleCancel = async (offer: P2POffer) => {
    if (!signer || !activeAddress) return
    try {
      await ensureAuth()
      const algodConfig = {
        server: (activeChain.connection as any).algodServer,
        port: String((activeChain.connection as any).algodPort),
        token: (activeChain.connection as any).algodToken,
      }
      const { txId } = await cancelP2POffer(
        marketConfig.appId, offer.offerId, activeAddress, signer, algodConfig
      )
      await recordP2PCancel(offer.offerId, { marketAppId: marketConfig.appId, cancelTxId: txId })
      toast.success('Offer cancelled successfully')
      fetchAll()
    } catch (err: any) {
      console.error('Cancel failed:', err)
      toast.error(err?.message || 'Failed to cancel offer')
    }
  }

  const handleAcceptClick = (offer: P2POffer) => setAcceptOffer(offer)

  if (gatedDenied) {
    return (
      <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
        <div className="max-w-[1400px] m-auto text-center py-20">
          <Icon icon="mdi:lock-outline" width={48} className="mx-auto mb-4 text-[var(--text-secondary)]" />
          <h2 className="text-xl font-bold font-apex text-[var(--text-primary)] mb-2">Wallet-Gated Market</h2>
          <p className="text-[var(--text-secondary)] mb-2">This market is restricted to a specific wallet.</p>
          <p className="text-sm text-[var(--text-secondary)] mb-6 font-mono">
            Required: {market?.gatedWallet ? formatAddress(market.gatedWallet) : ''}
          </p>
          {!activeAddress ? (
            <p className="text-[var(--text-secondary)]">Connect your wallet to check access.</p>
          ) : (
            <p className="text-[var(--text-secondary)]">
              Connected: {formatAddress(activeAddress)} — does not match.
            </p>
          )}
          <Link to="/p2p" className="text-[#DE0308] hover:underline font-bold mt-4 inline-block">
            ← Back to Markets
          </Link>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
        <div className="max-w-[1400px] m-auto text-center py-20">
          <Icon icon="mdi:alert-circle-outline" width={48} className="mx-auto mb-4 text-[var(--text-secondary)]" />
          <h2 className="text-xl font-bold font-apex text-[var(--text-primary)] mb-2">Market Not Found</h2>
          <p className="text-[var(--text-secondary)] mb-6">This market does not exist or has been deactivated.</p>
          <Link to="/p2p" className="text-[#DE0308] hover:underline font-bold">
            ← Back to Markets
          </Link>
        </div>
      </div>
    )
  }

  // Share link detail view
  if (showDetail) {
    return (
      <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
        <div className="max-w-[1400px] m-auto">
          <P2PExperimentalBanner />
          <OfferDetail
            chainId={shareLink[0]}
            marketAppId={Number(shareLink[1])}
            offerId={Number(shareLink[2])}
            market={marketConfig}
            onAccept={handleAcceptClick}
            onBack={() => setSearchParams({})}
          />
        </div>
        {acceptOffer && (
          <AcceptP2POfferModal
            isOpen={!!acceptOffer}
            setIsOpen={(open) => { if (!open) setAcceptOffer(null) }}
            offer={acceptOffer}
            market={marketConfig}
            onSuccess={() => { setAcceptOffer(null); fetchAll() }}
          />
        )}
      </div>
    )
  }

  const offerSymbol = market?.offerAssetSymbol || marketConfig.offerAssetSymbol
  const requestSymbol = market?.requestAssetSymbol || marketConfig.requestAssetSymbol

  const statCards = [
    { label: 'Open Offers', value: stats?.openOffers ?? '-', icon: 'mdi:tag-multiple' },
    { label: 'Total Trades', value: stats?.totalTrades ?? '-', icon: 'mdi:swap-horizontal' },
    {
      label: `${offerSymbol} Volume`,
      value: stats && market ? formatAmount(stats.totalOfferVolume, market.offerAssetDecimals) : '-',
      icon: 'mdi:chart-bar',
    },
    {
      label: `${requestSymbol} Volume`,
      value: stats && market ? formatAmount(stats.totalRequestVolume, market.requestAssetDecimals) : '-',
      icon: 'mdi:chart-line',
    },
  ]

  const tabItems = [
    {
      key: 'offers',
      label: `Open Offers${offerPagination ? ` (${offerPagination.total})` : ''}`,
      children: (
        <OfferTable
          offers={offers}
          loading={loading}
          market={marketConfig}
          onAccept={handleAcceptClick}
          onCancel={handleCancel}
          pagination={offerPagination}
          onPageChange={(page) => fetchOffers(page)}
        />
      ),
    },
    {
      key: 'my-offers',
      label: `My Offers${myOffers.length > 0 ? ` (${myOffers.length})` : ''}`,
      children: activeAddress ? (
        <MyOffersTable offers={myOffers} loading={loading} market={marketConfig} onCancel={handleCancel} />
      ) : (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          Connect your wallet to see your offers.
        </div>
      ),
    },
    {
      key: 'my-history',
      label: 'My History',
      children: activeAddress ? (
        <HistoryTable trades={myHistory} loading={loading} market={marketConfig} />
      ) : (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          Connect your wallet to see your trade history.
        </div>
      ),
    },
    {
      key: 'market-history',
      label: `Market History${marketTrades.length > 0 ? ` (${marketTrades.length})` : ''}`,
      children: (
        <HistoryTable trades={marketTrades} loading={loading} market={marketConfig} />
      ),
    },
  ]

  return (
    <div className="relative z-[1] flex-1 py-[30px] px-[5%]">
      <div className="max-w-[1400px] m-auto">
        <P2PExperimentalBanner />

        {/* Private market banner */}
        {market?.isPrivate && activeAddress && market.creator === activeAddress && (
          <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg border border-[#1a7a8a] bg-[#0d2f36]">
            <div className="flex items-center gap-2 text-sm text-[#5ec4d4]">
              <Icon icon="mdi:eye-off-outline" width={18} />
              <span>This is a private market. Bookmark or copy this URL — it won't appear in the market browser.</span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                toast.success('Link copied to clipboard!')
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold text-[#5ec4d4] border border-[#1a7a8a] hover:bg-[#1a7a8a] transition-colors whitespace-nowrap"
            >
              <Icon icon="mdi:content-copy" width={14} />
              Copy Link
            </button>
          </div>
        )}

        {/* Back link */}
        <Link
          to="/p2p"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
        >
          <Icon icon="mdi:arrow-left" width={16} />
          Back to Markets
        </Link>

        {/* Market header */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold font-apex text-[var(--text-primary)]">
                {offerSymbol}/{requestSymbol}
              </h1>
              <Tag color="default" className="font-mono text-xs">
                App {appId}
              </Tag>
              {market?.creator && activeAddress && market.creator === activeAddress && (
                <Tag color="blue">Your Market</Tag>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
              <span>Fee: {(market?.feeBps ?? marketConfig.feeBps) / 100}%</span>
              {market?.creator && <span>Creator: {formatAddress(market.creator)}</span>}
            </div>
          </div>
          <button
            onClick={() => setCreateWizardOpen(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-lg bg-[#DE0308] text-white font-bold hover:opacity-90 transition-opacity"
          >
            <Icon icon="mdi:plus" width={20} />
            Create Offer
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]"
            >
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1">
                <Icon icon={card.icon} width={14} />
                {card.label}
              </div>
              <div className="text-lg font-bold font-apex text-[var(--text-primary)]">
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="p2p-tabs" />
      </div>

      {/* Modals */}
      <CreateP2POfferWizard
        isOpen={createWizardOpen}
        setIsOpen={setCreateWizardOpen}
        market={marketConfig}
        onSuccess={() => { setCreateWizardOpen(false); fetchAll() }}
      />

      {acceptOffer && (
        <AcceptP2POfferModal
          isOpen={!!acceptOffer}
          setIsOpen={(open) => { if (!open) setAcceptOffer(null) }}
          offer={acceptOffer}
          market={marketConfig}
          onSuccess={() => { setAcceptOffer(null); fetchAll() }}
        />
      )}
    </div>
  )
}

export default P2PMarketDetailPage
