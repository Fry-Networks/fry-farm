export * from './types';
export { algorandMainnet } from './algorand-mainnet';
export { voiMainnet } from './voi-mainnet';

import { ChainConfig, ChainId, ChainFamily, DEFAULT_CHAIN_ID } from './types';
import { algorandMainnet } from './algorand-mainnet';
import { voiMainnet } from './voi-mainnet';

/** Registry of all supported chains */
const chainRegistry: Record<ChainId, ChainConfig> = {
  'algorand-mainnet': algorandMainnet,
  'voi-mainnet': voiMainnet,
};

/** Get config for a specific chain */
export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = chainRegistry[chainId];
  if (!config) {
    throw new Error(`Unknown chain: ${chainId}. Supported: ${Object.keys(chainRegistry).join(', ')}`);
  }
  return config;
}

/** Get all supported chain configs */
export function getAllChains(): ChainConfig[] {
  return Object.values(chainRegistry);
}

/** Get all chains in a specific family */
export function getChainsByFamily(family: ChainFamily): ChainConfig[] {
  return Object.values(chainRegistry).filter(c => c.family === family);
}

/** Get the default chain config */
export function getDefaultChainConfig(): ChainConfig {
  return getChainConfig(DEFAULT_CHAIN_ID);
}

/** Check if a string is a valid ChainId */
export function isValidChainId(id: string): id is ChainId {
  return id in chainRegistry;
}
