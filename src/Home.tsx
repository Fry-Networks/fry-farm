import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import AdminDashboard from './adminDashboard/admindashboard'
import AdminDashboardoutlet from './adminDashboard/dashboardoutlet'
import Farming from './adminDashboard/Farming/farming'
import FarmingStatistics from './adminDashboard/Farming/farmingStatistics'
import Home from './adminDashboard/Home/home'
import GeneralSetting from './adminDashboard/Settings/generalSetting'
import ProfileSetting from './adminDashboard/Settings/profileSetting'
import Settings from './adminDashboard/Settings/settings'
import Staking from './adminDashboard/Staking/staking'
import StakingStatistics from './adminDashboard/Staking/stakingStatistics'
import UserDetail from './adminDashboard/Users/userDetail/userDetail'
import UserDetailFarming from './adminDashboard/Users/userDetail/userDetailFarming'
import UserDetailStaking from './adminDashboard/Users/userDetail/userDetailStaking'
import Users from './adminDashboard/Users/users'
import UserDetailTransactionHistory from './adminDashboard/Users/userTransactionHistory/userDetailTransactionHistory'
import IntegrationTesting from "./Integration-testing"
import AdminLogin from './pages/adminLogin'
import LpFarm from './pages/lpFarm'
import FarmPoolStats from './pages/farmPoolStats'
import Profile from './pages/profile'
import StakingPage from './pages/staking'
import StakePoolStats from './pages/stakePoolStats'
import Events from './pages/events'
import EventDetail from './pages/eventDetail'
import NftPoolStats from './pages/nftPoolStats'
import Swap from './pages/swap'
import TransactionHistory from './pages/transactionHistory'
import DevicePoolStats from './pages/devicePoolStats'
import DeviceDashboard from './pages/deviceDashboard'
import P2PSwap from './pages/p2pSwap'
import P2PMarketDetail from './pages/p2pMarketDetail'
import GenesisMint from './pages/genesisMint'
import Launches from './pages/launches'
import TokenDetailPage from './pages/tokenDetail'

const AppLayout = () => {
  return (
    <>
      <RouterProvider router={appRouter} />
    </>
  )
}

const appRouter = createBrowserRouter([
  {
    path: '/',
    element: <Swap />,
  },
  {
    path: '/swap',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/nftStake',
    element: <Navigate to="/staking?tab=nft" replace />,
  },
  {
    path: '/transactionHistory',
    element: <Navigate to="/transaction-history" replace />,
  },
  {
    path: '/adminLogin',
    element: <Navigate to="/admin-login" replace />,
  },
  {
    path: '/deviceStake',
    element: <Navigate to="/staking?tab=depin" replace />,
  },
  {
    path: '/stakePoolStats',
    element: <Navigate to="/stake-pool-stats" replace />,
  },
  {
    path: '/farmPoolStats',
    element: <Navigate to="/farm-pool-stats" replace />,
  },
  {
    path: '/p2pSwap',
    element: <Navigate to="/p2p" replace />,
  },
  {
    path: '/alphaArcade',
    element: <Navigate to="/lp-farm?tab=prediction" replace />,
  },
  {
    path: '/genesisMint',
    element: <Navigate to="/genesis-mint" replace />,
  },
  {
    path: '/p2p',
    element: <P2PSwap />,
  },
  {
    path: '/p2p/:appId',
    element: <P2PMarketDetail />,
  },
  {
    path: '/stake',
    element: <Navigate to="/staking?tab=token" replace />,
  },
  {
    path: '/staking',
    element: <StakingPage />,
  },
  {
    path: '/token-stake',
    element: <Navigate to="/staking?tab=token" replace />,
  },
  {
    path: '/lp-farm',
    element: <LpFarm />,
  },
  {
    path: '/farm',
    element: <Navigate to="/lp-farm?tab=token" replace />,
  },
  {
    path: '/nft-stake',
    element: <Navigate to="/staking?tab=nft" replace />,
  },
  {
    path: '/nft-pool-stats',
    element: <NftPoolStats />,
  },
  {
    path: '/depin-stake',
    element: <Navigate to="/staking?tab=depin" replace />,
  },
  {
    path: '/device-stake',
    element: <Navigate to="/staking?tab=depin" replace />,
  },
  {
    path: '/device-pool-stats',
    element: <DevicePoolStats />,
  },
  {
    path: '/device-dashboard',
    element: <DeviceDashboard />,
  },
  {
    path: '/prediction-lp',
    element: <Navigate to="/lp-farm?tab=prediction" replace />,
  },
  {
    path: '/events',
    element: <Events />,
  },
  {
    path: '/events/:eventId',
    element: <EventDetail />,
  },
  {
    path: '/profile',
    element: <Profile />,
  },
  {
    path: '/stake-pool-stats',
    element: <StakePoolStats />,
  },
  {
    path: '/farm-pool-stats',
    element: <FarmPoolStats />,
  },
  {
    path: '/transaction-history',
    element: <TransactionHistory />,
  },
  {
    path: '/launches',
    element: <Launches />,
  },
  {
    path: '/launches/token/:asaId',
    element: <TokenDetailPage />,
  },

  {
    path: '/genesis-mint',
    element: <GenesisMint />,
  },
  {
    path: '/admin-login',
    element: <AdminLogin />,
  },
  {
    path: '/admin',
    element: <AdminDashboard />,
    children: [
      {
        path: '/admin/dashboard',
        element: <AdminDashboardoutlet />,
        children: [
          {
            index: true,
            element: <Home />,
          },
        ],
      },
      {
        path: '/admin/users',
        element: <Users />,
      },
      {
        path: '/admin/user-detail',
        element: <UserDetail />,
        children: [
          {
            path: 'staking',
            element: <UserDetailStaking />,
          },
          {
            path: 'farming',
            element: <UserDetailFarming />,
          },
        ],
      },
      {
        path: '/admin/user-transactions-history',
        element: <UserDetailTransactionHistory />,
      },
      {
        path: '/admin/staking',
        element: <Staking />,
      },
      {
        path: '/admin/staking-statistics',
        element: <StakingStatistics />,
      },
      {
        path: '/admin/farming',
        element: <Farming />,
      },
      {
        path: '/admin/farming-statistics',
        element: <FarmingStatistics />,
      },
      {
        path: '/admin/setting',
        element: <Settings />,
        children: [
          {
            path: 'profile',
            element: <ProfileSetting />,
          },
          {
            path: 'general',
            element: <GeneralSetting />,
          },
        ],
      },
    ],
  },
  {
    path: '/integration',
    element: <IntegrationTesting />,
  },
])

export default AppLayout
