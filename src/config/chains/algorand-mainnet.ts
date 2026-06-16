import { ChainConfig } from './types';

/** Algorand Mainnet configuration — values sourced from existing VITE_* env vars */
export const algorandMainnet: ChainConfig = {
  chainId: 'algorand-mainnet',
  displayName: 'Algorand',
  family: 'avm',
  nativeAsset: {
    name: 'Algo',
    symbol: 'ALGO',
    decimals: 6,
    id: 0,
  },
  fryTokenId: Number(import.meta.env.VITE_FRY_TOKEN_ID) || 2485314946,
  usdcEquivalent: { id: 31566704, symbol: 'USDC', decimals: 6 },
  feeRecipient: import.meta.env.VITE_FEE_RECIPIENT || 'AM53XSHRSSSZMNFAMKVAJFXHPMIYYUUBOVCODJ2LQY3D27CVXAHAPIXYXQ',
  feeRouterAppId: Number(import.meta.env.VITE_FEE_ROUTER_APP_ID) || 3509411111,
  feeRouterAddr: import.meta.env.VITE_FEE_ROUTER_ADDR || 'AM53XSHRSSSZMNFAMKVAJFXHPMIYYUUBOVCODJ2LQY3D27CVXAHAPIXYXQ',
  explorerBaseUrl: 'https://explorer.perawallet.app',
  availableDexProviders: ['folks-router', 'vestige', 'tinyman'],
  supportedWallets: ['pera', 'defly', 'daffi', 'exodus', 'lute', 'kibisis'],
  connection: {
    algodServer: import.meta.env.VITE_ALGOD_SERVER || 'https://mainnet-api.algonode.cloud',
    algodPort: Number(import.meta.env.VITE_ALGOD_PORT) || 443,
    algodToken: import.meta.env.VITE_ALGOD_TOKEN || '',
    indexerServer: import.meta.env.VITE_INDEXER_SERVER || 'https://mainnet-idx.algonode.cloud',
    indexerPort: Number(import.meta.env.VITE_INDEXER_PORT) || 443,
    indexerToken: import.meta.env.VITE_INDEXER_TOKEN || '',
  },
  features: {
    staking: true,
    farming: true,
    nftStaking: true,
    deviceStaking: true,
    swap: true,
    predictionLp: true,
    communityEvents: true,
    zap: true,
    p2pSwap: true,
    launches: true,
    drops: true,
  },
};
