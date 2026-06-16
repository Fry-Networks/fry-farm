import { Icon } from '@iconify/react'
import { FC, useEffect, useState } from 'react'
import { authAxios } from '../../services/apiClient'
import Users from '../Users/users'
import FarmingList from './farmingList'
import StakingList from './stakingList'

interface PlatformStats {
  activeStaking: number
  activeFarming: number
  activePredictions: number
  predictionProviders: number
  predictionTvl: number
}

const Home: FC = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null)

  useEffect(() => {
    authAxios.get('/prediction-lp/admin/platform-stats')
      .then((res) => { if (res.data?.success) setStats(res.data.data) })
      .catch((err) => console.error('Failed to fetch platform stats:', err))
  }, [])

  const totalUsers = (stats?.activeStaking ?? 0) + (stats?.activeFarming ?? 0) + (stats?.predictionProviders ?? 0)
  const fmtNum = (n: number) => n.toLocaleString()
  const fmtUsd = (micro: number) => `$${(micro / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <>
      <div className="dashboard-main flex flex-col gap-[20px]">
        {/* Top activity div */}
        <div className="activity-div flex gap-[30px] max-sm:flex-col flex-wrap">
          <div className="flex flex-col gap-[35px] max-sm:max-w-full max-w-[300px] w-full px-[16px] py-[20px] bg-white rounded-[14px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            <div className="flex justify-between gap-[10px]">
              <div className="flex flex-col gap-[20px]">
                <p className="medium text-primary">Total Users</p>
                <h4 className="small text-primary font-bold">{stats ? fmtNum(totalUsers) : '...'}</h4>
              </div>
              <img src="../../assets/images/dashboard/user.svg" alt="Total Users Icon" className="w-[60px] h-[60px]" />
            </div>
            <div className="flex items-center justify-center gap-[8px]">
              <Icon icon="mdi:account-group" width={24} height={24} color="#00B69B" />
              <p className="medium text-primary">Stakers + Farmers + LP Providers</p>
            </div>
          </div>
          <div className="flex flex-col gap-[35px] max-sm:max-w-full max-w-[300px] w-full px-[16px] py-[20px] bg-white rounded-[14px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            <div className="flex justify-between gap-[10px]">
              <div className="flex flex-col gap-[20px]">
                <p className="medium text-primary">Active Staking</p>
                <h4 className="small text-primary font-bold">{stats ? fmtNum(stats.activeStaking) : '...'}</h4>
              </div>
              <img src="../../assets/images/dashboard/stake.svg" alt="Active Staking Icon" className="w-[60px] h-[60px]" />
            </div>
            <div className="flex items-center justify-center gap-[8px]">
              <Icon icon="mdi:lock" width={24} height={24} color="#00B69B" />
              <p className="medium text-primary">Total stakers across all pools</p>
            </div>
          </div>
          <div className="flex flex-col gap-[35px] max-sm:max-w-full max-w-[300px] w-full px-[16px] py-[20px] bg-white rounded-[14px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            <div className="flex justify-between gap-[10px]">
              <div className="flex flex-col gap-[20px]">
                <p className="medium text-primary">Active Farming</p>
                <h4 className="small text-primary font-bold">{stats ? fmtNum(stats.activeFarming) : '...'}</h4>
              </div>
              <img src="../../assets/images/dashboard/farm.png" alt="Active Farming Icon" className="w-[60px] h-[60px]" />
            </div>
            <div className="flex items-center justify-center gap-[8px]">
              <Icon icon="mdi:sprout" width={24} height={24} color="#00B69B" />
              <p className="medium text-primary">Total farmers across all pools</p>
            </div>
          </div>
          <div className="flex flex-col gap-[35px] max-sm:max-w-full max-w-[300px] w-full px-[16px] py-[20px] bg-white rounded-[14px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            <div className="flex justify-between gap-[10px]">
              <div className="flex flex-col gap-[20px]">
                <p className="medium text-primary">Prediction LP</p>
                <h4 className="small text-primary font-bold">{stats ? `${fmtNum(stats.predictionProviders)} providers` : '...'}</h4>
              </div>
              <Icon icon="mdi:chart-timeline-variant" width={60} height={60} color="#00B69B" />
            </div>
            <div className="flex items-center justify-center gap-[8px]">
              <Icon icon="mdi:cash" width={24} height={24} color="#00B69B" />
              <p className="medium text-primary">
                {stats ? `TVL: ${fmtUsd(stats.predictionTvl)}` : '...'}
              </p>
            </div>
          </div>
        </div>

        {/* User list */}
        <Users showSearchBar={false} showviewALL={true} dataLimit={3} showPagination={false} />

        {/* Staking list */}
        <StakingList />

        {/* Farming list */}
        <FarmingList />
      </div>
    </>
  )
}

export default Home
