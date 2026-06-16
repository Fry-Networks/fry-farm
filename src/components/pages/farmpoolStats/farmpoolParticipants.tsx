import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import axios from 'axios'
import React, { useEffect, useState } from 'react'

interface DataType {
  key: React.Key
  joinDate: string
  name: string
  walletAddress: string
  stakedAmount: string
  rewardsEarned: string
  status: string
}

interface FarmPoolParticipantsProps {
  appId: number
}

const FarmPoolParticipants: React.FC<FarmPoolParticipantsProps> = ({ appId }) => {
  const [data, setData] = useState<DataType[]>([])

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
        <p className="text-text_clr small font-medium text-center">{value}</p>
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
      render: () => (
        <p className="text-green w-fit m-auto px-3 py-[4px] rounded-full bg-[#DFFFD6] text-[13px] font-semibold">
          Active
        </p>
      ),
    },
  ]

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_BASE_URL}/stakingfarmingtoken/${appId}`
        )
        console.log(res)

        if (res.data.success && Array.isArray(res.data.data)) {
          const formattedData = res.data.data.map((item: any, index: number) => ({
            key: index,
            joinDate: new Date(item.lastStakedAt).toLocaleString(),
            name: '-', // Placeholder
            walletAddress: item.wallet,
            stakedAmount: `${item.stakedAmount}`,
            rewardsEarned: '-', // Optional: you can replace it if you have data
            status: 'Active',
          }))

          setData(formattedData)
        }
      } catch (error) {
        console.error('Failed to fetch participants:', error)
      }
    }

    fetchParticipants()
  }, [appId])

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

export default FarmPoolParticipants
