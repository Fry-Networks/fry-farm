import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import { Table } from 'antd'
import type { TableColumnsType } from 'antd'
import React, { memo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import Button from '../../shared/button'
import { useAuth } from '../../../hooks/useAuth'
import DeviceStakeModal from '../../../Modals/website/DeviceStakeModal'
import DeviceUnstakeModal from '../../../Modals/website/DeviceUnstakeModal'
import DeviceClaimModal from '../../../Modals/website/DeviceClaimModal'
import type { DevicePool } from '../../../types/deviceStaking'
import { useChain } from '../../../context/ChainContext'

const REWARD_MODELS: Record<string, string> = {
  fixed_rate: 'Fixed Rate',
  proportional: 'Proportional',
  apr: 'APR',
}

interface PoolRow {
  key: React.Key
  pool: DevicePool
  poolDisplay: React.ReactNode
  devicesStaked: number
  rewardModel: string
  rewardInfo: string
  stakingMode: React.ReactNode
  ends: React.ReactNode
}

interface DeviceTableProps {
  pools: DevicePool[]
  fetchData: () => Promise<void>
  tokenImages: Record<string, string>
  activeTab: string
}

const DeviceTable: React.FC<DeviceTableProps> = memo(({ pools, fetchData, tokenImages, activeTab }) => {
  const { ensureAuth } = useAuth()
  const { activeAddress, signer } = useWallet()
  const { chainId } = useChain()
  const navigate = useNavigate()

  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [unstakeModalOpen, setUnstakeModalOpen] = useState(false)
  const [claimModalOpen, setClaimModalOpen] = useState(false)
  const [selectedPool, setSelectedPool] = useState<DevicePool | null>(null)

  const handleToggleExpand = (key: React.Key) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [key],
    )
  }

  const openStakeModal = (pool: DevicePool) => {
    if (!activeAddress) {
      toast.error('Please connect your wallet first')
      return
    }
    setSelectedPool(pool)
    setStakeModalOpen(true)
  }

  const openUnstakeModal = (pool: DevicePool) => {
    if (!activeAddress) {
      toast.error('Please connect your wallet first')
      return
    }
    setSelectedPool(pool)
    setUnstakeModalOpen(true)
  }

  const openClaimModal = (pool: DevicePool) => {
    if (!activeAddress) {
      toast.error('Please connect your wallet first')
      return
    }
    setSelectedPool(pool)
    setClaimModalOpen(true)
  }

  const getRewardInfo = (pool: DevicePool): string => {
    const symbol = pool.rewardToken?.symbol || ''
    switch (pool.rewardModel) {
      case 'fixed_rate':
        return `${((pool.rewardPerDay || 0) / 1_000_000).toLocaleString()} ${symbol}/day`
      case 'proportional':
        return `${((pool.dailyPoolReward || 0) / 1_000_000).toLocaleString()} ${symbol} daily`
      case 'apr':
        return `${((pool.apr || 0) / 100).toFixed(2)}% APR`
      default:
        return ''
    }
  }

  const dataSource: PoolRow[] = pools.map((pool, index) => {
    const now = new Date()
    const endDate = pool.endDate ? new Date(pool.endDate) : null
    const daysLeft = endDate ? Math.floor((endDate.getTime() - now.getTime()) / 86400000) : 0

    const rewardTokenImage = tokenImages[pool.rewardTokenId?.toString()] ||
      pool.rewardToken?.image ||
      (chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${pool.rewardTokenId}/icon.png`)

    return {
      key: index,
      pool,
      poolDisplay: (
        <div className="flex items-center gap-[16px] w-[350px]">
          <div className="flex relative">
            {pool.imageUrl ? (
              <img
                src={pool.imageUrl}
                className="w-[40px] h-[40px] rounded-full drop-shadow-md"
                alt={pool.name}
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjwvc3ZnPg==' }}
              />
            ) : (
              <div className="w-[40px] h-[40px] rounded-full bg-gray-200 flex items-center justify-center">
                <Icon icon="mdi:devices" width={20} color="#999" />
              </div>
            )}
            <img
              src={rewardTokenImage}
              className="w-[24px] h-[24px] rounded-full drop-shadow-md absolute -bottom-1 -right-1 border-2 border-white"
              alt={pool.rewardToken?.symbol}
              onError={(e) => { (e.target as HTMLImageElement).src = chainId === 'voi-mainnet' ? 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMiIgZmlsbD0iI0U1RTlFQSIvPjwvc3ZnPg==' : `https://asa-list.tinyman.org/assets/${pool.rewardTokenId}/icon.png` }}
            />
          </div>
          <div className="flex flex-col">
            <h6 className="text-[var(--text-primary)] font-bold tracking-[0.1px]">{pool.name || 'DePIN Pool'}</h6>
            <p className="text-green font-medium small">Earn {pool.rewardToken?.symbol}</p>
            {pool.lockPeriod > 0 && (
              <p className="text-text_clr small">with {pool.lockPeriod / 86400} days lock</p>
            )}
          </div>
        </div>
      ),
      devicesStaked: pool.totalStaked || 0,
      rewardModel: REWARD_MODELS[pool.rewardModel] || 'Unknown',
      rewardInfo: getRewardInfo(pool),
      stakingMode: (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          pool.stakingMode === 'verified-hold'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        }`}>
          {pool.stakingMode === 'verified-hold' ? 'Keep Your NFT' : 'Lock NFT'}
        </span>
      ),
      ends: (
        <p className="text-text_clr small font-medium">
          {endDate ? (daysLeft >= 0 ? `${Math.max(daysLeft, 1)} ${Math.max(daysLeft, 1) === 1 ? 'day' : 'days'}` : 'Ended') : 'No end'}
        </p>
      ),
    }
  })

  const columns: TableColumnsType<PoolRow> = [
    {
      title: <div className="w-[350px]">Pool</div>,
      dataIndex: 'poolDisplay',
      key: 'pool',
    },
    {
      title: 'DePINs',
      dataIndex: 'devicesStaked',
      key: 'devicesStaked',
      sorter: (a, b) => a.devicesStaked - b.devicesStaked,
      render: (value) => <p className="text-text_clr font-medium medium">{value}</p>,
    },
    {
      title: 'Mode',
      dataIndex: 'stakingMode',
      key: 'stakingMode',
    },
    {
      title: 'Model',
      dataIndex: 'rewardModel',
      key: 'rewardModel',
      render: (value) => <p className="text-text_clr font-medium medium">{value}</p>,
    },
    {
      title: 'Reward',
      dataIndex: 'rewardInfo',
      key: 'rewardInfo',
      render: (value) => <p className="text-text_clr font-medium medium">{value}</p>,
    },
    ...(activeTab !== 'All'
      ? [
          {
            title: 'ENDS',
            dataIndex: 'ends',
            key: 'ends',
            render: (value: React.ReactNode, record: PoolRow) => (
              <div className="flex items-center justify-between gap-[20px]">
                <div className="max-w-[71px]">{value}</div>
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
      : []),
  ]

  return (
    <>
      <Table<PoolRow>
        className="web-table"
        columns={columns}
        pagination={false}
        expandable={
          activeTab !== 'All'
            ? {
                expandedRowRender: (record) => (
                  <div className="expandable">
                    <div className="flex items-center gap-[10px] justify-between pr-[50px] max-xxxl:pr-[0px]">
                      <div className="flex flex-col gap-[4px]">
                        <a
                          href={`https://explorer.perawallet.app/application/${record.pool.appId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                        >
                          View Contract
                        </a>
                        {record.pool.requirements?.length > 0 && (
                          <span className="text-xs text-yellow-500">{record.pool.requirements.length} requirement(s)</span>
                        )}
                      </div>

                      <div className="flex gap-[24px] w-full justify-end">
                        <div className="flex gap-[10px]">
                          <Button
                            text={record.pool.stakingMode === 'verified-hold' ? 'Register' : 'Stake NFT'}
                            className="button btn-primary"
                            height={45}
                            width={120}
                            onClick={() => openStakeModal(record.pool)}
                          />
                          <Button
                            text={record.pool.stakingMode === 'verified-hold' ? 'Unregister' : 'Unstake'}
                            className="button btn-primary"
                            height={45}
                            width={106}
                            onClick={() => openUnstakeModal(record.pool)}
                          />
                          {activeAddress && (
                            <Button
                              text="Claim"
                              className="button btn-primary"
                              height={45}
                              width={106}
                              onClick={() => openClaimModal(record.pool)}
                            />
                          )}
                          <Button
                            text="View details"
                            className="button btn-red-border"
                            height={45}
                            width={128}
                            onClick={() => navigate(`/device-pool-stats?appId=${record.pool.appId}`)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ),
                rowExpandable: () => true,
                expandedRowKeys: expandedKeys,
              }
            : undefined
        }
        expandIconColumnIndex={-1}
        dataSource={dataSource}
        scroll={{ x: '1000px' }}
      />

      {selectedPool && (
        <>
          <DeviceStakeModal
            visible={stakeModalOpen}
            onClose={() => { setStakeModalOpen(false); setSelectedPool(null) }}
            onSuccess={async () => { setStakeModalOpen(false); setSelectedPool(null); await fetchData() }}
            pool={selectedPool}
          />
          <DeviceUnstakeModal
            visible={unstakeModalOpen}
            onClose={() => { setUnstakeModalOpen(false); setSelectedPool(null) }}
            onSuccess={async () => { setUnstakeModalOpen(false); setSelectedPool(null); await fetchData() }}
            pool={selectedPool}
          />
          <DeviceClaimModal
            visible={claimModalOpen}
            onClose={() => { setClaimModalOpen(false); setSelectedPool(null) }}
            onSuccess={async () => { setClaimModalOpen(false); setSelectedPool(null); await fetchData() }}
            pool={selectedPool}
          />
        </>
      )}
    </>
  )
})

export default DeviceTable
