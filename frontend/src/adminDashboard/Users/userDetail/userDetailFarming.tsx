import { Icon } from '@iconify/react'
import { Table } from 'antd'
import { useState } from 'react'

interface DataType {
  key: React.Key
  pool: React.ReactNode
  tvl: string
  apr: string
  staked: string
  reward: React.ReactNode
  ends: React.ReactNode
}

const UserDetailFarming: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Created' | 'Invested'>('Created')

  const columns = [
    { title: 'Pool', dataIndex: 'pool', key: 'pool' },
    {
      title: <div className="flex items-center gap-[2px]">TVL</div>,
      dataIndex: 'tvl',
      key: 'tvl',
      render: (value: string) => <p className="text-text_clr font-medium medium">{value}</p>,
    },
    { title: 'APR', dataIndex: 'apr', key: 'apr', render: (value: string) => <p className="text-text_clr font-medium medium">{value}</p> },
    {
      title: 'Staked',
      dataIndex: 'staked',
      key: 'staked',
      render: (value: string) => <p className="text-text_clr font-medium medium">{value}</p>,
    },
    {
      title: 'Reward',
      dataIndex: 'reward',
      key: 'reward',
      render: (value: React.ReactNode) => value,
    },
    {
      title: 'Ends',
      dataIndex: 'ends',
      key: 'ends',
      render: () => (
        <div className="flex items-center justify-between">
          <div className="max-w-[71px]">
            <p className="text-text_clr medium leading-[27px] ">ends in 6 days</p>
          </div>
        </div>
      ),
    },
  ]

  // Data for Created Pool
  const dataCreated: DataType[] = [
    {
      key: 1,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>
          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$154.00',
      apr: '0.019%',
      staked: '$0',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            4,901 <span className="font-normal">0 Choice</span>
            <span className="font-normal">0 Choice</span>
          </p>
        </div>
      ),
      ends: null,
    },
    {
      key: 2,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>

          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$154.00',
      apr: '0.019%',
      staked: '$0',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            4,901 <span className="font-normal">0 Choice</span>
            <span className="font-normal">0 Choice</span>
          </p>
        </div>
      ),
      ends: null,
    },
    {
      key: 3,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>

          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$154.00',
      apr: '0.019%',
      staked: '$0',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            4,901 <span className="font-normal">0 Choice</span>
            <span className="font-normal">0 Choice</span>
          </p>
        </div>
      ),
      ends: null,
    },
    {
      key: 4,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>

          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$154.00',
      apr: '0.019%',
      staked: '$0',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            4,901 <span className="font-normal">0 Choice</span>
            <span className="font-normal">0 Choice</span>
          </p>
        </div>
      ),
      ends: null,
    },
  ]

  // Data for Invested Pool
  const dataInvested: DataType[] = [
    {
      key: 2,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>

          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$200.00',
      apr: '0.015%',
      staked: '$100',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            3,200 <span className="font-normal">0 ETH</span>
          </p>
        </div>
      ),
      ends: null,
    },
    {
      key: 2,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>

          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$200.00',
      apr: '0.015%',
      staked: '$100',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            3,200 <span className="font-normal">0 ETH</span>
          </p>
        </div>
      ),
      ends: null,
    },
    {
      key: 2,
      pool: (
        <div className="flex items-center gap-[16px]">
          <div className="flex mr-[-30px]">
            <img src="../../assets/icons/Bitcoin.png" alt="BTC" className="w-[40px] h-[40px] drop-shadow-md" />
            <img
              src="../../assets/icons/eth-black.png"
              alt="BTC"
              className="w-[40px] h-[40px] drop-shadow-md relative right-[20px] z-[1]"
            />
            <img
              src="../../assets/icons/dex.png"
              alt="BTC"
              className="w-[20px] h-[20px] drop-shadow-md relative right-[33px] top-[-4px] z-[1]"
            />
          </div>

          <div className="flex flex-col">
            <p className="text-black font-bold large tracking-[0.1px]">Stake BTC</p>
            <p className="text-green font-medium e-small">Earn BTC</p>
            <p className="text-text_clr e-small">with 30 days lock</p>
          </div>
        </div>
      ),
      tvl: '$200.00',
      apr: '0.015%',
      staked: '$100',
      reward: (
        <div className="flex items-center justify-between">
          <p className="text-text_clr font-medium medium flex flex-col leading-[27px]">
            3,200 <span className="font-normal">0 ETH</span>
          </p>
        </div>
      ),
      ends: null,
    },
  ]

  return (
    <div className="flex flex-col items-center gap-[12px] w-full">
      {/* Tab Switcher */}
      <div className="switcher flex justify-center items-center gap-[3px] w-fit p-[3px] bg-white rounded-[6px] shadow-[4px_4px_24.2px_0px_rgba(0,60,82,0.15)]">
        <p
          onClick={() => setActiveTab('Created')}
          className={`text-center font-semibold flex items-center justify-center cursor-pointer tracking-[0.09px] rounded-[4px] w-[150px] h-[35px] ${
            activeTab === 'Created' ? 'text-white bg-darkRed shadow-[0px_4px_24.2px_rgba(0,60,82,0.10)]' : 'text-[#8E8E8E]'
          }`}
        >
          Created Pool
        </p>
        <p
          onClick={() => setActiveTab('Invested')}
          className={`text-center font-semibold flex items-center justify-center cursor-pointer tracking-[0.09px] rounded-[4px] w-[150px] h-[35px] ${
            activeTab === 'Invested' ? 'text-white bg-darkRed shadow-[0px_4px_24.2px_rgba(0,60,82,0.10)]' : 'text-[#8E8E8E]'
          }`}
        >
          Invested Pool
        </p>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={activeTab === 'Created' ? dataCreated : dataInvested}
        className="w-full dash-table"
        pagination={{
          position: ['bottomCenter'],
          pageSize: 5,
          itemRender: (current, type, originalElement) => {
            if (type === 'prev') {
              return (
                <div className="bg-[#ffe6e6] w-[36px] h-[36px] rounded-[9px] flex items-center justify-center">
                  <Icon icon="ep:arrow-left-bold" color="#FF0000" />
                </div>
              )
            }
            if (type === 'next') {
              return (
                <div className="bg-[#ffe6e6] w-[36px] h-[36px] rounded-[9px] flex items-center justify-center">
                  <Icon icon="ep:arrow-right-bold" color="#FF0000" />
                </div>
              )
            }
            return originalElement
          },
          showSizeChanger: false,
        }}
        scroll={{ x: '1000px' }}
      />
    </div>
  )
}

export default UserDetailFarming
