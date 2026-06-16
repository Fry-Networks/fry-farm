import { Icon } from '@iconify/react'
import { Table } from 'antd'
import { useNavigate } from 'react-router-dom'

const data = [
  {
    key: '1',
    poolID: '01',
    poolName: 'userA',
    createdBy: '0xA1b2C3D4...',
    lpTokenPair: 'ASA-Token X/Y',
    rewardToken: '75 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '50,000 A',
    totalRewards: '10,000 B',
    activeParticipants: '120',
    fryFeesCollected: '200 FRY',
  },
  {
    key: '2',
    poolID: '02',
    poolName: 'userB',
    createdBy: '0xD5E6F7G8...',
    lpTokenPair: '200 ASA',
    rewardToken: '100 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '75,000 A',
    totalRewards: '12,000 B',
    activeParticipants: '150',
    fryFeesCollected: '300 FRY',
  },
  {
    key: '2',
    poolID: '03',
    poolName: 'userB',
    createdBy: '0xD5E6F7G8...',
    lpTokenPair: '200 ASA',
    rewardToken: '100 LP Tokens',
    farmingDuration: '2024/01/01 -- 2024/06/01',
    totalStaked: '75,000 A',
    totalRewards: '12,000 B',
    activeParticipants: '150',
    fryFeesCollected: '300 FRY',
  },
]

const FarmingList: React.FC = () => {
  const navigate = useNavigate()

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
    // {
    //   title: 'Action',
    //   key: 'action',
    //   render: () => <img src="../../assets/icons/eye.png" alt="View Details" className="cursor-pointer py-[15px]" />,
    // },
  ]

  return (
    <div className="flex flex-col gap-[32px] w-full px-[32px] py-[27px] bg-white rounded-[14px] shadow">
      <div className="flex justify-between items-center">
        <p className="elarge text-primary font-semibold">Farming List</p>
        <p
          className="text-red small flex items-center cursor-pointer"
          onClick={() => {
            navigate('/admin/farming')
          }}
        >
          View All <Icon icon="lsicon:right-filled" color="red" className="cursor-pointer" width={24} height={24} />
        </p>
      </div>
      <Table columns={columns} dataSource={data} className="w-full dash-table" pagination={false} scroll={{ x: '2000px' }} />
    </div>
  )
}

export default FarmingList
