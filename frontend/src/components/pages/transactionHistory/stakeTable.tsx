import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import React from 'react'

interface DataType {
  key: React.Key
  dateTime: string
  transactionId: string
  poolNameId: string
  type: React.ReactNode
  tokenStaked: string
  amountStaked: string
  transactionFee: string
  rewards: string
  transactionHash: string
}

const StakeTable: React.FC = () => {
  const columns: TableColumnsType<DataType> = [
    {
      title: 'Date/Time',
      dataIndex: 'dateTime',
      key: 'dateTime',
      render: (value) => <p className="text-text_clr font-medium py-[28px]">{value}</p>,
    },
    {
      title: 'Transaction ID',
      dataIndex: 'transactionId',
      key: 'transactionId',
      render: (value) => <p className="text-text_clr font-medium small">{value}</p>,
    },
    {
      title: 'Pool Name/ID',
      dataIndex: 'poolNameId',
      key: 'poolNameId',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (value) => (
        <p className="text-darkRed small flex justify-center items-center font-medium px-3 py-2 w-[78px] rounded-full bg-[#FFE5E5]">
          Stake
        </p>
      ),
    },
    {
      title: 'Token Staked',
      dataIndex: 'tokenStaked',
      key: 'tokenStaked',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
    {
      title: 'Amount Staked',
      dataIndex: 'amountStaked',
      key: 'amountStaked',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
    {
      title: 'Transaction Fee',
      dataIndex: 'transactionFee',
      key: 'transactionFee',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
    {
      title: 'Rewards',
      dataIndex: 'rewards',
      key: 'rewards',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
    {
      title: 'Transaction Hash',
      dataIndex: 'transactionHash',
      key: 'transactionHash',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
  ]

  const data: DataType[] = [
    {
      key: 1,
      dateTime: '2024-11-06 / 14:32',
      transactionId: 'STK-001',
      poolNameId: 'ASA-Pool-01',
      type: 'Stake',
      tokenStaked: 'FRY-ALGO',
      amountStaked: '50 ASA',
      transactionFee: '05 FRY',
      rewards: '54 FRY',
      transactionHash: '0x9a5c...ad34',
    },
    {
      key: 2,
      dateTime: '2024-11-06 / 14:32',
      transactionId: 'STK-001',
      poolNameId: 'ASA-Pool-01',
      type: 'Stake',
      tokenStaked: 'FRY-ALGO',
      amountStaked: '50 ASA',
      transactionFee: '05 FRY',
      rewards: '54 FRY',
      transactionHash: '0x9a5c...ad34',
    },
    {
      key: 3,
      dateTime: '2024-11-06 / 14:32',
      transactionId: 'STK-001',
      poolNameId: 'ASA-Pool-01',
      type: 'Stake',
      tokenStaked: 'FRY-ALGO',
      amountStaked: '50 ASA',
      transactionFee: '05 FRY',
      rewards: '54 FRY',
      transactionHash: '0x9a5c...ad34',
    },
    {
      key: 4,
      dateTime: '2024-11-06 / 14:32',
      transactionId: 'STK-001',
      poolNameId: 'ASA-Pool-01',
      type: 'Stake',
      tokenStaked: 'FRY-ALGO',
      amountStaked: '50 ASA',
      transactionFee: '05 FRY',
      rewards: '54 FRY',
      transactionHash: '0x9a5c...ad34',
    },
  ]

  return <Table<DataType> className="web-table" columns={columns} pagination={false} dataSource={data} scroll={{ x: '1000px' }} />
}

export default StakeTable
