import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import LaunchesPage from '../components/pages/launches/LaunchesPage'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

const Launches = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <FeatureGate feature="launches">
          <LaunchesPage />
        </FeatureGate>
        <Footer />
      </div>
    </>
  )
}

export default Launches
