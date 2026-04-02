import { Icon } from '@iconify/react'
import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProfileStakePool, PoolFilter } from './PstakeTable'

interface DataType {
  key: React.Key
  pool: React.ReactNode
  tvl: string
  apr: string
  staked: string
  reward: string
  status: React.ReactNode
  ends: React.ReactNode
}

interface P_STableProps {
  data: ProfileStakePool[]
  loading: boolean
  activeFilter: PoolFilter
}

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjxwYXRoIGQ9Ik0yMCAxMkMxNS41ODIyIDEyIDEyIDE1LjU4MjIgMTIgMjBDMTIgMjQuNDE3OCAxNS41ODIyIDI4IDIwIDI4QzI0LjQxNzggMjggMjggMjQuNDE3OCAyOCAyMEMyOCAxNS41ODIyIDI0LjQxNzggMTIgMjAgMTJaIiBmaWxsPSIjOUI5Q0E1Ii8+PC9zdmc+'

const EMPTY_MESSAGES: Record<PoolFilter, string> = {
  all: 'No staking positions found',
  active: 'No active staking pools',
  'ending-soon': 'No pools ending soon',
  ended: 'No ended staking pools',
}

function filterPools(pools: ProfileStakePool[], filter: PoolFilter): ProfileStakePool[] {
  if (filter === 'all') return pools
  return pools.filter((p) => p.status === filter)
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' },
    'ending-soon': { label: 'Ending Soon', bg: 'bg-yellow-100', text: 'text-yellow-700' },
    ended: { label: 'Ended', bg: 'bg-gray-100', text: 'text-gray-500' },
  }[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-500' }

  return (
    <span className={`${config.bg} ${config.text} px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap`}>
      {config.label}
    </span>
  )
}

const P_STable: React.FC<P_STableProps> = ({ data, loading, activeFilter }) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const navigate = useNavigate()

  const filteredData = filterPools(data, activeFilter)

  const handleToggleExpand = (key: React.Key) => {
    setExpandedKeys(
      (prev) => (prev.includes(key) ? prev.filter((rowKey) => rowKey !== key) : [key]),
    )
  }

  const columns: TableColumnsType<DataType> = [
    { title: <div className="w-[350px]">Pool</div>, dataIndex: 'pool', key: 'pool' },
    {
      title: (
        <div className="flex items-center gap-[2px]">
          TVL
          <Icon icon="solar:arrow-down-outline" width={18} height={21} color="var(--text-primary)" />
        </div>
      ),
      dataIndex: 'tvl',
      key: 'tvl',
      render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{value}</p>,
    },
    { title: 'APR', dataIndex: 'apr', key: 'apr', render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{value}</p> },
    { title: 'MY STAKE', dataIndex: 'staked', key: 'staked', render: (value) => <p className="text-[var(--text-secondary)] font-medium medium">{value}</p> },
    { title: 'STATUS', dataIndex: 'status', key: 'status' },
    {
      title: 'ENDS',
      dataIndex: 'ends',
      key: 'ends',
      render: (_, record) => (
        <div className="flex items-center justify-between gap-[20px]">
          <div className="max-w-[100px]">{record.ends}</div>
          <Icon
            icon={expandedKeys.includes(record.key) ? 'mdi:chevron-up' : 'mdi:chevron-down'}
            width={36}
            height={36}
            color="#808080"
            className="cursor-pointer"
            onClick={() => handleToggleExpand(record.key)}
          />
        </div>
      ),
    },
  ]

  const tableData: DataType[] = filteredData.map((pool) => ({
    key: pool.key,
    pool: (
      <div className="flex items-center gap-[16px] w-[350px]">
        <div className="flex relative">
          <img
            src={pool.rewardTokenImage}
            alt={pool.rewardTokenName}
            className="w-[40px] h-[40px] rounded-full drop-shadow-md"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          />
          <img
            src={pool.stakeTokenImage}
            alt={pool.stakeTokenName}
            className="w-[40px] h-[40px] rounded-full drop-shadow-md z-10 -ml-4"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG }}
          />
        </div>
        <div className="flex flex-col">
          <h6 className="text-[var(--text-primary)] font-bold tracking-[0.1px]">{pool.poolName}</h6>
          <p className="text-green font-medium small">Earn {pool.rewardTokenName}</p>
          <p className="text-[var(--text-secondary)] small">with {pool.lockDays} days lock</p>
        </div>
      </div>
    ),
    tvl: pool.tvl,
    apr: pool.apr,
    staked: pool.userStaked,
    reward: pool.reward,
    status: <StatusBadge status={pool.status} />,
    ends: (
      <p className="text-[var(--text-secondary)] small font-medium">{pool.endsIn}</p>
    ),
  }))

  if (!loading && filteredData.length === 0) {
    return (
      <div className="w-full py-[60px] flex flex-col items-center gap-[12px]">
        <Icon icon="mdi:wallet-outline" width={48} height={48} color="#808080" />
        <p className="text-[var(--text-secondary)] medium">{EMPTY_MESSAGES[activeFilter]}</p>
      </div>
    )
  }

  return (
    <Table<DataType>
      className="web-table"
      columns={columns}
      pagination={false}
      loading={loading}
      expandable={{
        expandedRowRender: (record) => {
          const pool = data.find((p) => p.key === record.key)
          return (
            <div className="expandable">
              <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">
                <div className="flex flex-col gap-[4px]">
                  <p className="text-[var(--text-secondary)] small">
                    {pool?.isCreator ? 'You created this pool' : 'You have staked in this pool'}
                  </p>
                </div>
                <div className="flex gap-[10px]">
                  <button
                    className="button btn-red-border rounded-[10px] px-[16px] py-[10px] text-[var(--text-primary)] cursor-pointer"
                    onClick={() => navigate('/stake')}
                  >
                    View on Stake Page
                  </button>
                </div>
              </div>
            </div>
          )
        },
        rowExpandable: () => true,
        expandedRowKeys: expandedKeys,
      }}
      expandIconColumnIndex={-1}
      dataSource={tableData}
      scroll={{ x: '1000px' }}
    />
  )
}

export default P_STable
