import algosdk from 'algosdk'

/**
 * Get the contract address (application address) from an appId
 * In Algorand, smart contract addresses are derived deterministically from appIds
 * 
 * @param appId - The application ID (number or bigint)
 * @returns The contract address as a string
 */
export const getContractAddress = (appId: number | bigint): string => {
  return algosdk.getApplicationAddress(Number(appId))
}

/**
 * Example contract addresses (from testnet)
 * Note: These are example/test contracts. Production contracts will have different appIds
 */
export const EXAMPLE_CONTRACTS = {
  testnet: {
    // Example staking contract from Integration-testing.tsx
    staking: {
      appId: 731920708,
      address: getContractAddress(731920708),
    },
    // Note: Farming contracts are deployed dynamically, so there's no default example
    // You'll need to get the appId from your backend API or database
  },
  mainnet: {
    // Add mainnet contract appIds here when available
  },
}

/**
 * Get all staking pool addresses from your backend
 * Call your API endpoint: ${VITE_API_BASE_URL}/stakingtoken/all
 * Each pool will have an appId that can be converted to an address
 */
export const getAllStakingPools = async (): Promise<Array<{ appId: number; address: string }>> => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  if (!apiUrl) {
    throw new Error('VITE_API_BASE_URL is not defined')
  }

  try {
    const response = await fetch(`${apiUrl}/stakingtoken/all`)
    const data = await response.json()
    
    // Assuming the API returns an array of pools with appId field
    return data.map((pool: any) => ({
      appId: Number(pool.appId || pool.stakingContractId),
      address: getContractAddress(pool.appId || pool.stakingContractId),
      ...pool,
    }))
  } catch (error) {
    console.error('Error fetching staking pools:', error)
    throw error
  }
}

/**
 * Get all farming pool addresses from your backend
 * Call your API endpoint: ${VITE_API_BASE_URL}/farming/all
 * Each pool will have an appId that can be converted to an address
 */
export const getAllFarmingPools = async (): Promise<Array<{ appId: number; address: string }>> => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  if (!apiUrl) {
    throw new Error('VITE_API_BASE_URL is not defined')
  }

  try {
    const response = await fetch(`${apiUrl}/farming/all`)
    const data = await response.json()
    
    // Assuming the API returns an array of pools with appId field
    return data.map((pool: any) => ({
      appId: Number(pool.appId),
      address: getContractAddress(pool.appId),
      ...pool,
    }))
  } catch (error) {
    console.error('Error fetching farming pools:', error)
    throw error
  }
}

