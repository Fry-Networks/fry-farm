import { VestigeLabsClient } from '../contracts/VestigeLabsClient';

// Test the Vestige Labs API integration
async function testVestigeIntegration() {
  console.log('🧪 Testing Vestige Labs API Integration...');
  
  const vestigeClient = new VestigeLabsClient('mainnet');
  
  try {
    // Test with the example from the API response
    const testParams = {
      from_asa: 2485314946,
      to_asa: 2160577481,
      amount: 1000000,
      mode: 'sef' as const,
      denominating_asset_id: 31566704
    };

    console.log('📡 Fetching quote from Vestige Labs...');
    const quote = await vestigeClient.fetchSwapQuote(testParams);
    
    console.log('✅ Quote received:', {
      mode: quote.mode,
      amountIn: quote.amount,
      amountOut: quote.amount_out,
      priceImpact: quote.price_impact,
      networkFee: quote.network_fee,
      assetImages: quote.asset_images
    });

    // Test asset pair support check
    console.log('🔍 Testing asset pair support...');
    const isSupported = await vestigeClient.isAssetPairSupported(
      testParams.from_asa,
      testParams.to_asa
    );
    console.log(`Asset pair ${testParams.from_asa} -> ${testParams.to_asa} supported:`, isSupported);

    // Test with ALGO to USDC
    console.log('🔍 Testing ALGO to USDC support...');
    const algoUsdcSupported = await vestigeClient.isAssetPairSupported(0, 31566704);
    console.log('ALGO -> USDC supported:', algoUsdcSupported);

    console.log('✅ All tests passed!');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Export for use in other files
export { testVestigeIntegration };

// Run test if this file is executed directly
if (typeof window === 'undefined') {
  testVestigeIntegration().then(success => {
    process.exit(success ? 0 : 1);
  });
}
