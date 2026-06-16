import { Icon } from '@iconify/react'
import { useWallet } from '@txnlab/use-wallet'
import { Spin } from 'antd'
import React, { useEffect, useState } from 'react'
import CreateDevicePoolWizard from '../../../Modals/website/CreateDevicePoolWizard'
import Button from '../../shared/button'
import DeviceTable from './deviceTable'
import { getAllDevicePools } from '../../../services/deviceStakingApi'
import { tokenServiceInstance as tokenService } from '../../../services/TokenService'
import type { DevicePool } from '../../../types/deviceStaking'

type TabOption = 'MyLive' | 'MyEnded' | 'Live' | 'Ended' | 'All'

const DeviceStakeTable: React.FC = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [pools, setPools] = useState<DevicePool[]>([])
  const [filteredPools, setFilteredPools] = useState<DevicePool[]>([])
  const [activeTab, setActiveTab] = useState<TabOption>('Live')
  const [loading, setLoading] = useState(true)
  const [searchToken, setSearchToken] = useState('')
  const [tokenImages, setTokenImages] = useState<Record<string, string>>({})

  const { activeAddress } = useWallet()

  const fetchPools = async () => {
    try {
      const [data, tokens] = await Promise.all([
        getAllDevicePools(),
        tokenService.fetchAllTokens(),
      ])

      const imageMap: Record<string, string> = {}
      tokens.forEach((token) => {
        if (token.image) imageMap[token.id.toString()] = token.image
      })
      setTokenImages(imageMap)

      setPools(data)
    } catch (error) {
      console.error('Error fetching device pools:', error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchPools()
      setLoading(false)
    }
    loadData()
  }, [])

  useEffect(() => {
    const now = new Date()

    const filtered = pools.filter((pool) => {
      const endDate = pool.endDate ? new Date(pool.endDate) : null
      const isEnded = endDate ? endDate <= now : false
      const isLive = pool.status === 'active' && (!endDate || endDate > now)
      const belongsToWallet = pool.creator?.toLowerCase() === activeAddress?.toLowerCase()

      switch (activeTab) {
        case 'MyLive':
          return isLive && belongsToWallet
        case 'MyEnded':
          return isEnded && belongsToWallet
        case 'Live':
          return isLive
        case 'Ended':
          return isEnded
        case 'All':
          return true
        default:
          return true
      }
    })

    const searched = searchToken.trim()
      ? filtered.filter(
          (p) =>
            p.name?.toLowerCase().includes(searchToken.toLowerCase()) ||
            p.rewardToken?.symbol?.toLowerCase().includes(searchToken.toLowerCase()) ||
            p.collectionCreator?.toLowerCase().includes(searchToken.toLowerCase()),
        )
      : filtered

    setFilteredPools(searched)
  }, [pools, activeTab, activeAddress, searchToken])

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchToken(event.target.value)
  }

  return (
    <>
      <div className="w-full mt-[40px] mb-[47px] flex-1">
        <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col gap-[16px]">
          {/* Tabs */}
          <div className="top flex max-md:flex-col justify-between items-center gap-[20px]">
            <div className="flex w-full justify-center md:justify-start">
              <div className="switcher flex flex-wrap justify-center md:flex-nowrap gap-[8px] p-[8px] bg-[var(--bg-card)] rounded-[12px] shadow-[0px_4px_24.2px_0px_var(--shadow-color)] overflow-x-auto max-w-full">
                {(['MyLive', 'MyEnded', 'Live', 'Ended', 'All'] as TabOption[]).map((tab) => {
                  const isMyTab = tab === 'MyLive' || tab === 'MyEnded'
                  const isDisabled = isMyTab && !activeAddress
                  return (
                    <p
                      key={tab}
                      className={`${
                        activeTab === tab
                          ? 'text-white linearGradient shadow-md'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                      } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-center text-center tracking-[0.09px] rounded-[10px] px-[16px] min-w-[120px] h-[40px] text-[14px] whitespace-nowrap transition-all duration-200`}
                      onClick={() => !isDisabled && setActiveTab(tab)}
                    >
                      {{
                        MyLive: 'My Live',
                        MyEnded: 'My Ended',
                        Live: 'Live Pools',
                        Ended: 'Ended Pools',
                        All: 'All Pools',
                      }[tab]}
                    </p>
                  )
                })}
              </div>
            </div>

            {/* Search + Create */}
            <div className="flex flex-col md:items-end gap-[14px] w-full">
              <div className="flex justify-center md:justify-end">
                <Button
                  text="Create DePIN Pool"
                  onClick={() => setIsCreateOpen(true)}
                  img="ic:sharp-add"
                  className="button btn-red-border w-[250px] md:w-[220px]"
                  height={45}
                  clr="text-red"
                />
              </div>
              <div className="max-w-[398px] max-md:max-w-[250px] w-full mx-auto md:mx-0 py-[12px] px-[8px] flex items-center gap-[8px] rounded-[12px] bg-[var(--bg-card)] shadow">
                <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
                <input
                  type="search"
                  placeholder="Search DePIN pool"
                  className="w-full"
                  value={searchToken}
                  onChange={handleSearchChange}
                />
              </div>
            </div>
          </div>

          <div className="w-full mt-1">
            <p className="text-sm text-gray-500">
              {{
                MyLive: 'Showing your active DePIN staking pools.',
                MyEnded: 'Showing your ended DePIN staking pools.',
                Live: 'Showing active DePIN staking pools.',
                Ended: 'Showing ended DePIN staking pools.',
                All: 'Showing all DePIN staking pools.',
              }[activeTab]}
            </p>
          </div>

          {/* Pool List */}
          <div className="bottom">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Spin size="large" />
              </div>
            ) : filteredPools.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 bg-[var(--bg-card)] rounded-lg shadow-sm">
                <Icon icon="mdi:folder-open-outline" className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-[var(--text-heading)] mb-2">No Pools Found</h3>
                <p className="text-gray-500 text-center">There are currently no DePIN staking pools available in this category.</p>
              </div>
            ) : (
              <DeviceTable
                pools={filteredPools}
                fetchData={fetchPools}
                tokenImages={tokenImages}
                activeTab={activeTab}
              />
            )}
          </div>
        </div>
      </div>
      <CreateDevicePoolWizard isOpen={isCreateOpen} setIsOpen={setIsCreateOpen} fetchData={fetchPools} />
    </>
  )
}

export default DeviceStakeTable
