import axios from 'axios';

/**
 * Global axios interceptor that adds X-Chain-Id header to ALL axios requests.
 * Reads from localStorage to match ChainContext's persistence.
 * Call once at app startup (before any API calls).
 */
export function setupChainIdInterceptor(): void {
  axios.interceptors.request.use((config) => {
    try {
      const url = config.url || '';
      // Only add chain headers to our own API (relative URLs), not third-party services
      if (!url.startsWith('http')) {
        const chainId = localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet';
        config.headers['X-Chain-Id'] = chainId;
        // Voi: pass wallet address for chain-aware auth (no JWT on Voi)
        if (chainId === 'voi-mainnet') {
          const voiConn = localStorage.getItem('voi-wallet-connection');
          if (voiConn) {
            try {
              const { address } = JSON.parse(voiConn);
              if (address) config.headers['X-Wallet-Address'] = address;
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      // silently skip
    }
    return config;
  });
}
