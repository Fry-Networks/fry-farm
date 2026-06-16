import { NomadexClient, NomadexSwapQuote } from './nomadex';
import { HumbleClient, HumbleSwapQuote } from './humble';
import { SnowballClient, SnowballSwapQuote } from './snowball';
import { Algodv2, Indexer, waitForConfirmation } from 'algosdk';
import { Buffer } from 'buffer';
import { VoiSwapProvider } from './types';

export interface VoiSwapServiceConfig {
  algodClient: Algodv2;
  indexerClient: Indexer;
  walletSignTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;
}

export interface VoiQuoteComparison {
  nomadex?: NomadexSwapQuote;
  humble?: HumbleSwapQuote;
  snowball?: SnowballSwapQuote;
  bestProvider?: VoiSwapProvider;
}

export interface VoiSwapResult {
  success: boolean;
  txId?: string;
  error?: string;
  provider: VoiSwapProvider;
  quote?: NomadexSwapQuote | HumbleSwapQuote | SnowballSwapQuote;
}

export class VoiSwapService {
  private nomadexClient: NomadexClient;
  private humbleClient: HumbleClient;
  private snowballClient: SnowballClient;
  private algodClient: Algodv2;
  private indexerClient: Indexer;
  private walletSignTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;

  constructor(config: VoiSwapServiceConfig) {
    this.nomadexClient = new NomadexClient();
    this.humbleClient = new HumbleClient();
    this.snowballClient = new SnowballClient();
    this.algodClient = config.algodClient;
    this.indexerClient = config.indexerClient;
    this.walletSignTransactions = config.walletSignTransactions;
  }

  getNomadexClient(): NomadexClient {
    return this.nomadexClient;
  }

  getHumbleClient(): HumbleClient {
    return this.humbleClient;
  }

  getSnowballClient(): SnowballClient {
    return this.snowballClient;
  }

  /**
   * Fetch quotes from both Nomadex and Humble in parallel.
   * Returns all available quotes + the best provider by output amount.
   */
  async compareQuotes(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    slippageBps: number = 50,
    userAddress: string = ''
  ): Promise<VoiQuoteComparison> {
    const result: VoiQuoteComparison = {};

    const [nomadexResult, humbleResult, snowballResult] = await Promise.allSettled([
      this.nomadexClient.fetchSwapQuote(fromTokenId, toTokenId, amount, slippageBps),
      userAddress
        ? this.humbleClient.fetchSwapQuote(
            fromTokenId, toTokenId, amount, slippageBps,
            userAddress, this.algodClient, this.indexerClient
          )
        : Promise.reject(new Error('No user address for Humble simulate')),
      userAddress
        ? this.snowballClient.fetchSwapQuote(fromTokenId, toTokenId, amount, slippageBps, userAddress)
        : this.snowballClient.fetchSwapQuote(fromTokenId, toTokenId, amount, slippageBps),
    ]);

    if (nomadexResult.status === 'fulfilled') {
      result.nomadex = nomadexResult.value;
    } else {
      console.log('Nomadex quote failed:', nomadexResult.reason?.message);
    }

    if (humbleResult.status === 'fulfilled') {
      result.humble = humbleResult.value;
    } else {
      console.log('Humble quote failed:', humbleResult.reason?.message);
    }

    if (snowballResult.status === 'fulfilled') {
      result.snowball = snowballResult.value;
    } else {
      console.log('Snowball quote failed:', snowballResult.reason?.message);
    }

    // Pick best provider by highest output amount
    const outputs: { provider: VoiSwapProvider; amount: bigint }[] = [];
    if (result.nomadex) outputs.push({ provider: 'nomadex', amount: result.nomadex.amountOut });
    if (result.humble) outputs.push({ provider: 'humble', amount: result.humble.amountOut });
    if (result.snowball) outputs.push({ provider: 'snowball', amount: result.snowball.amountOut });

    if (outputs.length > 0) {
      outputs.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
      result.bestProvider = outputs[0].provider;
    }

    return result;
  }

  /**
   * Full swap: quote both providers → execute with best.
   */
  async performSwap(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    userAddress: string,
    slippageBps: number = 50
  ): Promise<VoiSwapResult> {
    const quotes = await this.compareQuotes(fromTokenId, toTokenId, amount, slippageBps, userAddress);
    if (!quotes.bestProvider) {
      return { success: false, error: 'No Voi DEX could quote this pair', provider: 'nomadex' };
    }
    return this.performSwapWithProvider(
      fromTokenId, toTokenId, amount, userAddress, quotes.bestProvider, slippageBps
    );
  }

