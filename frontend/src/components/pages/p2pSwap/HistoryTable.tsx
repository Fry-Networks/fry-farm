import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Icon } from '@iconify/react'
import { useChain } from '../../../context/ChainContext'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import type { P2PTrade } from '../../../types/p2pSwap'
import type { P2PMarketConfig } from '../../../config/p2pSwapConfig'

interface HistoryTableProps {
  trades: P2PTrade[];
  loading: boolean;
  market: P2PMarketConfig;
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })
}

function formatAddress(addr: string): string {
  if (!addr) return '-'
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

const HistoryTable: React.FC<HistoryTableProps> = ({ trades, loading, market }) => {
  const { activeChain } = useChain()
  const { activeAddress } = useMultiChainWallet()

  const columns: ColumnsType<P2PTrade> = [
    {
      title: 'Date',
      key: 'settledAt',
      render: (_, record) => (
        <span className="text-[var(--text-secondary)] text-sm">
          {new Date(record.settledAt).toLocaleString()}
        </span>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      render: (_, record) => {
        const isMaker = record.makerWallet === activeAddress
        return <Tag color={isMaker ? 'blue' : 'green'}>{isMaker ? 'Maker' : 'Taker'}</Tag>
      },
    },
    {
      title: `Sent`,
      key: 'sent',
      render: (_, record) => {
        const isMaker = record.makerWallet === activeAddress
        return (
          <span className="font-bold">
            {isMaker
              ? `${formatAmount(record.offerAmount, market.offerAssetDecimals)} ${market.offerAssetSymbol}`
              : `${formatAmount(record.requestAmount, market.requestAssetDecimals)} ${market.requestAssetSymbol}`
            }
          </span>
        )
      },
    },
    {
      title: `Received`,
      key: 'received',
      render: (_, record) => {
        const isMaker = record.makerWallet === activeAddress
        return (
          <span className="font-bold text-[#08A700]">
            {isMaker
              ? `${formatAmount(record.requestAmount, market.requestAssetDecimals)} ${market.requestAssetSymbol}`
              : `${formatAmount(record.offerAmount, market.offerAssetDecimals)} ${market.offerAssetSymbol}`
            }
          </span>
        )
      },
    },
    {
      title: 'Counterparty',
      key: 'counterparty',
      render: (_, record) => {
        const isMaker = record.makerWallet === activeAddress
        return <span className="text-[var(--text-secondary)]">{formatAddress(isMaker ? record.takerWallet : record.makerWallet)}</span>
      },
    },
    {
      title: 'Tx',
      key: 'tx',
      render: (_, record) => (
        <a
          href={`${activeChain.explorerBaseUrl}/tx/${record.settlementTxId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#DE0308] hover:underline"
        >
          <Icon icon="mdi:open-in-new" width={16} />
        </a>
      ),
    },
  ]

  return (
    <Table
      columns={columns}
      dataSource={trades}
      rowKey="_id"
      loading={loading}
      pagination={{ pageSize: 20 }}
      scroll={{ x: 700 }}
    />
  )
}

export default HistoryTable
