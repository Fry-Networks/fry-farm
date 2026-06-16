import { FolksRouterClient } from './FolksRouterClient';
import { VestigeLabsClient, VestigeSwapQuote, VestigeSwapParams } from './VestigeLabsClient';
import { HaystackRouterClient, HaystackQuote, HaystackTransactionGroup } from './HaystackRouterClient';
import { Network, SwapMode, SwapParams, SwapQuote } from './types';
import algosdk, { Algodv2, decodeUnsignedTransaction } from 'algosdk';
import { Buffer } from 'buffer';
import { debugSwapParams } from '../utils/debugSwap';

export interface SwapServiceConfig {
  network: Network;
  algodClient: Algodv2;
  walletSignTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;
}

export type SwapProvider = 'folksrouter' | 'vestige' | 'haystack';

export interface SwapResult {
  success: boolean;
  txId?: string;
  error?: string;
  provider: SwapProvider;
  quote?: SwapQuote | VestigeSwapQuote | HaystackQuote;
}

export class SwapService {
  private folksRouterClient: FolksRouterClient;
  private vestigeClient: VestigeLabsClient;
  private haystackClient: HaystackRouterClient;
  private algodClient: Algodv2;
  private walletSignTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;

  constructor(config: SwapServiceConfig) {
    this.folksRouterClient = new FolksRouterClient(config.network);
    this.vestigeClient = new VestigeLabsClient(config.network === Network.MAINNET ? 'mainnet' : 'testnet');

    this.haystackClient = new HaystackRouterClient();

    this.algodClient = config.algodClient;
    this.walletSignTransactions = config.walletSignTransactions;
  }

  /**
   * Perform swap: quote all providers first (no wallet), then execute with the best one (single wallet pop-up)
   */
  async performSwap(
    fromAssetId: number | string,
    toAssetId: number | string,
    amount: number,
    userAddress: string,
    slippageBps: number = 10
  ): Promise<SwapResult> {
    const numericFromAssetId = typeof fromAssetId === 'string' ? parseInt(fromAssetId, 10) : fromAssetId;
    const numericToAssetId = typeof toAssetId === 'string' ? parseInt(toAssetId, 10) : toAssetId;

    // Phase 1: Get quotes from all providers (no wallet interaction)
    const quotes = await this.compareQuotes(numericFromAssetId, numericToAssetId, amount);

    if (!quotes.bestProvider) {
      return {
        success: false,
        error: 'No swap providers could quote this token pair. Try a different pair or amount.',
        provider: 'folksrouter'
      };
    }

    // Phase 2: Execute with the best provider only (single wallet pop-up)
    const provider = quotes.bestProvider;
    try {
      if (provider === 'folksrouter' && quotes.folksRouter) {
        return await this.tryFolksRouterSwap(numericFromAssetId, numericToAssetId, amount, userAddress, slippageBps);
      } else if (provider === 'vestige' && quotes.vestige) {
        return await this.tryVestigeSwap(numericFromAssetId, numericToAssetId, amount, userAddress, slippageBps);
      } else if (provider === 'haystack' && quotes.haystack) {
        return await this.tryHaystackSwap(numericFromAssetId, numericToAssetId, amount, userAddress, slippageBps);
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Swap failed',
        provider
      };
    }

    return {
      success: false,
      error: 'Swap execution failed. Please try again.',
      provider
    };
  }

  /**
   * Execute swap with a pre-selected provider, skipping the redundant compareQuotes() call.
   * Use this when the caller already knows the best provider from a prior quote comparison.
   */
  async performSwapWithProvider(
    fromAssetId: number | string,
    toAssetId: number | string,
    amount: number,
    userAddress: string,
    provider: SwapProvider,
    slippageBps: number = 10
  ): Promise<SwapResult> {
    const numericFromAssetId = typeof fromAssetId === 'string' ? parseInt(fromAssetId, 10) : fromAssetId;
    const numericToAssetId = typeof toAssetId === 'string' ? parseInt(toAssetId, 10) : toAssetId;

    try {
      if (provider === 'folksrouter') {
        return await this.tryFolksRouterSwap(numericFromAssetId, numericToAssetId, amount, userAddress, slippageBps);
      } else if (provider === 'vestige') {
        return await this.tryVestigeSwap(numericFromAssetId, numericToAssetId, amount, userAddress, slippageBps);
      } else if (provider === 'haystack') {
        return await this.tryHaystackSwap(numericFromAssetId, numericToAssetId, amount, userAddress, slippageBps);
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Swap failed',
        provider
      };
    }

    return {
      success: false,
      error: 'Swap execution failed. Please try again.',
      provider
    };
  }

