import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import P2PSwapPage from '../components/pages/p2pSwap/P2PSwapPage'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

const P2PSwap = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <FeatureGate feature="p2pSwap">
          <P2PSwapPage />
        </FeatureGate>
        <Footer />
      </div>
    </>
  )
}

export default P2PSwap
