import algosdk, { TransactionSigner } from 'algosdk';
import { getAlgodClient } from '../staking_func';
import { getChainConfig, isAvmChain, ChainId } from '../config/chains';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string;

class AuthService {
  private pendingAuth: Promise<void> | null = null;
  private _authenticated = false;
  private _isAdmin = false;
  private _wallet: string | null = null;
  private checkAuthPromise: Promise<boolean> | null = null;
  private pendingCheck: Promise<{ authenticated: boolean; isAdmin: boolean }> | null = null;
  private _logoutSent = false;

  isAuthenticated(): boolean {
    return this._authenticated;
  }

  getWallet(): string | null {
    return this._wallet;
  }

  isAdmin(): boolean {
    return this._isAdmin;
  }

  clearAuth(): void {
    this._authenticated = false;
    this._isAdmin = false;
    this._wallet = null;
    // DO NOT null pendingAuth — let in-flight auth complete
    // Tell backend to clear the HttpOnly cookie (deduplicated)
    if (!this._logoutSent) {
      this._logoutSent = true;
      fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(() => { this._logoutSent = false; });
    }
  }

  async checkAuth(): Promise<boolean> {
    if (this.checkAuthPromise) return this.checkAuthPromise;
    this.checkAuthPromise = this._checkAuth();
    try {
      return await this.checkAuthPromise;
    } finally {
      this.checkAuthPromise = null;
    }
  }

  private async _checkAuth(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      const data = await res.json();
      this._authenticated = data.authenticated === true;
      this._isAdmin = data.isAdmin === true;
      this._wallet = data.wallet || null;
      return this._authenticated;
    } catch {
      this._authenticated = false;
      this._isAdmin = false;
      this._wallet = null;
      return false;
    }
  }

  async checkSession(wallet: string): Promise<{ authenticated: boolean; isAdmin: boolean }> {
    if (this.pendingCheck) return this.pendingCheck;
    this.pendingCheck = this._doCheckSession(wallet);
    this.pendingCheck.finally(() => { this.pendingCheck = null; });
    return this.pendingCheck;
  }

  private async _doCheckSession(wallet: string): Promise<{ authenticated: boolean; isAdmin: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated && data.wallet === wallet) {
        this._authenticated = true;
        this._isAdmin = data.isAdmin === true;
        this._wallet = wallet;
        return { authenticated: true, isAdmin: this._isAdmin };
      }
    } catch {}
    return { authenticated: false, isAdmin: false };
  }

  async authenticate(
    activeAddress: string,
    signer: TransactionSigner,
    chainId: ChainId = 'algorand-mainnet',
  ): Promise<void> {
    if (this._authenticated && this._wallet === activeAddress) {
      await this.checkAuth();
      if (this._authenticated) return;
    }

    // Coalesce concurrent auth attempts
    if (this.pendingAuth) return this.pendingAuth;

    this.pendingAuth = Promise.race([
      this._doAuth(activeAddress, signer, chainId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Authentication timed out. Please try again.')), 90000)
      ),
    ]);
    try {
      await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async _doAuth(
    activeAddress: string,
    signer: TransactionSigner,
    chainId: ChainId = 'algorand-mainnet',
  ): Promise<void> {
    // Step 1: Get nonce from backend
    const nonceRes = await fetch(`${API_BASE}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chain-Id': chainId || 'algorand-mainnet' },
      body: JSON.stringify({ wallet: activeAddress }),
      credentials: 'include',
    });

    if (!nonceRes.ok) {
      const err = await nonceRes.json().catch(() => ({}));
      throw new Error(err.message || `Auth nonce request failed (${nonceRes.status})`);
    }

    const { nonce } = await nonceRes.json();

    // Step 2: Build a zero self-payment transaction with nonce in note
    // Use chain-specific algod client for Voi or other AVM chains
    let algodClient: algosdk.Algodv2;
    const chainConfig = getChainConfig(chainId);
    if (chainId !== 'algorand-mainnet' && isAvmChain(chainConfig)) {
      const { algodServer, algodPort, algodToken } = chainConfig.connection;
      algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);
    } else {
      algodClient = await getAlgodClient();
    }
    const params = await algodClient.getTransactionParams().do();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: activeAddress,
      to: activeAddress,
      amount: 0,
      note: new TextEncoder().encode(`fry-auth:${nonce}`),
      suggestedParams: params,
    });

    // Step 3: Sign using the wallet's transaction signer
    const signedTxns = await signer([txn], [0]);
    const signedTxnBytes = signedTxns[0];

    // Step 4: Base64-encode the signed transaction
    let signedTxnBase64: string;
    if (typeof Buffer !== 'undefined') {
      signedTxnBase64 = Buffer.from(signedTxnBytes).toString('base64');
    } else {
      let binary = '';
      for (let i = 0; i < signedTxnBytes.length; i++) {
        binary += String.fromCharCode(signedTxnBytes[i]);
      }
      signedTxnBase64 = btoa(binary);
    }

    // Step 5: Verify signed transaction with backend — JWT set as HttpOnly cookie
    const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chain-Id': chainId || 'algorand-mainnet' },
      body: JSON.stringify({
        wallet: activeAddress,
        signedTxn: signedTxnBase64,
        nonce,
      }),
      credentials: 'include',
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error(err.message || `Auth verify failed (${verifyRes.status})`);
    }

    this._authenticated = true;
    this._wallet = activeAddress;

    // Fetch admin status from /auth/me now that cookie is set
    await this._checkAuth();
  }
}

// Singleton export
export const authService = new AuthService();
