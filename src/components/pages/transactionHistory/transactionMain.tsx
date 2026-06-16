import React, { useState } from 'react'
import FarmTable from './FarmTable'
import StakeTable from './stakeTable'
import SwapTable from './swaptable'

const TransactionMain: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'swap' | 'stake' | 'farm'>('swap')

  return (
    <>
      <div className="w-full my-[68px] flex-1">
        <div className="max-xxxl:w-[95%] w-[80%] m-auto flex flex-col items-center gap-[34px]">
          <h1 className="font-apex text-grad uppercase text-center sm-s:text-[60px]">Transaction History</h1>

          <div className="main-switcher flex flex-col items-center gap-[44px] w-full">
            {/* Top */}
            <div className="switcher flex justify-center items-center gap-[3px] w-fit p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
              <p
                className={`flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] h-[48px] ${
                  activeTab === 'swap' ? 'text-white linearGradient' : 'text-black bg-transparent'
                }`}
                onClick={() => setActiveTab('swap')}
              >
                Swap
              </p>
              <p
                className={`flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] h-[48px] ${
                  activeTab === 'stake' ? 'text-white linearGradient' : 'text-black bg-transparent'
                }`}
                onClick={() => setActiveTab('stake')}
              >
                Stake
              </p>
              <p
                className={`flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[92px] h-[38px] ${
                  activeTab === 'farm' ? 'text-white linearGradient' : 'text-black bg-transparent'
                }`}
                onClick={() => setActiveTab('farm')}
              >
                Farm
              </p>
            </div>
            {/* Bottom */}
            <div className="w-full">
              {activeTab === 'swap' && <SwapTable />}
              {activeTab === 'stake' && <StakeTable />}
              {activeTab === 'farm' && <FarmTable />}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default TransactionMain
