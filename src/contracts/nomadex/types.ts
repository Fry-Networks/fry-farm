export enum NomadexTokenType {
  ALGO = 0, // native VOI
  ASA = 1,
  SMART = 2, // ARC-200
}

export interface NomadexToken {
  id: number;
  type: NomadexTokenType;
  decimals: number;
  name: string;
  symbol: string;
}

export interface NomadexPool {
  id: number; // pool app ID
  alphaId: number;
  alphaType: NomadexTokenType;
  betaId: number;
  betaType: NomadexTokenType;
  swapFee: string; // bigint string (fraction of SCALE)
  balances: [string, string]; // [alphaReserve, betaReserve]
  volume: [string, string];
  apr: number;
  online: boolean;
}

export interface NomadexSwapQuote {
  provider: 'nomadex';
  poolId: number;
  fromTokenId: number;
  fromTokenType: NomadexTokenType;
  toTokenId: number;
  toTokenType: NomadexTokenType;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpact: number;
  isAlphaToBeta: boolean;
  swapFee: string;
}
