import { Table, Tag, Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { P2POffer } from '../../../types/p2pSwap'
import type { P2PMarketConfig } from '../../../config/p2pSwapConfig'
import ShareLinkCopy from './ShareLinkCopy'

interface MyOffersTableProps {
  offers: P2POffer[];
  loading: boolean;
  market: P2PMarketConfig;
  onCancel: (offer: P2POffer) => void;
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

const STATUS_COLORS: Record<string, string> = {
  open: 'green',
  filled: 'blue',
  cancelled: 'default',
  expired: 'orange',
}

const MyOffersTable: React.FC<MyOffersTableProps> = ({ offers, loading, market, onCancel }) => {
  const columns: ColumnsType<P2POffer> = [
    {
      title: 'Offer ID',
      dataIndex: 'offerId',
      key: 'offerId',
      width: 80,
    },
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
      title: 'Type',
      key: 'type',
      render: (_, record) => (
        record.offerType === 'private'
          ? <Tag color="orange">Private</Tag>
          : <Tag color="green">Public</Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => (
        <Tag color={STATUS_COLORS[record.status] || 'default'}>
          {record.status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Created',
      key: 'createdAt',
      render: (_, record) => (
        <span className="text-[var(--text-secondary)] text-sm">
          {new Date(record.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          {record.status === 'open' && (
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
      ),
    },
  ]

  return (
    <Table
      columns={columns}
      dataSource={offers}
      rowKey="_id"
      loading={loading}
      pagination={{ pageSize: 20 }}
      scroll={{ x: 700 }}
    />
  )
}

export default MyOffersTable
