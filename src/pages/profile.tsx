import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import Profilebanner from '../components/pages/profile/profilebanner'
import ProfileSwitcher from '../components/pages/profile/profileSwitcher'
import PageBg from '../components/shared/pageBg'

const Profile = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <Profilebanner />
        <ProfileSwitcher />
        <Footer />
      </div>
    </>
  )
}

export default Profile
