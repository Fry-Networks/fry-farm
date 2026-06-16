import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import PoolParticipants from '../components/pages/stakepoolStats/poolParticipants'
import PoolStats from '../components/pages/stakepoolStats/poolStats'
import PageBg from '../components/shared/pageBg'

const StakePoolStats = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <PoolStats />
        {/* <PoolParticipants /> */}
        <Footer />
      </div>
    </>
  )
}

export default StakePoolStats
