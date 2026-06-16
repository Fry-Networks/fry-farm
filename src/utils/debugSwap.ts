// Debug utility to help troubleshoot FolksRouter swap issues
export function debugSwapParams(fromAssetId: number | string, toAssetId: number | string, amount: number) {
  console.log('🔍 Debug Swap Parameters:');
  console.log('  From Asset ID (raw):', fromAssetId, typeof fromAssetId);
  console.log('  To Asset ID (raw):', toAssetId, typeof toAssetId);
  console.log('  Amount:', amount, typeof amount);
  
  // Convert to numbers
  const numericFromAssetId = typeof fromAssetId === 'string' ? parseInt(fromAssetId, 10) : fromAssetId;
  const numericToAssetId = typeof toAssetId === 'string' ? parseInt(toAssetId, 10) : toAssetId;
  
  console.log('  From Asset ID (numeric):', numericFromAssetId, typeof numericFromAssetId);
  console.log('  To Asset ID (numeric):', numericToAssetId, typeof numericToAssetId);
  console.log('  Amount as BigInt:', BigInt(amount));
  
  // Check if assets are valid
  if (numericFromAssetId < 0 || numericToAssetId < 0) {
    console.error('❌ Invalid asset IDs - must be non-negative');
  }
  
  if (amount <= 0) {
    console.error('❌ Invalid amount - must be positive');
  }
  
  // Check for common asset IDs
  const commonAssets: { [key: number]: string } = {
    0: 'ALGO',
    31566704: 'USDC',
    2160577481: 'Asset from Vestige example',
    2485314946: 'Asset from Vestige example',
    2485202024: 'Unknown asset (from your swap)'
  };
  
  console.log('  From Asset:', commonAssets[numericFromAssetId] || `Unknown (${numericFromAssetId})`);
  console.log('  To Asset:', commonAssets[numericToAssetId] || `Unknown (${numericToAssetId})`);
  
  return {
    fromAssetId: numericFromAssetId,
    toAssetId: numericToAssetId,
    amount: BigInt(amount),
    swapMode: 'FIXED_INPUT' as const
  };
}
