import { Table, Tag, Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { useChain } from '../../../context/ChainContext'
import { P2P_MARKETS, type P2PMarketConfig } from '../../../config/p2pSwapConfig'
import type { P2POffer } from '../../../types/p2pSwap'
import ShareLinkCopy from './ShareLinkCopy'

interface OfferTableProps {
  offers: P2POffer[];
  loading: boolean;
  market: P2PMarketConfig;
  onAccept: (offer: P2POffer) => void;
  onCancel: (offer: P2POffer) => void;
  pagination?: { page: number; limit: number; total: number; pages: number };
  onPageChange?: (page: number) => void;
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

function formatAddress(addr: string): string {
  if (!addr) return '-'
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry'
  const expiry = new Date(expiresAt)
  const now = new Date()
  if (expiry <= now) return 'Expired'
  const diff = expiry.getTime() - now.getTime()
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const OfferTable: React.FC<OfferTableProps> = ({
  offers, loading, market, onAccept, onCancel, pagination, onPageChange,
}) => {
  const { activeAddress } = useMultiChainWallet()
  const { chainId } = useChain()

  const columns: ColumnsType<P2POffer> = [
    {
      title: `Offering (${market.offerAssetSymbol})`,
      key: 'offerAmount',
      render: (_, record) => (
        <span className="font-bold">{formatAmount(record.offerAmount, market.offerAssetDecimals)}</span>
      ),
    },
    {
      title: `Wanting (${market.requestAssetSymbol})`,
      key: 'requestAmount',
      render: (_, record) => (
        <span className="font-bold">{formatAmount(record.requestAmount, market.requestAssetDecimals)}</span>
      ),
    },
    {
      title: 'Rate',
      key: 'rate',
      render: (_, record) => {
        const offer = Number(record.offerAmount) / Math.pow(10, market.offerAssetDecimals)
        const request = Number(record.requestAmount) / Math.pow(10, market.requestAssetDecimals)
        const rate = offer > 0 ? (request / offer).toFixed(6) : '-'
        return <span className="text-[var(--text-secondary)]">{rate} {market.requestAssetSymbol}/{market.offerAssetSymbol}</span>
      },
    },
    {
      title: 'Maker',
      key: 'maker',
      render: (_, record) => (
        <span className="text-[var(--text-secondary)]">
          {formatAddress(record.makerWallet)}
          {record.makerWallet === activeAddress && (
            <Tag color="blue" className="ml-1">You</Tag>
          )}
        </span>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      render: (_, record) => (
        record.offerType === 'private'
          ? <Tag color="orange">Private</Tag>
          : <Tag color="green">Public</Tag>
      ),
    },
    {
      title: 'Expiry',
      key: 'expiry',
      render: (_, record) => (
        <span className="text-[var(--text-secondary)]">{formatExpiry(record.expiresAt)}</span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => {
        const isMaker = record.makerWallet === activeAddress
        const isOpen = record.status === 'open'
        const isExpired = record.expiresAt && new Date(record.expiresAt) <= new Date()

        return (
          <div className="flex items-center gap-2">
            {isOpen && !isMaker && activeAddress && !isExpired && (
              <button
                onClick={() => onAccept(record)}
                className="px-3 py-1 rounded bg-[#08A700] text-white text-sm font-bold hover:opacity-80 transition-opacity"
              >
                Accept
              </button>
            )}
            {isOpen && isMaker && (
              <Popconfirm
                title="Cancel this offer?"
                description="Your escrowed assets will be returned."
                onConfirm={() => onCancel(record)}
                okText="Cancel Offer"
                cancelText="Keep"
                okButtonProps={{ danger: true }}
              >
                <button className="px-3 py-1 rounded border border-[#DE0308] text-[#DE0308] text-sm font-bold hover:bg-[#DE030810] transition-colors">
                  Cancel
                </button>
              </Popconfirm>
            )}
            <ShareLinkCopy chainId={record.chainId} marketAppId={record.marketAppId} offerId={record.offerId} />
          </div>
        )
      },
    },
  ]

  return (
    <Table
      columns={columns}
      dataSource={offers}
      rowKey="_id"
      loading={loading}
      pagination={pagination ? {
        current: pagination.page,
        pageSize: pagination.limit,
        total: pagination.total,
        onChange: onPageChange,
        showSizeChanger: false,
      } : { pageSize: 20 }}
      scroll={{ x: 800 }}
      className="p2p-offer-table"
    />
  )
}

export default OfferTable
