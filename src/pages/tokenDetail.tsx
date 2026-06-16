import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import TokenDetail from '../components/pages/launches/TokenDetail'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

const TokenDetailPage = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <FeatureGate feature="launches">
          <TokenDetail />
        </FeatureGate>
        <Footer />
      </div>
    </>
  )
}

export default TokenDetailPage
