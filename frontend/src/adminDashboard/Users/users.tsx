import { Icon } from '@iconify/react'
import { Table } from 'antd'
import { useNavigate } from 'react-router-dom'

interface UsersProps {
  showSearchBar?: boolean
  showviewALL?: boolean
  dataLimit?: number
  showPagination?: boolean
}

const data = [
  {
    key: '1',
    userID: '01',
    username: 'userA',
    walletAddress: '0xA1b2C3D4...',
    totalStaked: '150 ASA',
    totalFarmed: '75 LP Tokens',
    fryBalance: '200 FRY',
  },
  {
    key: '2',
    userID: '02',
    username: 'userB',
    walletAddress: '0xD5E6F7G8...',
    totalStaked: '200 ASA',
    totalFarmed: '100 LP Tokens',
    fryBalance: '300 FRY',
  },
  {
    key: '3',
    userID: '03',
    username: 'userC',
    walletAddress: '0xH9I10J11...',
    totalStaked: '250 ASA',
    totalFarmed: '125 LP Tokens',
    fryBalance: '400 FRY',
  },
  {
    key: '4',
    userID: '04',
    username: 'userD',
    walletAddress: '0xK12L13M14...',
    totalStaked: '300 ASA',
    totalFarmed: '150 LP Tokens',
    fryBalance: '500 FRY',
  },
  {
    key: '1',
    userID: '01',
    username: 'userA',
    walletAddress: '0xA1b2C3D4...',
    totalStaked: '150 ASA',
    totalFarmed: '75 LP Tokens',
    fryBalance: '200 FRY',
  },
  {
    key: '2',
    userID: '02',
    username: 'userB',
    walletAddress: '0xD5E6F7G8...',
    totalStaked: '200 ASA',
    totalFarmed: '100 LP Tokens',
    fryBalance: '300 FRY',
  },
  {
    key: '3',
    userID: '03',
    username: 'userC',
    walletAddress: '0xH9I10J11...',
    totalStaked: '250 ASA',
    totalFarmed: '125 LP Tokens',
    fryBalance: '400 FRY',
  },
  {
    key: '4',
    userID: '04',
    username: 'userD',
    walletAddress: '0xK12L13M14...',
    totalStaked: '300 ASA',
    totalFarmed: '150 LP Tokens',
    fryBalance: '500 FRY',
  },
]

const Users: React.FC<UsersProps> = ({ showSearchBar = true, showviewALL = false, dataLimit, showPagination = true }) => {
  const columns = [
    {
      title: 'User ID',
      dataIndex: 'userID',
      key: 'userID',
      render: (text: string) => <p className="text-primary small py-[15px]">{text}</p>,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Wallet Address',
      dataIndex: 'walletAddress',
      key: 'walletAddress',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Total Staked',
      dataIndex: 'totalStaked',
      key: 'totalStaked',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'Total Farmed',
      dataIndex: 'totalFarmed',
      key: 'totalFarmed',
      render: (text: string) => <p className="text-primary small">{text}</p>,
    },
    {
      title: 'FRY Balance',
      dataIndex: 'fryBalance',
      key: 'fryBalance',
      render: (text: string) => (
        <div className="flex items-center justify-between gap-[8px] pr-[30px]">
          <p className="text-primary small">{text}</p>
        </div>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'fryBalance',
      key: 'fryBalance',
      render: (text: string) => (
        <div className="flex items-center justify-between gap-[8px] pr-[30px]">
          <img
            src="../../assets/icons/eye.png"
            alt="Eye Icon"
            className="cursor-pointer"
            onClick={() => {
              navigate('/admin/user-detail/staking')
            }}
          />
        </div>
      ),
    },
  ]
  const navigate = useNavigate()
  const filteredData = dataLimit ? data.slice(0, dataLimit) : data

  return (
    <div className="flex flex-col gap-[32px] w-full px-[32px] py-[27px] bg-white rounded-[14px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
      <div className="flex justify-between  items-center gap-[10px] sm-s:flex-col ">
        <p className="elarge text-primary font-semibold">Users List</p>
        {showviewALL && (
          <p
            className="text-red small flex items-center cursor-pointer"
            onClick={() => {
              navigate('/admin/users')
            }}
          >
            View All <Icon icon="lsicon:right-filled" color="red" className="cursor-pointer" width={24} height={24} />
          </p>
        )}
        {showSearchBar && (
          <div className="max-w-[310px] w-full p-[8px] flex items-center gap-[8px] border-2 border-solid border-[#EDEDED] rounded-[12px] bg-white ">
            <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
            <input type="search" placeholder="Search User" className="w-full" />
          </div>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={filteredData}
        className="w-full dash-table"
        scroll={{ x: '1000px' }}
        pagination={
          showPagination
            ? {
                position: ['bottomCenter'],
                pageSize: 6,
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
              }
            : false
        }
      />
    </div>
  )
}

export default Users
