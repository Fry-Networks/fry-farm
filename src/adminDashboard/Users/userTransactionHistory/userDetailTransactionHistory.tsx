import { Icon } from '@iconify/react'
import { useState } from 'react'
import TFarmTable from './TFarmTable'
import TStakeTable from './TstakeTable'
import TSwapTable from './Tswaptable'

const UserDetailTransactionHistory = () => {
  const [activeTab, setActiveTab] = useState<'swap' | 'stake' | 'farm'>('swap')
  return (
    <>
      <div className="flex flex-col gap-[15px] w-full px-[32px] py-[27px] bg-white rounded-[14px] shadow">
        {/* top */}

        <div className="flex justify-between items-center gap-[10px] sm-s:flex-col">
          <p className="elarge text-primary font-semibold">Transaction History</p>
          <div className="max-w-[310px] w-full p-[8px] flex items-center gap-[8px] border-2 border-solid border-[#EDEDED] rounded-[12px] bg-white">
            <Icon icon="si:search-line" color="#A8A8A8" width={22} height={22} />
            <input type="search" placeholder="Search Transaction" className="w-full" />
          </div>
        </div>
        {/* switcher */}
        <div className="main-switcher flex flex-col  gap-[21px] w-full  sm-s:items-center">
          {/* Top */}
          <div className="switcher flex  items-center gap-[3px] w-fit p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            <p
              className={`flex items-center justify-center large text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[90px] h-[37px] ${
                activeTab === 'swap' ? 'text-white linearGradient' : 'text-black bg-transparent'
              }`}
              onClick={() => setActiveTab('swap')}
            >
              Swap
            </p>
            <p
              className={`flex items-center justify-center large text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[90px] h-[37px] ${
                activeTab === 'stake' ? 'text-white linearGradient' : 'text-black bg-transparent'
              }`}
              onClick={() => setActiveTab('stake')}
            >
              Stake
            </p>
            <p
              className={`flex items-center justify-center large text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[90px] h-[37px] ${
                activeTab === 'farm' ? 'text-white linearGradient' : 'text-black bg-transparent'
              }`}
              onClick={() => setActiveTab('farm')}
            >
              Farm
            </p>
          </div>
          {/* Bottom */}
          <div className="w-full">
            {activeTab === 'swap' && <TSwapTable />}
            {activeTab === 'stake' && <TStakeTable />}
            {activeTab === 'farm' && <TFarmTable />}
          </div>
        </div>
      </div>
    </>
  )
}

export default UserDetailTransactionHistory
