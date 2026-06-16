import { useMemo } from 'react';
import { useWallet } from '@txnlab/use-wallet';
import { TransactionSigner } from 'algosdk';
import { useChain } from '../context/ChainContext';
import { useVoiWallet } from '../context/VoiWalletContext';
import { ChainId } from '../config/chains';

interface MultiChainWalletValue {
  activeAddress: string | null | undefined;
  isConnected: boolean;
  signTransactions: ((txns: Uint8Array[]) => Promise<Uint8Array[]>) | undefined;
  signer: TransactionSigner | undefined;
  chainId: ChainId;
  /** Algorand wallet providers (for ConnectWallet modal) */
  algorandProviders: ReturnType<typeof useWallet>['providers'];
  /** Voi-specific: is Kibisis extension available */
  isKibisisAvailable: boolean;
  /** Connect Voi wallet (Kibisis) */
  connectVoi: () => Promise<void>;
  /** Connect Voi wallet (Lute) */
  connectLute: () => Promise<void>;
  /** Disconnect Voi wallet */
  disconnectVoi: () => void;
}

/**
 * Unified wallet hook that switches between Algorand (use-wallet v2) and Voi (Kibisis)
 * based on the active chain. Use this in shared UI components (navbar, ConnectWallet, useAuth).
 *
 * Feature-gated pages (staking, farming, etc.) don't render on Voi,
 * so their direct useWallet() calls are safe.
 */
export function useMultiChainWallet(): MultiChainWalletValue {
  const { chainId } = useChain();
  const algorandWallet = useWallet();
  const voiWallet = useVoiWallet();

  const isAlgorand = chainId === 'algorand-mainnet';

  return useMemo(() => ({
    activeAddress: isAlgorand ? algorandWallet.activeAddress : voiWallet.address,
    isConnected: isAlgorand ? !!algorandWallet.activeAddress : voiWallet.isConnected,
    signTransactions: isAlgorand ? algorandWallet.signTransactions : voiWallet.signTransactions,
    signer: isAlgorand ? algorandWallet.signer : voiWallet.signer,
    chainId,
    algorandProviders: algorandWallet.providers,
    isKibisisAvailable: voiWallet.isKibisisAvailable,
    connectVoi: voiWallet.connect,
    connectLute: voiWallet.connectLute,
    disconnectVoi: voiWallet.disconnect,
  }), [
    isAlgorand, chainId,
    algorandWallet.activeAddress, algorandWallet.signTransactions, algorandWallet.signer, algorandWallet.providers,
    voiWallet.address, voiWallet.isConnected, voiWallet.signTransactions, voiWallet.signer,
    voiWallet.isKibisisAvailable, voiWallet.connect, voiWallet.connectLute, voiWallet.disconnect,
  ]);
}
