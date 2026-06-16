import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import TransactionMain from '../components/pages/transactionHistory/transactionMain'
import PageBg from '../components/shared/pageBg'

const TransactionHistory = () => {
  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <TransactionMain />
        <Footer />
      </div>
    </>
  )
}

export default TransactionHistory
