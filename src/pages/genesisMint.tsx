import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import GenesisMintMain from '../components/pages/genesisMint/GenesisMintMain'
import PageBg from '../components/shared/pageBg'

const GenesisMint = () => {
  return (
    <div className="relative overflow-hidden min-h-screen flex flex-col">
      <PageBg />
      <Navbar />
      <GenesisMintMain />
      <Footer />
    </div>
  )
}

export default GenesisMint
