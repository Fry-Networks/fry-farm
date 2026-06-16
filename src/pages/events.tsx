import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import EventsPage from '../components/pages/events/EventsPage'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

const Events = () => (
  <div className="relative overflow-hidden min-h-screen flex flex-col">
    <PageBg />
    <Navbar />
    <FeatureGate feature="communityEvents">
      <EventsPage />
    </FeatureGate>
    <Footer />
  </div>
)

export default Events
