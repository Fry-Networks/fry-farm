export interface HumbleToken {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
}

export interface HumblePoolRaw {
  poolId: string;
  tokA: string;
  tokB: string;
  lastRound: number;
  txid?: string;
}

export interface HumblePoolInfo {
  poolBals: { A: string; B: string };
  lptBals: { lpHeld: string; lpMinted: string };
  protoInfo: {
    protoFee: number;
    lpFee: number;
    totFee: number;
    protoAddr: string;
    locked: number;
  };
  protoBals: { A: string; B: string };
  tokA: number;
  tokB: number;
}

export interface HumbleSwapQuote {
  provider: 'humble';
  poolId: number;
  fromTokenId: number;
  toTokenId: number;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpact: number;
  isAToB: boolean;
  totFee: number;
}
