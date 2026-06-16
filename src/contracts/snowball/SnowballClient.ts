import axios from 'axios';
import { SnowballSwapQuote } from './types';

const BASE_URL = 'https://api.snowballswap.com';

export class SnowballClient {
  /**
   * Fetch a swap quote from the SnowballSwap aggregator API.
   * When userAddress is provided, the response includes unsigned transactions ready for signing.
   */
  async fetchSwapQuote(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    slippageBps: number = 50,
    userAddress: string = ''
  ): Promise<SnowballSwapQuote> {
    const body: Record<string, unknown> = {
      inputToken: fromTokenId,
      outputToken: toTokenId,
      amount: amount.toString(),
      slippageTolerance: slippageBps / 10_000,
    };
    if (userAddress) {
      body.address = userAddress;
    }

    const { data } = await axios.post(`${BASE_URL}/quote`, body);

    if (data.simulationError) {
      throw new Error(`SnowballSwap simulation error: ${data.simulationError}`);
    }

    const q = data.quote;
    if (!q || !q.outputAmount || q.outputAmount === '0') {
      throw new Error('SnowballSwap returned zero output');
    }

    return {
      provider: 'snowball',
      fromTokenId,
      toTokenId,
      amountIn: BigInt(q.inputAmount),
      amountOut: BigInt(q.outputAmount),
      minAmountOut: BigInt(q.minimumOutputAmount),
      priceImpact: q.priceImpact ?? 0,
      route: data.route ?? { type: 'direct', pools: [] },
      unsignedTransactions: data.unsignedTransactions ?? [],
      expiresAt: q.expiresAt ?? 0,
    };
  }

  /**
   * Return the unsigned transactions from a quote.
   * SnowballSwap's API builds them server-side — no extra step needed.
   */
  prepareSwapTransactions(quote: SnowballSwapQuote): string[] {
    if (!quote.unsignedTransactions.length) {
      throw new Error('SnowballSwap quote has no transactions — was the address provided?');
    }
    return quote.unsignedTransactions;
  }

  /**
   * Check if the pair is quotable by attempting a small quote without an address.
   */
  async isAssetPairSupported(fromTokenId: number, toTokenId: number): Promise<boolean> {
    try {
      const { data } = await axios.post(`${BASE_URL}/quote`, {
        inputToken: fromTokenId,
        outputToken: toTokenId,
        amount: '1',
      });
      return !data.simulationError && data.quote?.outputAmount !== '0';
    } catch {
      return false;
    }
  }
}
