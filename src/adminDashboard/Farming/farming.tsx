import { Icon } from '@iconify/react'
import { Table } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/shared/button'
import DelModal from '../../Modals/Dashboard/delModal'
import FarmingDetailApproved from '../../Modals/Dashboard/farmingDetailsApproved'
import FarmingDetailPending from '../../Modals/Dashboard/farmingDetailsPending'

const dataPending = [
  {
    key: '1',
    poolID: '01',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Pending',
  },
  {
    key: '2',
    poolID: '02',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Pending',
  },
  {
    key: '3',
    poolID: '03',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Pending',
  },
  {
    key: '4',
    poolID: '04',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Pending',
  },
  {
    key: '5',
    poolID: '03',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Pending',
  },
]
const dataApproved = [
  {
    key: '1',
    poolID: '01',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Approved',
  },
  {
    key: '2',
    poolID: '02',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Approved',
  },
  {
    key: '3',
    poolID: '03',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Approved',
  },
  {
    key: '4',
    poolID: '04',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Approved',
  },
  {
    key: '5',
    poolID: '03',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: '150 ASA',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
    status: 'Approved',
  },
]

const Farming: React.FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'Pending' | 'Approved'>('Pending')
  const [ispendingfarmOpen, setispendingfarmOpen] = useState(false)
  const [isapprovedfarmOpen, setisapprovedfarmOpen] = useState(false)
  const [isdelModalOpen, setIsdelModalOpen] = useState(false)
  const onDelClick = () => {
    setIsdelModalOpen(true)
  }
  const onPendingeyeClick = () => {
    setispendingfarmOpen(true)
  }
  const onApprovedeyeClick = () => {
    setisapprovedfarmOpen(true)
  }
  const columns = [
    {
      title: 'Pool ID',
      dataIndex: 'poolID',
      key: 'poolID',
      render: (text: string) => <p className="text-primary small py-[15px]">{text}</p>,
    },
    {
      title: 'Pool Name',
      dataIndex: 'poolName',
      key: 'poolName',
      render: (text: string) => <p className="text-primary small py-[15px]">{text}</p>,
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'LP Token Pair',
      dataIndex: 'lpTokenPair',
      key: 'lpTokenPair',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Reward Token',
      dataIndex: 'rewardToken',
      key: 'rewardToken',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Farming Duration',
      dataIndex: 'farmingDuration',
      key: 'farmingDuration',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Total LP Staked',
      dataIndex: 'totalStaked',
      key: 'totalStaked',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Total Rewards',
      dataIndex: 'totalRewards',
      key: 'totalRewards',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Active Participants',
      dataIndex: 'activeParticipants',
      key: 'activeParticipants',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Fry Fees Collected',
      dataIndex: 'fryFeesCollected',
      key: 'fryFeesCollected',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (text: string) =>
        activeTab === 'Pending' ? <p className="text-txtPending small">{text}</p> : <p className="text-green small">{text}</p>,
    },
    {
      title: 'Actions',
      key: 'action',
      render: (record: any) =>
        activeTab === 'Pending' ? (
          <div className="flex items-center gap-[10px]">
            <div className="flex gap-[10px]">
              <img src="../../assets/icons/eye.png" alt="View Details" className="cursor-pointer py-[15px]" onClick={onPendingeyeClick} />
              <img src="../../assets/icons/del.png" alt="Delete" className="cursor-pointer py-[15px]" onClick={onDelClick} />
            </div>
            <div className="w-[1px] h-[20px] bg-[#BEB5B5]"></div>
            <Button text="Approved" className="button btn-red" height={38} width={99} />
          </div>
        ) : (
          <div className="flex items-center gap-[10px]">
            <img src="../../assets/icons/eye.png" alt="View Details" className="cursor-pointer py-[15px]" onClick={onApprovedeyeClick} />
            <img src="../../assets/icons/del.png" alt="Delete" className="cursor-pointer py-[15px]" onClick={onDelClick} />
            <Button
              text="View Statistcs"
              className="button btn-red"
              height={38}
              width={99}
              onClick={() => {
                navigate('/admin/farming-statistics')
              }}
            />
          </div>
        ),
    },
  ]

  return (
    <>
      <div className="flex flex-col gap-[32px] w-full px-[32px] py-[27px] bg-white rounded-[14px] shadow">
        {/* top */}
        <div className="flex flex-col gap-[12px]  sm-s:items-center sm-s:w-full">
          <div className="flex justify-between items-center gap-[10px] sm-s:flex-col sm-s:w-full">
            <p className="elarge text-primary font-semibold">Farming Pool</p>
            <div className="max-w-[310px] w-full p-[8px] flex items-center gap-[8px] border-2 border-solid border-[#EDEDED] rounded-[12px] bg-white">
              <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
              <input type="search" placeholder="Search Farming Pool" className="w-full" />
            </div>
          </div>
          <div className="switcher flex justify-center items-center gap-[3px] w-fit p-[3px] bg-white rounded-[6px] shadow-[4px_4px_24.2px_0px_rgba(0,60,82,0.15)]">
            <p
              onClick={() => setActiveTab('Pending')}
              className={`text-center font-semibold flex items-center justify-center cursor-pointer tracking-[0.09px] rounded-[4px] w-[150px] h-[35px] ${
                activeTab === 'Pending' ? 'text-white bg-darkRed shadow-[0px_4px_24.2px_rgba(0,60,82,0.10)]' : 'text-[#8E8E8E]'
              }`}
            >
              Pending Approval
            </p>
            <p
              onClick={() => setActiveTab('Approved')}
              className={`text-center font-semibold flex items-center justify-center cursor-pointer tracking-[0.09px] rounded-[4px] w-[150px] h-[35px] ${
                activeTab === 'Approved' ? 'text-white bg-darkRed shadow-[0px_4px_24.2px_rgba(0,60,82,0.10)]' : 'text-[#8E8E8E]'
              }`}
            >
              Approved
            </p>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={activeTab === 'Pending' ? dataPending : dataApproved}
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
          scroll={{ x: '2000px' }}
        />
      </div>

      <DelModal isdelModalOpen={isdelModalOpen} setIsdelModalOpen={setIsdelModalOpen} />
      <FarmingDetailApproved isapprovedfarmOpen={isapprovedfarmOpen} setisapprovedfarmOpen={setisapprovedfarmOpen} />
      <FarmingDetailPending ispendingfarmOpen={ispendingfarmOpen} setispendingfarmOpen={setispendingfarmOpen} />
    </>
  )
}

export default Farming
