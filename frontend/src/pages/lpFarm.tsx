import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Footer from '../components/layout/footer'
import Navbar from '../components/layout/navbar'
import FarmTable from '../components/pages/farm/farmTable'
import AlphaArcadePage from '../components/pages/alphaArcade/AlphaArcadePage'
import PageBg from '../components/shared/pageBg'
import { FeatureGate } from '../components/FeatureGate'

type FarmTab = 'token' | 'prediction'

const LpFarm = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as FarmTab) || 'token'
  const [activeTab, setActiveTab] = useState<FarmTab>(
    ['token', 'prediction'].includes(initialTab) ? initialTab : 'token'
  )

  const switchTab = (tab: FarmTab) => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  return (
    <>
      <div className="relative overflow-hidden min-h-screen flex flex-col">
        <PageBg />
        <Navbar />
        <div className="w-full mt-[56px] mb-[50px] flex-1">
          <div className="max-xxxl:max-w-[95%] w-full max-w-[80%] m-auto flex flex-col items-center gap-[20px]">
            {/* Tab switcher — replicates profileSwitcher pattern */}
            <div className="switcher flex justify-center items-center gap-[3px] w-fit max-sm:w-full overflow-x-auto p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
              <p
                onClick={() => switchTab('token')}
                className={`${
                  activeTab === 'token' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
                } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[160px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
              >
                Token Farm
              </p>
              <p
                onClick={() => switchTab('prediction')}
                className={`${
                  activeTab === 'prediction' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
                } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[160px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
              >
                Prediction Market
              </p>
            </div>

            {/* Tab content */}
            {activeTab === 'token' && (
              <FeatureGate feature="farming">
                <FarmTable />
              </FeatureGate>
            )}
            {activeTab === 'prediction' && (
              <FeatureGate feature="predictionLp">
                <AlphaArcadePage />
              </FeatureGate>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </>
  )
}

export default LpFarm
