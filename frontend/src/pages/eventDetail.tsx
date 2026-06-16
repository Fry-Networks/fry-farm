import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import EventDetailPage from '../components/pages/events/EventDetailPage'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

const EventDetail = () => (
  <div className="relative overflow-hidden min-h-screen flex flex-col">
    <PageBg />
    <Navbar />
    <FeatureGate feature="communityEvents">
      <EventDetailPage />
    </FeatureGate>
    <Footer />
  </div>
)

export default EventDetail
