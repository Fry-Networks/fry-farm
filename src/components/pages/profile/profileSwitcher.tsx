import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import P_FarmTable from './farm/P_farmTable'
import P_Farmbanner from './farm/Pfarmbanner'
import PStakebanner from './stake/Pstakebanner'
import PstakeTable from './stake/PstakeTable'
import PPredictbanner from './predict/PPredictbanner'
import PPredictTable from './predict/PPredictTable'
import PortfolioBanner from './portfolio/PortfolioBanner'
import PortfolioTable from './portfolio/PortfolioTable'
import type { PortfolioToken } from './portfolio/PortfolioTable'
import GenesisNftBanner from './genesis/GenesisNftBanner'
import GenesisNftGrid from './genesis/GenesisNftGrid'
import { useChain } from '../../../context/ChainContext'
import { useMultiChainWallet } from '../../../hooks/useMultiChainWallet'
import { getUserGenesisNfts, getGenesisNftState, type GenesisNftState } from '../../../genesis_mint_func'

type TabId = 'portfolio' | 'stake' | 'farm' | 'predict' | 'genesis'

const ProfileSwitcher = () => {
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabId) || 'portfolio'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab === 'genesis' ? 'genesis' : 'portfolio')
  const [portfolioTokens, setPortfolioTokens] = useState<PortfolioToken[]>([])
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const { chainId } = useChain()
  const { activeAddress } = useMultiChainWallet()
  const isAlgorand = chainId === 'algorand-mainnet'

  // Genesis tab state
  const [genesisTokenIds, setGenesisTokenIds] = useState<number[]>([])
  const [genesisState, setGenesisState] = useState<GenesisNftState | null>(null)
  const [genesisLoading, setGenesisLoading] = useState(false)

  // Fetch Genesis data when tab is active and wallet is connected
  useEffect(() => {
    if (activeTab !== 'genesis' || !isAlgorand) return
    setGenesisLoading(true)
    const fetchData = async () => {
      try {
        const [state, ids] = await Promise.all([
          getGenesisNftState(),
          activeAddress ? getUserGenesisNfts(activeAddress) : Promise.resolve([]),
        ])
        setGenesisState(state)
        setGenesisTokenIds(ids)
      } catch (err) {
        console.error('Failed to fetch Genesis data:', err)
      } finally {
        setGenesisLoading(false)
      }
    }
    fetchData()
  }, [activeTab, activeAddress, isAlgorand])

  return (
    <>
      <div className="w-full mb-[100px] flex-1">
        <div className="max-xxxl:max-w-[95%] w-full max-w-[80%] m-auto flex flex-col items-center gap-[41px] max-md:gap-[20px]">
          {/* Switcher tab */}
          <div className="switcher flex justify-center items-center gap-[3px] w-fit max-sm:w-full overflow-x-auto p-[3px] bg-white rounded-[12px] shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]">
            {/* Portfolio Tab */}
            <p
              onClick={() => setActiveTab('portfolio')}
              className={`${
                activeTab === 'portfolio' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
            >
              Portfolio
            </p>
            {/* Stake Tab */}
            <p
              onClick={() => setActiveTab('stake')}
              className={`${
                activeTab === 'stake' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
            >
              Stake
            </p>
            {/* Farm Tab */}
            <p
              onClick={() => setActiveTab('farm')}
              className={`${
                activeTab === 'farm' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
            >
              Farm
            </p>
            {/* Predict Tab */}
            <p
              onClick={() => setActiveTab('predict')}
              className={`${
                activeTab === 'predict' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
              } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
            >
              Predict
            </p>
            {/* Genesis Tab (Algorand only) */}
            {isAlgorand && (
              <p
                onClick={() => setActiveTab('genesis')}
                className={`${
                  activeTab === 'genesis' ? 'text-white linearGradient shadow-[0px_4px_24.2px_0px_rgba(0,60,82,0.10)]' : 'text-black'
                } flex items-center justify-center text-center cursor-pointer tracking-[0.09px] rounded-[10px] w-[117px] max-sm:w-auto max-sm:flex-1 max-sm:min-w-[70px] max-sm:px-3 h-[48px] max-sm:h-[40px] max-sm:text-[13px] whitespace-nowrap`}
              >
                Genesis
              </p>
            )}
          </div>
          {/* Rendered Component div */}
          <div className="flex flex-col gap-[56px] w-full max-md:gap-[20px]">
            {activeTab === 'portfolio' && (
              <>
                <PortfolioBanner tokens={portfolioTokens} isLoading={portfolioLoading} />
                <PortfolioTable
                  onTokensLoaded={(tokens) => {
                    setPortfolioTokens(tokens)
                    setPortfolioLoading(false)
                  }}
                />
              </>
            )}
            {activeTab === 'stake' && (
              <>
                <PStakebanner />
                <PstakeTable />
              </>
            )}
            {activeTab === 'farm' && (
              <>
                <P_Farmbanner />
                <P_FarmTable />
              </>
            )}
            {activeTab === 'predict' && (
              <>
                <PPredictbanner />
                <PPredictTable />
              </>
            )}
            {activeTab === 'genesis' && (
              <>
                <GenesisNftBanner
                  ownedCount={genesisTokenIds.length}
                  totalMinted={genesisState?.totalMinted ?? 0}
                  maxSupply={genesisState?.maxSupply ?? 1000}
                  isLoading={genesisLoading}
                />
                <GenesisNftGrid
                  tokenIds={genesisTokenIds}
                  isLoading={genesisLoading}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default ProfileSwitcher
