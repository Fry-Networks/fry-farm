import algosdk from 'algosdk'
import axios from 'axios'

const API_BASE_URL = 'https://frynodebackend.octalooptechnologies.com'

/**
 * Get the contract address (application address) from an appId
 */
const getContractAddress = (appId: number | string | bigint): string => {
  return algosdk.getApplicationAddress(Number(appId))
}

/**
 * Fetch all staking pools and their addresses
 */
const fetchStakingPools = async () => {
  try {
    console.log('\n📊 Fetching Staking Pools...\n')
    const response = await axios.get(`${API_BASE_URL}/stakingtoken/all`)
    // Handle response structure: response.data.data or response.data
    const pools = response.data?.data || response.data || []

    // Debug: log response structure if no pools found
    if (!Array.isArray(pools) || pools.length === 0) {
      console.log('❌ No staking pools found')
      console.log('   Response structure:', JSON.stringify(response.data, null, 2).substring(0, 200))
      return []
    }

    console.log(`✅ Found ${pools.length} staking pool(s):\n`)
    
    const poolsWithAddresses = pools.map((pool: any, index: number) => {
      const appId = pool.appId || pool.stakingContractId
      const address = appId ? getContractAddress(appId) : 'N/A'
      
      return {
        index: index + 1,
        appId: appId || 'N/A',
        address,
        ...pool
      }
    })

    poolsWithAddresses.forEach((pool: any) => {
      console.log(`  ${pool.index}. Staking Pool`)
      console.log(`     App ID: ${pool.appId}`)
      console.log(`     Address: ${pool.address}`)
      if (pool.creatorId) console.log(`     Creator: ${pool.creatorId}`)
      if (pool.rewardToken?.id) console.log(`     Reward Token: ${pool.rewardToken.id}`)
      console.log('')
    })

    return poolsWithAddresses
  } catch (error: any) {
    console.error('❌ Error fetching staking pools:', error.message)
    if (error.response) {
      console.error('   Response:', error.response.status, error.response.statusText)
    }
    return []
  }
}

/**
 * Fetch all farming pools and their addresses
 */
const fetchFarmingPools = async () => {
  try {
    console.log('\n🌾 Fetching Farming Pools...\n')
    const response = await axios.get(`${API_BASE_URL}/farming/all`)
    // Handle response structure: response.data.data or response.data
    const pools = response.data?.data || response.data || []

    // Debug: log response structure if no pools found
    if (!Array.isArray(pools) || pools.length === 0) {
      console.log('❌ No farming pools found')
      console.log('   Response structure:', JSON.stringify(response.data, null, 2).substring(0, 200))
      return []
    }

    console.log(`✅ Found ${pools.length} farming pool(s):\n`)
    
    const poolsWithAddresses = pools.map((pool: any, index: number) => {
      const appId = pool.appId
      const address = appId ? getContractAddress(appId) : 'N/A'
      
      return {
        index: index + 1,
        appId: appId || 'N/A',
        address,
        ...pool
      }
    })

    poolsWithAddresses.forEach((pool: any) => {
      console.log(`  ${pool.index}. Farming Pool`)
      console.log(`     App ID: ${pool.appId}`)
      console.log(`     Address: ${pool.address}`)
      if (pool.creatorId) console.log(`     Creator: ${pool.creatorId}`)
      if (pool.rewardToken?.id) console.log(`     Reward Token: ${pool.rewardToken.id}`)
      if (pool.lpToken) {
        console.log(`     LP Token A: ${pool.lpToken.tokenA}`)
        console.log(`     LP Token B: ${pool.lpToken.tokenB}`)
      }
      console.log('')
    })

    return poolsWithAddresses
  } catch (error: any) {
    console.error('❌ Error fetching farming pools:', error.message)
    if (error.response) {
      console.error('   Response:', error.response.status, error.response.statusText)
    }
    return []
  }
}

/**
 * Main function to fetch and display all contract addresses
 */
const main = async () => {
  console.log('🚀 Fetching Contract Addresses...')
  console.log(`📡 API Base URL: ${API_BASE_URL}`)
  console.log('=' .repeat(60))

  const stakingPools = await fetchStakingPools()
  const farmingPools = await fetchFarmingPools()

  console.log('=' .repeat(60))
  console.log('\n📋 Summary:')
  console.log(`   Staking Pools: ${stakingPools.length}`)
  console.log(`   Farming Pools: ${farmingPools.length}`)
  console.log(`   Total Contracts: ${stakingPools.length + farmingPools.length}`)

  // Export summary to JSON file
  const summary = {
    timestamp: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    stakingPools: stakingPools.map((p: any) => ({
      appId: p.appId,
      address: p.address,
      creatorId: p.creatorId,
      rewardToken: p.rewardToken,
    })),
    farmingPools: farmingPools.map((p: any) => ({
      appId: p.appId,
      address: p.address,
      creatorId: p.creatorId,
      rewardToken: p.rewardToken,
      lpToken: p.lpToken,
    })),
  }

  console.log('\n💾 Summary saved to: contract-addresses-summary.json')
  const fs = await import('fs/promises')
  await fs.writeFile(
    'contract-addresses-summary.json',
    JSON.stringify(summary, null, 2)
  )

  console.log('\n✅ Done!\n')
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

