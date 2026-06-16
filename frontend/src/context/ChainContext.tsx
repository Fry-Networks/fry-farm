import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import algosdk from 'algosdk';
import {
  ChainConfig,
  ChainId,
  ChainFeatures,
  DEFAULT_CHAIN_ID,
  isAvmChain,
  getChainConfig,
  getAllChains,
} from '../config/chains';

interface ChainContextValue {
  /** Current active chain config */
  activeChain: ChainConfig;
  /** Current chain ID */
  chainId: ChainId;
  /** All available chains */
  availableChains: ChainConfig[];
  /** Switch to a different chain */
  switchChain: (chainId: ChainId) => void;
  /** Get algod client for the active chain (AVM chains only) */
  getAlgodClient: () => algosdk.Algodv2;
  /** Get indexer client for the active chain (AVM chains only) */
  getIndexerClient: () => algosdk.Indexer;
  /** Check if a feature is available on the active chain */
  hasFeature: (feature: keyof ChainFeatures) => boolean;
}

const ChainContext = createContext<ChainContextValue | undefined>(undefined);

const CHAIN_STORAGE_KEY = 'fry-farm-chain-id';

export const ChainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chainId, setChainId] = useState<ChainId>(() => {
    try {
      const stored = localStorage.getItem(CHAIN_STORAGE_KEY);
      if (stored === 'algorand-mainnet' || stored === 'voi-mainnet') {
        return stored;
      }
    } catch {
      // localStorage may not be available
    }
    return DEFAULT_CHAIN_ID;
  });

  const activeChain = useMemo(() => getChainConfig(chainId), [chainId]);
  const availableChains = useMemo(() => getAllChains(), []);

  const switchChain = useCallback((newChainId: ChainId) => {
    setChainId(newChainId);
    try {
      localStorage.setItem(CHAIN_STORAGE_KEY, newChainId);
    } catch {
      // localStorage may not be available
    }
  }, []);

  const getAlgodClient = useCallback(() => {
    if (!isAvmChain(activeChain)) {
      throw new Error(`getAlgodClient is only available for AVM chains, got ${activeChain.family}`);
    }
    const { algodServer, algodPort, algodToken } = activeChain.connection;
    return new algosdk.Algodv2(algodToken, algodServer, algodPort);
  }, [activeChain]);

  const getIndexerClient = useCallback(() => {
    if (!isAvmChain(activeChain)) {
      throw new Error(`getIndexerClient is only available for AVM chains, got ${activeChain.family}`);
    }
    const { indexerServer, indexerPort, indexerToken } = activeChain.connection;
    return new algosdk.Indexer(indexerToken, indexerServer, indexerPort);
  }, [activeChain]);

  const hasFeature = useCallback(
    (feature: keyof ChainFeatures) => activeChain.features[feature],
    [activeChain]
  );

  const value = useMemo<ChainContextValue>(
    () => ({
      activeChain,
      chainId,
      availableChains,
      switchChain,
      getAlgodClient,
      getIndexerClient,
      hasFeature,
    }),
    [activeChain, chainId, availableChains, switchChain, getAlgodClient, getIndexerClient, hasFeature]
  );

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
};

/** Hook to access chain context */
export const useChain = (): ChainContextValue => {
  const context = useContext(ChainContext);
  if (!context) throw new Error('useChain must be used within a ChainProvider');
  return context;
};
