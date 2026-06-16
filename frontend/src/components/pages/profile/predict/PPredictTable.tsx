import React, { useEffect, useState, useMemo } from 'react'
import { useWallet } from '@txnlab/use-wallet'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { getPositionsByWallet, getPools } from '../../../../services/alphaArcadeApi'
import type { AlphaArcadePosition, AlphaArcadePool } from '../../../../types/alphaArcade'

type PredictFilter = 'all' | 'active' | 'withdrawn'

const FILTER_LABELS: { key: PredictFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'withdrawn', label: 'Withdrawn' },
]

interface TableRow {
  key: string
  market: string
  deposited: string
  status: string
  date: string
}

const statusColor: Record<string, string> = {
  active: 'green',
  pending_withdrawal: 'orange',
  withdrawing: 'orange',
  withdrawn: 'default',
  auto_withdrawn: 'red',
  resolved: 'blue',
}

const PPredictTable: React.FC = () => {
  const { activeAddress } = useWallet()
  const [positions, setPositions] = useState<AlphaArcadePosition[]>([])
  const [pools, setPools] = useState<AlphaArcadePool[]>([])
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<PredictFilter>('all')

  useEffect(() => {
    if (activeAddress) {
      fetchData()
    } else {
      setPositions([])
    }
  }, [activeAddress])

  const fetchData = async () => {
    if (!activeAddress) return
    setLoading(true)
    try {
      const [posData, poolData] = await Promise.all([
        getPositionsByWallet(activeAddress).catch(() => []),
        getPools().catch(() => []),
      ])
      setPositions(posData || [])
      setPools(poolData || [])
    } catch (error) {
      console.error('Error fetching predict data:', error)
    } finally {
      setLoading(false)
    }
  }

  const poolMap = useMemo(() => {
    const map = new Map<number, AlphaArcadePool>()
    for (const p of pools) {
      map.set(p.marketAppId, p)
    }
    return map
  }, [pools])

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'active') return p.status === 'active' || p.status === 'pending_withdrawal'
      // withdrawn
      return p.status === 'withdrawn' || p.status === 'auto_withdrawn' || p.status === 'resolved'
    })
  }, [positions, activeFilter])

  const tableData: TableRow[] = useMemo(() => {
    return filteredPositions.map((pos) => {
      const pool = poolMap.get(pos.marketAppId)
      return {
        key: pos._id,
        market: pool?.marketQuestion || `Market #${pos.marketAppId}`,
        deposited: `$${(pos.usdcDeposited / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        status: pos.status,
        date: new Date(pos.createdAt).toLocaleDateString(),
      }
    })
  }, [filteredPositions, poolMap])

  const columns: ColumnsType<TableRow> = [
    {
      title: 'Market',
      dataIndex: 'market',
      key: 'market',
      ellipsis: true,
    },
    {
      title: 'Deposited',
      dataIndex: 'deposited',
      key: 'deposited',
      width: 140,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => (
        <Tag color={statusColor[status] || 'default'}>
          {status.replace(/_/g, ' ')}
        </Tag>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
  ]

  return (
    <div className="w-full m-auto flex flex-col gap-[16px]">
      {/* Sub-tab pills */}
      <div className="flex justify-center">
        <div className="switcher flex justify-center items-center gap-[3px] w-fit max-sm:w-full overflow-x-auto p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
          {FILTER_LABELS.map(({ key, label }) => (
            <p
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`${
                activeFilter === key ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[60px] max-sm:px-2 h-[38px] max-sm:h-[34px] text-[14px] max-sm:text-[12px] whitespace-nowrap`}
            >
              {label}
            </p>
          ))}
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: activeAddress ? 'No prediction positions found' : 'Connect wallet to view positions' }}
        scroll={{ x: 500 }}
      />
    </div>
  )
}

export default PPredictTable
