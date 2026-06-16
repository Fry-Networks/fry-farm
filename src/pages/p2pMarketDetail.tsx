import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import P2PMarketDetailPage from '../components/pages/p2pSwap/P2PMarketDetailPage'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

const P2PMarketDetail = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <FeatureGate feature="p2pSwap">
          <P2PMarketDetailPage />
        </FeatureGate>
        <Footer />
      </div>
    </>
  )
}

export default P2PMarketDetail
