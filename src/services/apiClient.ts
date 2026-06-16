import axios from 'axios';
import { authService } from './AuthService';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

// --- Axios instance with cookie-based auth ---
export const authAxios = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Request interceptor: add chain headers (authAxios doesn't inherit global axios interceptors)
authAxios.interceptors.request.use((config) => {
  try {
    const chainId = localStorage.getItem('fry-farm-chain-id') || 'algorand-mainnet';
    config.headers['X-Chain-Id'] = chainId;
    if (chainId === 'voi-mainnet') {
      const voiConn = localStorage.getItem('voi-wallet-connection');
      if (voiConn) {
        const { address } = JSON.parse(voiConn);
        if (address) config.headers['X-Wallet-Address'] = address;
      }
    }
  } catch { /* ignore */ }
  return config;
});

// Response interceptor: clear stale auth on 401
authAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (url.startsWith('/auth/')) {
        authService.clearAuth();
      }
    }
    return Promise.reject(error);
  }
);

// --- Fetch wrapper with cookie-based auth ---
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
  });

  if (response.status === 401) {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/auth/')) {
      authService.clearAuth();
    }
  }

  return response;
}
