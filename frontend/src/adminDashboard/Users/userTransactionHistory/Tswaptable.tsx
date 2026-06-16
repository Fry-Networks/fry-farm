import type { TableColumnsType } from 'antd'
import { Table } from 'antd'
import React from 'react'

interface DataType {
  key: React.Key
  dateTime: string
  swapId: string
  fromToken: React.ReactNode
  toToken: React.ReactNode
  amountSwapped: string
  swapRate: string
  transactionHash: string
}

const TSwapTable: React.FC = () => {
  const columns: TableColumnsType<DataType> = [
    {
      title: 'Date/Time',
      dataIndex: 'dateTime',
      key: 'dateTime',
      render: (value) => <p className="text-text_clr font-medium py-[28px]">{value}</p>,
    },
    {
      title: 'Swap ID',
      dataIndex: 'swapId',
      key: 'swapId',
      render: (value) => <p className="text-text_clr font-medium small">{value}</p>,
    },
    {
      title: 'From Token',
      dataIndex: 'fromToken',
      key: 'fromToken',
      render: (value) => (
        <p className="text-text_clr small font-medium flex items-center gap-2">
          {value}
          <span>ALGO</span>
        </p>
      ),
    },
    {
      title: 'To Token',
      dataIndex: 'toToken',
      key: 'toToken',
      render: (value) => (
        <>
          <div className="flex">
            <div className="flex mr-[-5px]">
              <img src="../../assets/icons/XRP.png" alt="BTC" className="w-[24px] h-[24px] drop-shadow-md" />
              <img src="../../assets/icons/algo.png" alt="BTC" className="w-[24px] h-[24px] drop-shadow-md relative right-[10px] z-[1]" />
            </div>
            <p className="text-text_clr small font-medium flex items-center gap-2">
              {value}
              <span>ASA-USD</span>
            </p>
          </div>
        </>
      ),
    },
    {
      title: 'Amount Swapped',
      dataIndex: 'amountSwapped',
      key: 'amountSwapped',
      render: (value) => <p className="text-text_clr small font-medium">{value}</p>,
    },
    {
      title: 'Swap Rate',
      dataIndex: 'swapRate',
      key: 'swapRate',
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
      swapId: 'SWP-001',
      fromToken: <img src="../../assets/icons/algo.png" alt="ALGO" className="w-6 h-6" />,
      toToken: '',
      amountSwapped: '50 ASA-USD',
      swapRate: '50 ASA-USD',
      transactionHash: '0x9a5c...ad34',
    },
    {
      key: 2,
      dateTime: '2024-11-06 / 14:32',
      swapId: 'SWP-001',
      fromToken: <img src="../../assets/icons/algo.png" alt="ALGO" className="w-6 h-6" />,
      toToken: '',
      amountSwapped: '50 ASA-USD',
      swapRate: '50 ASA-USD',
      transactionHash: '0x9a5c...ad34',
    },
    {
      key: 3,
      dateTime: '2024-11-06 / 14:32',
      swapId: 'SWP-001',
      fromToken: <img src="../../assets/icons/algo.png" alt="ALGO" className="w-6 h-6" />,
      toToken: '',
      amountSwapped: '50 ASA-USD',
      swapRate: '50 ASA-USD',
      transactionHash: '0x9a5c...ad34',
    },
    {
      key: 4,
      dateTime: '2024-11-06 / 14:32',
      swapId: 'SWP-001',
      fromToken: <img src="../../assets/icons/algo.png" alt="ALGO" className="w-6 h-6" />,
      toToken: '',
      amountSwapped: '50 ASA-USD',
      swapRate: '50 ASA-USD',
      transactionHash: '0x9a5c...ad34',
    },
  ]

  return <Table<DataType> className="w-full dash-table" columns={columns} pagination={false} dataSource={data} scroll={{ x: '1400px' }} />
}

export default TSwapTable
