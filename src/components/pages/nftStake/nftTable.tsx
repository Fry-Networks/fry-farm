import { Icon } from '@iconify/react'
import { Table } from 'antd'
import type { TableColumnsType } from 'antd'
import React, { memo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import Button from '../../shared/button'
import { useAuth } from '../../../hooks/useAuth'
import { useChain } from '../../../context/ChainContext'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import NftStakeModal from '../../../Modals/website/NftStakeModal'
import NftUnstakeModal from '../../../Modals/website/NftUnstakeModal'
import NftClaimModal from '../../../Modals/website/NftClaimModal'
import type { NftStakingPool } from '../../../types/nftStaking'

const REWARD_MODELS = ['Fixed Rate', 'Proportional', 'APR']

interface PoolRow {
  key: React.Key
  pool: NftStakingPool
  poolDisplay: React.ReactNode
  nftsStaked: number
  rewardModel: string
  rewardInfo: string
  ends: React.ReactNode
}

interface NftTableProps {
  pools: NftStakingPool[]
  fetchData: () => Promise<void>
  tokenImages: Record<string, string>
  activeTab: string
}

const NftTable: React.FC<NftTableProps> = memo(({ pools, fetchData, tokenImages, activeTab }) => {
  const { ensureAuth } = useAuth()
  const { activeAddress, signer } = useMultiChainWallet()
  const { activeChain } = useChain()
  const navigate = useNavigate()

  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [stakeModalOpen, setStakeModalOpen] = useState(false)
  const [unstakeModalOpen, setUnstakeModalOpen] = useState(false)
  const [claimModalOpen, setClaimModalOpen] = useState(false)
  const [selectedPool, setSelectedPool] = useState<NftStakingPool | null>(null)

  const handleToggleExpand = (key: React.Key) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [key],
    )
  }

  const openStakeModal = (pool: NftStakingPool) => {
    if (!activeAddress) {
      toast.error('Please connect your wallet first')
      return
    }
    setSelectedPool(pool)
    setStakeModalOpen(true)
  }

  const openUnstakeModal = (pool: NftStakingPool) => {
    if (!activeAddress) {
      toast.error('Please connect your wallet first')
      return
    }
    setSelectedPool(pool)
    setUnstakeModalOpen(true)
  }

  const openClaimModal = (pool: NftStakingPool) => {
    if (!activeAddress) {
      toast.error('Please connect your wallet first')
      return
    }
    setSelectedPool(pool)
    setClaimModalOpen(true)
  }

  const getRewardInfo = (pool: NftStakingPool): string => {
    switch (pool.rewardModel) {
      case 0:
        return `${pool.ratePerDay.toLocaleString()} ${pool.rewardTokenName}/day`
      case 1:
        return `${pool.totalRewardPool.toLocaleString()} ${pool.rewardTokenName} total`
      case 2:
        return `${(pool.aprRate / 100).toFixed(2)}% APR`
      default:
        return ''
    }
  }

  const dataSource: PoolRow[] = pools.map((pool, index) => {
    const now = Math.floor(Date.now() / 1000)
    const secondsLeft = pool.poolEndTime ? pool.poolEndTime - now : 0
    const daysLeft = Math.floor(secondsLeft / 86400)

    const rewardTokenImage = tokenImages[pool.rewardTokenId?.toString()] ||
      pool.rewardTokenImage ||
      (activeChain.chainId === 'voi-mainnet' ? '' : `https://asa-list.tinyman.org/assets/${pool.rewardTokenId}/icon.png`)

    return {
      key: index,
      pool,
      poolDisplay: (
        <div className="flex items-center gap-[16px] w-[350px]">
          <div className="flex relative">
            {pool.poolImage ? (
              <img
                src={pool.poolImage}
                className="w-[40px] h-[40px] rounded-full drop-shadow-md"
                alt={pool.poolName}
                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI0U1RTlFQSIvPjwvc3ZnPg==' }}
              />
            ) : (
              <div className="w-[40px] h-[40px] rounded-full bg-gray-200 flex items-center justify-center">
                <Icon icon="mdi:image" width={20} color="#999" />
              </div>
            )}
            <img
              src={rewardTokenImage}
              className="w-[24px] h-[24px] rounded-full drop-shadow-md absolute -bottom-1 -right-1 border-2 border-white"
              alt={pool.rewardTokenName}
              onError={(e) => { if (activeChain.chainId !== 'voi-mainnet') (e.target as HTMLImageElement).src = `https://asa-list.tinyman.org/assets/${pool.rewardTokenId}/icon.png` }}
            />
          </div>
          <div className="flex flex-col">
            <h6 className="text-[var(--text-primary)] font-bold tracking-[0.1px]">{pool.poolName || 'NFT Pool'}</h6>
            <p className="text-green font-medium small">Earn {pool.rewardTokenName}</p>
            {pool.lockPeriod > 0 && (
              <p className="text-text_clr small">with {pool.lockPeriod / 86400} days lock</p>
            )}
          </div>
        </div>
      ),
      nftsStaked: pool.totalNftsStaked,
      rewardModel: REWARD_MODELS[pool.rewardModel] || 'Unknown',
      rewardInfo: getRewardInfo(pool),
      ends: (
        <p className="text-text_clr small font-medium">
          {pool.poolEndTime ? (daysLeft >= 0 ? `${Math.max(daysLeft, 1)} ${Math.max(daysLeft, 1) === 1 ? 'day' : 'days'}` : 'Ended') : 'No end'}
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
      title: 'NFTs Staked',
      dataIndex: 'nftsStaked',
      key: 'nftsStaked',
      sorter: (a, b) => a.nftsStaked - b.nftsStaked,
      render: (value) => <p className="text-text_clr font-medium medium">{value}</p>,
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
                      {/* Left */}
                      <div className="flex flex-col gap-[4px]">
                        <a
                          href={`${activeChain.explorerBaseUrl}/application/${record.pool.appId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                        >
                          View Contract
                        </a>
                      </div>

                      {/* Right */}
                      <div className="flex gap-[24px] w-full justify-end">
                        <div className="flex gap-[10px]">
                          <Button
                            text="Stake NFT"
                            className="button btn-primary"
                            height={45}
                            width={120}
                            onClick={() => openStakeModal(record.pool)}
                          />
                          <Button
                            text="Unstake"
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
                            onClick={() => navigate(`/nft-pool-stats?appId=${record.pool.appId}`)}
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
          <NftStakeModal
            visible={stakeModalOpen}
            onClose={() => { setStakeModalOpen(false); setSelectedPool(null) }}
            onSuccess={async () => { setStakeModalOpen(false); setSelectedPool(null); await fetchData() }}
            pool={selectedPool}
          />
          <NftUnstakeModal
            visible={unstakeModalOpen}
            onClose={() => { setUnstakeModalOpen(false); setSelectedPool(null) }}
            onSuccess={async () => { setUnstakeModalOpen(false); setSelectedPool(null); await fetchData() }}
            pool={selectedPool}
          />
          <NftClaimModal
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

export default NftTable
