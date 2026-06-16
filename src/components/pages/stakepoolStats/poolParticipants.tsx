import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

interface DataType {
  key: React.Key
  joinDate: string
  name: string
  walletAddress: string
  stakedAmount: string
  rewardsEarned: string
  status: string
}

interface PoolParticipantsProps {
  appId: number
}

const PoolParticipants: React.FC<PoolParticipantsProps> = ({ appId }) => {
  const [rawData, setRawData] = useState<any[]>([])
  const api_base_url = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const res = await axios.get(`${api_base_url}/stakingtoken/${appId}`)
        const result = res.data?.data
        if (Array.isArray(result)) {
          setRawData(result)
        }
      } catch (error) {
        console.error('Failed to fetch participants:', error)
      }
    }

    if (appId) fetchParticipants()
  }, [appId])

  const data = useMemo<DataType[]>(() => {
    const walletMap = new Map<string, { totalStaked: number; latestDate: string }>()
    for (const item of rawData) {
      const wallet = item.wallet || 'N/A'
      const existing = walletMap.get(wallet)
      const staked = item.totalStaked || 0
      const date = item.createdAt || ''
      if (existing) {
        existing.totalStaked += staked
        if (date > existing.latestDate) existing.latestDate = date
      } else {
        walletMap.set(wallet, { totalStaked: staked, latestDate: date })
      }
    }
    return Array.from(walletMap.entries()).map(([wallet, info], index) => ({
      key: index + 1,
      joinDate: info.latestDate ? new Date(info.latestDate).toLocaleString() : '-',
      name: '-',
      walletAddress: wallet,
      stakedAmount: `${info.totalStaked ? (info.totalStaked / 1_000_000).toFixed(2) : '0.00'} `,
      rewardsEarned: '-',
      status: 'Active',
    }))
  }, [rawData])

  const columns: TableColumnsType<DataType> = [
    {
      title: 'Date',
      dataIndex: 'joinDate',
      key: 'joinDate',
      align: 'center',
      render: (value) => (
        <p className="text-text_clr font-medium py-[28px] text-center">{value}</p>
      ),
    },
    {
      title: 'Wallet Address',
      dataIndex: 'walletAddress',
      key: 'walletAddress',
      align: 'center',
      render: (value) => (
        <p className="text-text_clr small font-medium text-center break-all">{value}</p>
      ),
    },
    {
      title: 'Staked Amount',
      dataIndex: 'stakedAmount',
      key: 'stakedAmount',
      align: 'center',
      render: (value) => (
        <p className="text-text_clr small font-medium text-center">{value}</p>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (value) => (
        <p className="text-green w-fit m-auto px-3 py-[4px] rounded-full bg-[#DFFFD6] text-[13px] font-semibold">
          {value}
        </p>
      ),
    },
  ]

  return (
    <div className="w-full mb-[40px]">
      <div className="max-xxxl:w-[95%] w-[100%] m-auto flex flex-col gap-[30px] sm-s:gap-[10px]">
        <h3 className="small text-darkRed font-semibold">Participants</h3>
        <div className="bg-white rounded-[12px] shadow p-[20px] overflow-x-auto">
          <Table<DataType>
            className="web-table"
            columns={columns}
            pagination={false}
            dataSource={data}
            scroll={{ x: 1000 }}
            bordered
          />
        </div>
      </div>
    </div>
  )
}

export default PoolParticipants