  /**
   * Try swap using FolksRouter
   */
  private async tryFolksRouterSwap(
    fromAssetId: number,
    toAssetId: number,
    amount: number,
    userAddress: string,
    slippageBps: number
  ): Promise<SwapResult> {
    try {
      const swapParams: SwapParams = {
        fromAssetId,
        toAssetId,
        amount: BigInt(amount),
        swapMode: SwapMode.FIXED_INPUT,
      };

      debugSwapParams(fromAssetId, toAssetId, amount);

      const quote = await this.folksRouterClient.fetchSwapQuote(swapParams, 16, 10);
      if (!quote) {
        throw new Error('Quote not available from FolksRouter');
      }

      const base64Txns = await this.folksRouterClient.prepareSwapTransactions(
        swapParams, userAddress, BigInt(slippageBps), quote
      );

      const decodedTxns = base64Txns.map((b64: string) =>
        new Uint8Array(Buffer.from(b64, 'base64'))
      );
      const signedTxns = await this.walletSignTransactions(decodedTxns);
      const result = await this.algodClient.sendRawTransaction(signedTxns).do();

      return {
        success: true,
        txId: result.txId,
        provider: 'folksrouter',
        quote
      };
    } catch (error) {
      console.error('FolksRouter swap failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'FolksRouter swap failed';
      let finalErrorMessage = errorMessage;

      if (errorMessage.includes('missing from')) {
        finalErrorMessage = 'Asset not found in wallet. Please ensure you have opted into the source asset.';
      } else if (errorMessage.includes('insufficient')) {
        finalErrorMessage = 'Insufficient balance for this swap.';
      } else if (errorMessage.includes('400')) {
        finalErrorMessage = 'Transaction rejected. Please check your asset balances and try again.';
      }

      return {
        success: false,
        error: finalErrorMessage,
        provider: 'folksrouter'
      };
    }
  }

  /**
   * Try swap using Vestige Labs API — now with full execution support
   */
  private async tryVestigeSwap(
    fromAssetId: number,
    toAssetId: number,
    amount: number,
    userAddress: string,
    slippageBps: number = 10
  ): Promise<SwapResult> {
    try {
      // Get quote from Vestige
      const vestigeParams: VestigeSwapParams = {
        from_asa: fromAssetId,
        to_asa: toAssetId,
        amount: amount,
        mode: 'sef',
        denominating_asset_id: 31566704
      };

      const quote = await this.vestigeClient.fetchSwapQuote(vestigeParams);

      // Get unsigned transactions from Vestige
      const slippage = slippageBps / 10000; // Convert bps to decimal (e.g. 10 → 0.001)
      const txnResponses = await this.vestigeClient.prepareSwapTransactions(
        quote, userAddress, slippage
      );

      // Decode base64 transactions to Uint8Array[]
      const unsignedTxns = txnResponses.map(t =>
        new Uint8Array(Buffer.from(t.txn, 'base64'))
      );

      // Sign with wallet
      const signedTxns = await this.walletSignTransactions(unsignedTxns);

      // Submit to algod
      const result = await this.algodClient.sendRawTransaction(signedTxns).do();

      return {
        success: true,
        txId: result.txId,
        provider: 'vestige',
        quote
      };
    } catch (error) {
      console.error('Vestige swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Vestige Labs swap failed',
        provider: 'vestige'
      };
    }
  }

  /**
   * Try swap using Haystack Router
   */
  private async tryHaystackSwap(
    fromAssetId: number,
    toAssetId: number,
    amount: number,
    userAddress: string,
    slippageBps: number = 10
  ): Promise<SwapResult> {
    try {
      const quote = await this.haystackClient.fetchSwapQuote(fromAssetId, toAssetId, amount);
      if (!quote || !quote.success) throw new Error('Haystack quote not available');

      const slippage = slippageBps / 10000;
      const txnGroup = await this.haystackClient.prepareSwapTransactions(userAddress, quote, slippage);

      // Decode all transactions
      const allTxns = txnGroup.txns.map(t => new Uint8Array(Buffer.from(t.data, 'base64')));

      // Sign with wallet (sends full group for atomic group display)
      const signedTxns = await this.walletSignTransactions(allTxns);

      // Replace logic-sig txns with pre-signed versions
      const finalTxns = txnGroup.txns.map((t, i) => {
        if (t.hasLogicSig && t.logicSigBlob) {
          return new Uint8Array(Buffer.from(t.logicSigBlob, 'base64'));
        }
        return signedTxns[i];
      });

      const result = await this.algodClient.sendRawTransaction(finalTxns).do();
      return { success: true, txId: result.txId, provider: 'haystack', quote };
    } catch (error) {
      console.error('Haystack swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Haystack swap failed',
        provider: 'haystack'
      };
    }
  }

  /**
   * Get quotes from all providers in parallel and compare
   */
  async compareQuotes(
    fromAssetId: number | string,
    toAssetId: number | string,
    amount: number
  ): Promise<{
    folksRouter?: SwapQuote;
    vestige?: VestigeSwapQuote;
    haystack?: HaystackQuote;
    bestProvider?: SwapProvider;
  }> {
    const numericFromAssetId = typeof fromAssetId === 'string' ? parseInt(fromAssetId, 10) : fromAssetId;
    const numericToAssetId = typeof toAssetId === 'string' ? parseInt(toAssetId, 10) : toAssetId;

    const results: {
      folksRouter?: SwapQuote;
      vestige?: VestigeSwapQuote;
      haystack?: HaystackQuote;
      bestProvider?: SwapProvider;
    } = {};

    // Fetch all quotes in parallel
    const [folksResult, vestigeResult, haystackResult] = await Promise.allSettled([
      // FolksRouter quote
      (async () => {
        const swapParams: SwapParams = {
          fromAssetId: numericFromAssetId,
          toAssetId: numericToAssetId,
          amount: BigInt(amount),
          swapMode: SwapMode.FIXED_INPUT,
        };
        return this.folksRouterClient.fetchSwapQuote(swapParams, 16, 10);
      })(),
      // Vestige quote
      (async () => {
        const vestigeParams: VestigeSwapParams = {
          from_asa: numericFromAssetId,
          to_asa: numericToAssetId,
          amount: amount,
          mode: 'sef',
          denominating_asset_id: 31566704,
        };
        return this.vestigeClient.fetchSwapQuote(vestigeParams);
      })(),
      // Haystack quote (external issue)
      this.haystackClient.fetchSwapQuote(numericFromAssetId, numericToAssetId, amount),
    ]);

    if (folksResult.status === 'fulfilled') {
      results.folksRouter = folksResult.value;
    } else {
      console.log('FolksRouter quote failed:', folksResult.reason?.message || 'Unknown error');
    }

    if (vestigeResult.status === 'fulfilled') {
      results.vestige = vestigeResult.value;
    } else {
      console.log('Vestige quote failed:', vestigeResult.reason?.message || 'Unknown error');
    }

    if (haystackResult.status === 'fulfilled') {
      results.haystack = haystackResult.value;
    } else {
      console.log('Haystack quote failed:', haystackResult.reason?.message || 'Unknown error');
    }

    // Determine best provider based on output amount
    const outputs: { provider: SwapProvider; amount: number }[] = [];

    if (results.folksRouter) {
      outputs.push({ provider: 'folksrouter', amount: Number(results.folksRouter.quoteAmount) });
    }
    if (results.vestige) {
      outputs.push({ provider: 'vestige', amount: results.vestige.amount_out });
    }
    if (results.haystack) {
      outputs.push({ provider: 'haystack', amount: Number(results.haystack.quote || 0) });
    }

    if (outputs.length > 0) {
      outputs.sort((a, b) => b.amount - a.amount);
      results.bestProvider = outputs[0].provider;
    }

    return results;
  }

  /**
   * Check which providers support the given asset pair
   */
  async getSupportedProviders(fromAssetId: number | string, toAssetId: number | string): Promise<{
    folksRouter: boolean;
    vestige: boolean;
    haystack: boolean;
  }> {
    const numericFromAssetId = typeof fromAssetId === 'string' ? parseInt(fromAssetId, 10) : fromAssetId;
    const numericToAssetId = typeof toAssetId === 'string' ? parseInt(toAssetId, 10) : toAssetId;

    const results = {
      folksRouter: false,
      vestige: false,
      haystack: false,
    };

    const [folksResult, vestigeResult, haystackResult] = await Promise.allSettled([
      (async () => {
        const swapParams: SwapParams = {
          fromAssetId: numericFromAssetId,
          toAssetId: numericToAssetId,
          amount: BigInt(1000),
          swapMode: SwapMode.FIXED_INPUT,
        };
        await this.folksRouterClient.fetchSwapQuote(swapParams, 16, 10);
        return true;
      })(),
      this.vestigeClient.isAssetPairSupported(numericFromAssetId, numericToAssetId),
      this.haystackClient.fetchSwapQuote(numericFromAssetId, numericToAssetId, 1000).then(() => true),
    ]);

    if (folksResult.status === 'fulfilled') results.folksRouter = folksResult.value;
    if (vestigeResult.status === 'fulfilled') results.vestige = vestigeResult.value;
    if (haystackResult.status === 'fulfilled') results.haystack = true;

    return results;
  }
}

export default SwapService;
