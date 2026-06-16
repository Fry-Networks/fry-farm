export interface SnowballRoutePool {
  poolId: string;
  dex: string;
  inputAmount: string;
  outputAmount: string;
}

export interface SnowballSwapQuote {
  provider: 'snowball';
  fromTokenId: number;
  toTokenId: number;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpact: number;
  route: { type: string; pools: SnowballRoutePool[] };
  unsignedTransactions: string[]; // base64-encoded, ready to sign
  expiresAt: number;
}
