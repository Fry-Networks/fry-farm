import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import DeviceDashboardContent from '../components/pages/deviceStake/deviceDashboard'
import PageBg from '../components/shared/pageBg'

const DeviceDashboard = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <DeviceDashboardContent />
        <Footer />
      </div>
    </>
  )
}

export default DeviceDashboard
