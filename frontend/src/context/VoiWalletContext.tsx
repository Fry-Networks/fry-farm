import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import algosdk, { TransactionSigner } from 'algosdk';
import LuteConnect from 'lute-connect';
import { voiWalletService, VoiWalletService } from '../services/VoiWalletService';
import { useChain } from './ChainContext';

type VoiWalletProviderType = 'kibisis' | 'lute' | null;

const CONNECT_TIMEOUT_MS = 5000;
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

const VOI_WALLET_STORAGE_KEY = 'voi-wallet-connection';

interface VoiWalletContextValue {
  address: string | null;
  isConnected: boolean;
  isKibisisAvailable: boolean;
  connect: () => Promise<void>;
  connectLute: () => Promise<void>;
  disconnect: () => void;
  signTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;
  signer: TransactionSigner;
}

const VoiWalletContext = createContext<VoiWalletContextValue | undefined>(undefined);

export const VoiWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<VoiWalletProviderType>(null);
  const luteRef = useRef<LuteConnect | null>(null);
  const restoringRef = useRef(false);
  const needsReconnectRef = useRef(false);
  const { chainId } = useChain();

  // Persist connection to localStorage
  const saveConnection = useCallback((addr: string, provider: VoiWalletProviderType) => {
    try {
      localStorage.setItem(VOI_WALLET_STORAGE_KEY, JSON.stringify({ address: addr, provider }));
    } catch {
      // localStorage may not be available
    }
  }, []);

  const clearConnection = useCallback(() => {
    try {
      localStorage.removeItem(VOI_WALLET_STORAGE_KEY);
    } catch {
      // localStorage may not be available
    }
  }, []);

  // Restore connection on mount — trust localStorage immediately, reconnect extension in background
  useEffect(() => {
    if (restoringRef.current) return;
    restoringRef.current = true;

    let stored: string | null = null;
    try { stored = localStorage.getItem(VOI_WALLET_STORAGE_KEY); } catch { /* ignore */ }
    if (!stored) return;

    let storedAddr: string | undefined;
    let provider: VoiWalletProviderType | undefined;
    try {
      const parsed = JSON.parse(stored);
      storedAddr = parsed.address;
      provider = parsed.provider;
    } catch { return; }
    if (!storedAddr || !provider) return;

    // Immediately show the wallet as connected (address is trusted from localStorage)
    setAddress(storedAddr);
    setActiveProvider(provider);
    needsReconnectRef.current = true;

    // Background: attempt to establish extension/SDK connection for signing
    // On failure: keep address displayed, signing will retry on demand
    const reconnect = async () => {
      try {
        if (provider === 'kibisis') {
          await voiWalletService.connect('voi-mainnet');
          needsReconnectRef.current = false;
        } else if (provider === 'lute') {
          const lute = new LuteConnect('Fry Farm');
          const addresses = await withTimeout(lute.connect('voimain-v1.0'), CONNECT_TIMEOUT_MS, 'Lute connection timed out');
          if (addresses.length > 0) {
            luteRef.current = lute;
            needsReconnectRef.current = false;
          }
        }
      } catch {
        // Extension/wallet not ready — will retry when user signs a transaction
      }
    };
    reconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kibisis connect
  const connect = useCallback(async () => {
    const addr = await voiWalletService.connect(chainId);
    setAddress(addr);
    setActiveProvider('kibisis');
    needsReconnectRef.current = false;
    saveConnection(addr, 'kibisis');
  }, [chainId, saveConnection]);

  // Lute connect
  const connectLute = useCallback(async () => {
    const lute = new LuteConnect('Fry Farm');
    const addresses = await withTimeout(lute.connect('voimain-v1.0'), CONNECT_TIMEOUT_MS, 'Lute connection timed out. Please ensure Lute is running.');
    if (addresses.length > 0) {
      luteRef.current = lute;
      setAddress(addresses[0]);
      setActiveProvider('lute');
      needsReconnectRef.current = false;
      saveConnection(addresses[0], 'lute');
    } else {
      throw new Error('No accounts returned from Lute');
    }
  }, [saveConnection]);

  const disconnect = useCallback(() => {
    voiWalletService.disconnect();
    luteRef.current = null;
    setAddress(null);
    setActiveProvider(null);
    clearConnection();
  }, [clearConnection]);

  const signTransactions = useCallback(async (txns: Uint8Array[]) => {
    // Lazy reconnect: if extension wasn't ready on page load, try now
    if (needsReconnectRef.current) {
      try {
        if (activeProvider === 'kibisis') {
          await voiWalletService.connect('voi-mainnet');
          needsReconnectRef.current = false;
        } else if (activeProvider === 'lute') {
          const lute = new LuteConnect('Fry Farm');
          const addresses = await withTimeout(lute.connect('voimain-v1.0'), CONNECT_TIMEOUT_MS, 'Lute connection timed out');
          if (addresses.length > 0) {
            luteRef.current = lute;
            needsReconnectRef.current = false;
          }
        }
      } catch {
        throw new Error('Wallet extension not available. Please reconnect your wallet.');
      }
    }

    if (activeProvider === 'lute' && luteRef.current) {
      const walletTxns = txns.map((txn) => ({
        txn: Buffer.from(txn).toString('base64'),
      }));
      const signed = await withTimeout(luteRef.current.signTxns(walletTxns), 30000, 'Lute signing timed out. Please try again.');
      return signed.map((s) => {
        if (!s) throw new Error('Null signed transaction from Lute');
        return s;
      });
    }
    return withTimeout(voiWalletService.signTransactions(txns), 35000, 'Wallet signing timed out. Please try again.');
  }, [activeProvider]);

  const signer = useMemo((): TransactionSigner => {
    return async (txnGroup: algosdk.Transaction[], indexesToSign: number[]): Promise<Uint8Array[]> => {
      const encodedTxns = txnGroup.map((txn) => algosdk.encodeUnsignedTransaction(txn));
      const txnsToSign = indexesToSign.map((i) => encodedTxns[i]);
      const signedTxns = await signTransactions(txnsToSign);
      const result: Uint8Array[] = new Array(txnGroup.length).fill(new Uint8Array());
      indexesToSign.forEach((idx, i) => {
        result[idx] = signedTxns[i];
      });
      return result;
    };
  }, [signTransactions]);

  const isKibisisAvailable = useMemo(() => VoiWalletService.isAvailable(), []);

  const value = useMemo<VoiWalletContextValue>(() => ({
    address,
    isConnected: address !== null,
    isKibisisAvailable,
    connect,
    connectLute,
    disconnect,
    signTransactions,
    signer,
  }), [address, isKibisisAvailable, connect, connectLute, disconnect, signTransactions, signer]);

  return <VoiWalletContext.Provider value={value}>{children}</VoiWalletContext.Provider>;
};

export const useVoiWallet = (): VoiWalletContextValue => {
  const context = useContext(VoiWalletContext);
  if (!context) throw new Error('useVoiWallet must be used within a VoiWalletProvider');
  return context;
};
