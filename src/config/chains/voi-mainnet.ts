import { ChainConfig } from './types';

/**
 * Voi Mainnet configuration
 * Voi is AVM-compatible — same algosdk, different endpoints and asset IDs.
 * Contract IDs, FRY token, and fee recipient are null until deployed (later prompts).
 */
export const voiMainnet: ChainConfig = {
  chainId: 'voi-mainnet',
  displayName: 'Voi',
  family: 'avm',
  nativeAsset: {
    name: 'Voi',
    symbol: 'VOI',
    decimals: 6,
    id: 0,
  },
  fryTokenId: 48968653, // vFRY ASA on Voi
  usdcEquivalent: { id: 395614, symbol: 'aUSDC', decimals: 6 },
  feeRecipient: 'NQA76E235VCMZB4KZQSV6IU64IWF2GGCXK4Y3QA7N7ZMI7MVHUQVV5BUD4',
  feeRouterAppId: 49316563,
  feeRouterAddr: 'QNY6X745DRD5QXORZ2E36VDKFNW3IXUGVQ5VNL3V653LP2GQE3PI2P3OPA',
  explorerBaseUrl: 'https://explorer.voi.network',
  availableDexProviders: ['nomadex', 'humble', 'snowball'],
  supportedWallets: ['kibisis', 'lute'],
  connection: {
    algodServer: import.meta.env.VITE_VOI_ALGOD_SERVER || 'https://mainnet-api.voi.nodely.dev',
    algodPort: Number(import.meta.env.VITE_VOI_ALGOD_PORT) || 443,
    algodToken: import.meta.env.VITE_VOI_ALGOD_TOKEN || '',
    indexerServer: import.meta.env.VITE_VOI_INDEXER_SERVER || 'https://mainnet-idx.voi.nodely.dev',
    indexerPort: Number(import.meta.env.VITE_VOI_INDEXER_PORT) || 443,
    indexerToken: import.meta.env.VITE_VOI_INDEXER_TOKEN || '',
  },
  flatFeeNative: {
    stake: 100000,    // 0.1 VOI
    unstake: 50000,   // 0.05 VOI
    claim: 200000,    // 0.2 VOI
  },
  features: {
    staking: true,
    farming: true,
    nftStaking: true,
    deviceStaking: false,
    swap: true,
    predictionLp: false,
    communityEvents: true,
    zap: false,
    p2pSwap: true,
    launches: false,
    drops: false,
  },
};
