import React, { createContext, ReactNode, useContext, useState } from 'react'

// Define the PoolData interface
interface PoolData {
  pool: string
  tvl: string
  apr: string
  staked: string
  reward: string
  ends: string
  stakingContractId: number
  _id: string
  stakingTime?: number
  totalAmountStaked?: number
  stakingEndTime?: number
  tvlReward?: number
}

// Define the context type
interface PoolDataContextType {
  poolData: PoolData | null
  setPoolData: (data: PoolData) => void
}

// Create the context with an undefined initial state
const PoolDataContext = createContext<PoolDataContextType | undefined>(undefined)

// Define the provider with children prop
interface PoolDataProviderProps {
  children: ReactNode
}

export const PoolDataProvider: React.FC<PoolDataProviderProps> = ({ children }) => {
  const [poolData, setPoolData] = useState<PoolData | null>(null)

  return <PoolDataContext.Provider value={{ poolData, setPoolData }}>{children}</PoolDataContext.Provider>
}

// Custom hook to use the PoolDataContext
export const usePoolData = () => {
  const context = useContext(PoolDataContext)
  if (!context) {
    throw new Error('usePoolData must be used within a PoolDataProvider')
  }
  return context
}
