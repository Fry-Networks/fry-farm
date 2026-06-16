import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { authService } from '../services/AuthService';
import { useMultiChainWallet } from './useMultiChainWallet';

export function useAuth() {
  const { activeAddress, signer, chainId } = useMultiChainWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [isAdmin, setIsAdmin] = useState(authService.isAdmin());

  // Guard against concurrent/rapid auth attempts (e.g. signer ref instability)
  const authInFlightRef = useRef(false);

  // Clear auth only on genuine wallet change (same chain), not on chain switch
  const prevAddressRef = useRef(activeAddress);
  const prevChainRef = useRef(chainId);
  useEffect(() => {
    const chainChanged = prevChainRef.current !== chainId;
    prevChainRef.current = chainId;

    if (prevAddressRef.current !== activeAddress) {
      // Only clear auth if address changed on the SAME chain (genuine wallet switch).
      // When chain switches, activeAddress changes (null↔address) but the session is still valid.
      if (prevAddressRef.current !== undefined && !chainChanged) {
        authService.clearAuth();
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
      prevAddressRef.current = activeAddress;
    }
  }, [activeAddress, chainId]);

  // Auto-restore session when wallet address is known (no signing — just cookie check)
  // If no valid session exists, user will auth on-demand via ensureAuth when they take an action
  useEffect(() => {
    if (activeAddress && !isAuthenticated) {
      if (authInFlightRef.current) return;
      authInFlightRef.current = true;
      authService.checkSession(activeAddress)
        .then((session) => {
          if (session.authenticated) {
            setIsAuthenticated(true);
            setIsAdmin(session.isAdmin);
          }
        })
        .catch(() => {})
        .finally(() => { authInFlightRef.current = false; });
    }
  }, [activeAddress, isAuthenticated, chainId]);

  const ensureAuth = useCallback(async (): Promise<void> => {
    if (!activeAddress) {
      throw new Error('Please connect your wallet first.');
    }
    if (!signer) {
      throw new Error('Wallet not ready — signer unavailable. Wait a moment and retry.');
    }

    try {
      await authService.authenticate(activeAddress, signer, chainId);
      setIsAuthenticated(true);
      setIsAdmin(authService.isAdmin());
    } catch (err: any) {
      setIsAuthenticated(false);
      setIsAdmin(false);
      if (err.message?.includes('cancelled') || err.message?.includes('CANCELLED')) {
        toast.error('Sign-in was cancelled. Please approve the signature to continue.');
        throw err;
      }
      if (err.message?.includes('429')) {
        toast.error('Server is busy. Please wait a moment and try again.');
        throw err;
      }
      toast.error(err.message || 'Authentication failed. Please try again.');
      throw err;
    }
  }, [activeAddress, signer, chainId]);

  const clearAuth = useCallback(() => {
    authService.clearAuth();
    setIsAuthenticated(false);
    setIsAdmin(false);
  }, []);

  return {
    ensureAuth,
    isAuthenticated,
    isAdmin,
    clearAuth,
  };
}
