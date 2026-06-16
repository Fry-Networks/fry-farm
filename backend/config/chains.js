/**
 * Multi-chain configuration for fry.farm backend
 *
 * Each chain has: endpoints (with fallbacks for circuit breaker),
 * indexer endpoints, asset IDs, and feature flags.
 */

const chains = {
  'algorand-mainnet': {
    chainId: 'algorand-mainnet',
    displayName: 'Algorand',
    family: 'avm',
    nativeAsset: { name: 'Algo', symbol: 'ALGO', decimals: 6, id: 0 },
    /** Ordered by priority — circuit breaker in algodService uses this order */
    algodEndpoints: [
      { name: 'ATLAS00', server: 'http://192.168.9.2', port: 4190, token: process.env.ATLAS00_ALGOD_TOKEN || '' },
      { name: 'Nodely', server: 'https://mainnet-api.4160.nodely.dev', port: 443, token: '' },
      { name: 'Algonode', server: 'https://mainnet-api.algonode.cloud', port: 443, token: '' },
    ],
    indexerEndpoints: [
      { name: 'Nodely', server: 'https://mainnet-idx.4160.nodely.dev', port: 443, token: '' },
      { name: 'Algonode', server: 'https://mainnet-idx.algonode.cloud', port: 443, token: '' },
    ],
    fryTokenId: 2485314946,
    usdcId: 31566704,
    feeRecipient: process.env.FEE_RECIPIENT || 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE',
    indexerRetry: { maxAttempts: 3, delayMs: 3000 },
    explorerBaseUrl: 'https://explorer.perawallet.app',
    p2pMarkets: [{ appId: 3494825276, name: 'FRY/ALGO' }],
    feeRouterAddr: 'AM53XSHRSSSZMNFAMKVAJFXHPMIYYUUBOVCODJ2LQY3D27CVXAHAPIXYXQ',
    features: {
      staking: true,
      farming: true,
      nftStaking: true,
      deviceStaking: true,
      swap: true,
      predictionLp: true,
      communityEvents: true,
      p2pSwap: true,
    },
  },
  'voi-mainnet': {
    chainId: 'voi-mainnet',
    displayName: 'Voi',
    family: 'avm',
    nativeAsset: { name: 'Voi', symbol: 'VOI', decimals: 6, id: 0 },
    algodEndpoints: [
      { name: 'ATLAS00', server: 'http://100.69.195.100', port: 4191, token: process.env.ATLAS00_VOI_ALGOD_TOKEN || '' },
      { name: 'Nodely', server: 'https://mainnet-api.voi.nodely.dev', port: 443, token: '' },
    ],
    indexerEndpoints: [
      { name: 'Nodely', server: 'https://mainnet-idx.voi.nodely.dev', port: 443, token: '' },
      { name: 'Nodely-IO', server: 'https://mainnet-idx.voi.nodely.io', port: 443, token: '' },
    ],
    fryTokenId: 48968653,  // vFRY ASA on Voi
    usdcId: null,
    feeRecipient: 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4',
    feeRouterAppId: 49316563,
    feeRouterAddr: 'QNY6X745DRD5QXORZ2E36VDKFNW3IXUGVQ5VNL3V653LP2GQE3PI2P3OPA',
    indexerRetry: { maxAttempts: 6, delayMs: 5000 },
    explorerBaseUrl: 'https://explorer.voi.network',
    p2pMarkets: [{ appId: 48999768, name: 'FRY/VOI' }],
    features: {
      staking: true,
      farming: true,
      nftStaking: true,
      deviceStaking: false,
      swap: false,
      predictionLp: false,
      communityEvents: true,
      p2pSwap: true,
    },
  },
};

const DEFAULT_CHAIN_ID = 'algorand-mainnet';

function getChainConfig(chainId) {
  const config = chains[chainId];
  if (!config) {
    throw new Error(`Unknown chain: ${chainId}. Supported: ${Object.keys(chains).join(', ')}`);
  }
  return config;
}

function getAllChains() {
  return Object.values(chains);
}

function getDefaultChainConfig() {
  return getChainConfig(DEFAULT_CHAIN_ID);
}

function isValidChainId(id) {
  return id in chains;
}

module.exports = {
  chains,
  DEFAULT_CHAIN_ID,
  getChainConfig,
  getAllChains,
  getDefaultChainConfig,
  isValidChainId,
};