  /**
   * Swap with a specific provider (skip re-quoting if provider already known).
   */
  async performSwapWithProvider(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    userAddress: string,
    provider: VoiSwapProvider,
    slippageBps: number = 50
  ): Promise<VoiSwapResult> {
    try {
      if (provider === 'snowball') {
        return await this.executeSnowballSwap(fromTokenId, toTokenId, amount, userAddress, slippageBps);
      }
      if (provider === 'humble') {
        return await this.executeHumbleSwap(fromTokenId, toTokenId, amount, userAddress, slippageBps);
      }
      return await this.executeNomadexSwap(fromTokenId, toTokenId, amount, userAddress, slippageBps);
    } catch (error) {
      console.error(`${provider} swap failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : `${provider} swap failed`,
        provider,
      };
    }
  }

  private async executeNomadexSwap(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    userAddress: string,
    slippageBps: number
  ): Promise<VoiSwapResult> {
    const quote = await this.nomadexClient.fetchSwapQuote(fromTokenId, toTokenId, amount, slippageBps);
    const base64Txns = await this.nomadexClient.prepareSwapTransactions(
      quote, userAddress, this.algodClient
    );
    const unsignedTxns = base64Txns.map((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
    console.log(`[Nomadex] Unsigned ${unsignedTxns.length} txns, sizes: ${unsignedTxns.map(t => t.length)}`);
    const signedTxns = await this.walletSignTransactions(unsignedTxns);
    console.log(`[Nomadex] Signed ${signedTxns.length} txns, sizes: ${signedTxns.map(t => t.length)}`);
    const result = await this.algodClient.sendRawTransaction(signedTxns).do();
    console.log(`[Nomadex] Submitted, txId: ${result.txId}`);
    const confirmed = await waitForConfirmation(this.algodClient, result.txId, 4);
    console.log(`[Nomadex] Confirmed in round ${confirmed['confirmed-round']}`);

    return { success: true, txId: result.txId, provider: 'nomadex', quote };
  }

  private async executeHumbleSwap(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    userAddress: string,
    slippageBps: number
  ): Promise<VoiSwapResult> {
    const quote = await this.humbleClient.fetchSwapQuote(
      fromTokenId, toTokenId, amount, slippageBps,
      userAddress, this.algodClient, this.indexerClient
    );
    const slippage = slippageBps / 10_000;
    const base64Txns = await this.humbleClient.prepareSwapTransactions(
      quote, userAddress, this.algodClient, this.indexerClient, slippage
    );
    console.log(`[Humble] Built ${base64Txns.length} transactions`);

    const unsignedTxns = base64Txns.map((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
    console.log(`[Humble] Unsigned ${unsignedTxns.length} txns, sizes: ${unsignedTxns.map(t => t.length)}`);
    const signedTxns = await this.walletSignTransactions(unsignedTxns);
    console.log(`[Humble] Signed ${signedTxns.length} txns, sizes: ${signedTxns.map(t => t.length)}`);

    const result = await this.algodClient.sendRawTransaction(signedTxns).do();
    console.log(`[Humble] Submitted, txId: ${result.txId}`);
    const confirmed = await waitForConfirmation(this.algodClient, result.txId, 4);
    console.log(`[Humble] Confirmed in round ${confirmed['confirmed-round']}`);

    return { success: true, txId: result.txId, provider: 'humble', quote };
  }

  private async executeSnowballSwap(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    userAddress: string,
    slippageBps: number
  ): Promise<VoiSwapResult> {
    const quote = await this.snowballClient.fetchSwapQuote(
      fromTokenId, toTokenId, amount, slippageBps, userAddress
    );
    const base64Txns = this.snowballClient.prepareSwapTransactions(quote);
    const unsignedTxns = base64Txns.map((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
    console.log(`[Snowball] Unsigned ${unsignedTxns.length} txns, sizes: ${unsignedTxns.map(t => t.length)}`);
    const signedTxns = await this.walletSignTransactions(unsignedTxns);
    console.log(`[Snowball] Signed ${signedTxns.length} txns, sizes: ${signedTxns.map(t => t.length)}`);
    const result = await this.algodClient.sendRawTransaction(signedTxns).do();
    console.log(`[Snowball] Submitted, txId: ${result.txId}`);
    const confirmed = await waitForConfirmation(this.algodClient, result.txId, 4);
    console.log(`[Snowball] Confirmed in round ${confirmed['confirmed-round']}`);

    return { success: true, txId: result.txId, provider: 'snowball', quote };
  }

  /**
   * Check if a token pair is supported on any Voi DEX.
   */
  async isAssetPairSupported(fromTokenId: number, toTokenId: number): Promise<boolean> {
    const [nomadex, humble, snowball] = await Promise.allSettled([
      this.nomadexClient.isAssetPairSupported(fromTokenId, toTokenId),
      this.humbleClient.isAssetPairSupported(fromTokenId, toTokenId),
      this.snowballClient.isAssetPairSupported(fromTokenId, toTokenId),
    ]);
    return (
      (nomadex.status === 'fulfilled' && nomadex.value) ||
      (humble.status === 'fulfilled' && humble.value) ||
      (snowball.status === 'fulfilled' && snowball.value)
    );
  }
}

export default VoiSwapService;
