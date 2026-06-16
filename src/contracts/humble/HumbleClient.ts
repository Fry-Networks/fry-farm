import { Algodv2, Indexer } from 'algosdk';
// @ts-ignore — algosdk-v3 is npm-aliased to algosdk@3.x for ulujs/arccjs compatibility
import algosdk3 from 'algosdk-v3';
import { HumblePoolInfo, HumbleSwapQuote } from './types';
import {
  loadHumbleMarketData,
  findHumblePool,
  findHumbleToken,
  getHumbleTokens,
  getHumblePools,
} from './api';

// ulujs provides the swap class that handles Humble transaction construction
// @ts-ignore — ulujs doesn't ship TS declarations
import { swap as UluSwap, CONTRACT, abi } from 'ulujs';

const WVOI_ID = 390001;

/**
 * Create algosdk v3 clients for use with ulujs/arccjs.
 * ulujs depends on arccjs which imports algosdk v3 internally,
 * so the algod/indexer clients passed to UluSwap/CONTRACT must be v3.
 */
function createV3Algod(serverUrl: string, token: string = ''): any {
  return new algosdk3.Algodv2(token, serverUrl, '');
}

function createV3Indexer(serverUrl: string, token: string = ''): any {
  return new algosdk3.Indexer(token, serverUrl, '');
}

/** Extract the base server URL from a v2 Algodv2 or Indexer client */
function extractBaseUrl(client: any): string {
  // algosdk v2 internal: client.c.bc.baseURL is a URL object
  const url = client?.c?.bc?.baseURL;
  if (url?.href) return url.href.replace(/\/$/, '');
  if (url?.toString) return url.toString().replace(/\/$/, '');
  return '';
}

// Pool ABI spec from humble-interface/src/constants/poolSpec.ts
const POOL_SPEC = {
  name: 'pool',
  desc: 'pool',
  methods: [
    { name: 'custom', args: [], returns: { type: 'void' } },
    {
      name: 'Info',
      args: [],
      returns: {
        type: '((uint256,uint256),(uint256,uint256),(uint256,uint256,uint256,address,byte),(uint256,uint256),uint64,uint64)',
      },
      readonly: true,
    },
    {
      name: 'Trader_swapAForB',
      args: [{ type: 'byte' }, { type: 'uint256' }, { type: 'uint256' }],
      returns: { type: '(uint256,uint256)' },
    },
    {
      name: 'Trader_swapBForA',
      args: [{ type: 'byte' }, { type: 'uint256' }, { type: 'uint256' }],
      returns: { type: '(uint256,uint256)' },
    },
    {
      name: 'arc200_balanceOf',
      args: [{ type: 'address', name: 'owner' }],
      returns: { type: 'uint256' },
      readonly: true,
    },
  ],
  events: [],
};

// Cache pool info to avoid repeated on-chain reads during quote comparison
const poolInfoCache: Map<number, { info: HumblePoolInfo; ts: number }> = new Map();
const POOL_INFO_CACHE_TTL = 30_000; // 30 seconds

export class HumbleClient {
  // ── Data Loading ────────────────────────────────────────────────

  async loadMarketData(): Promise<void> {
    return loadHumbleMarketData();
  }

  getTokens() {
    return getHumbleTokens();
  }

  getPools() {
    return getHumblePools();
  }

  // ── Pool Info (reserves + fees) via simulate ────────────────────

  async fetchPoolInfo(
    poolId: number,
    userAddr: string,
    algodClient: Algodv2,
    indexerClient: Indexer
  ): Promise<HumblePoolInfo> {
    // Check cache
    const cached = poolInfoCache.get(poolId);
    if (cached && Date.now() - cached.ts < POOL_INFO_CACHE_TTL) {
      return cached.info;
    }

    const acc = { addr: userAddr, sk: new Uint8Array(0) };
    const v3Algod = createV3Algod(extractBaseUrl(algodClient));
    const v3Indexer = createV3Indexer(extractBaseUrl(indexerClient));

    const ci = new UluSwap(poolId, v3Algod, v3Indexer, { acc });
    const infoR = await ci.Info();

    if (!infoR.success) {
      throw new Error(`Humble Info() failed for pool ${poolId}: ${infoR.error || 'unknown error'}`);
    }

    const info = infoR.returnValue as HumblePoolInfo;

    // Cache it
    poolInfoCache.set(poolId, { info, ts: Date.now() });

    return info;
  }

  // ── Swap Quote (simulate swap to get expected output) ────────────

  async fetchSwapQuote(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    slippageBps: number,
    userAddr: string,
    algodClient: Algodv2,
    indexerClient: Indexer
  ): Promise<HumbleSwapQuote> {
    await loadHumbleMarketData();

    // Map native VOI to wVOI for pool lookup
    const effectiveFrom = fromTokenId === 0 ? WVOI_ID : fromTokenId;
    const effectiveTo = toTokenId === 0 ? WVOI_ID : toTokenId;

    const poolRaw = findHumblePool(effectiveFrom, effectiveTo);
    if (!poolRaw) {
      throw new Error(`No Humble pool for ${fromTokenId} → ${toTokenId}`);
    }

    const poolId = Number(poolRaw.poolId);

    // Get pool info for reserves and fee data
    const info = await this.fetchPoolInfo(poolId, userAddr, algodClient, indexerClient);

    // Determine swap direction
    const isAToB = info.tokA === effectiveFrom;

    // Simulate the swap to get exact output
    const acc = { addr: userAddr, sk: new Uint8Array(0) };
    const v3Algod = createV3Algod(extractBaseUrl(algodClient));
    const v3Indexer = createV3Indexer(extractBaseUrl(indexerClient));
    const ci = new CONTRACT(poolId, v3Algod, v3Indexer, POOL_SPEC, acc);
    ci.setFee(4000);

    const swapMethod = isAToB ? 'Trader_swapAForB' : 'Trader_swapBForA';
    const simResult = await ci[swapMethod](1, amount, 0n);

    if (!simResult.success) {
      throw new Error(`Humble ${swapMethod} simulation failed: ${simResult.error || 'unknown'}`);
    }

    const [outA, outB] = simResult.returnValue;
    const amountOut = isAToB ? BigInt(outB.toString()) : BigInt(outA.toString());

    if (amountOut === 0n) {
      throw new Error('Swap output is zero — amount too small or pool has no liquidity');
    }

    // Calculate min amount out with slippage
    const slippageScale = 10_000n;
    const minAmountOut = amountOut - (amountOut * BigInt(slippageBps)) / slippageScale;

    // Calculate price impact from reserves
    const reserveIn = BigInt(isAToB ? info.poolBals.A : info.poolBals.B);
    const reserveOut = BigInt(isAToB ? info.poolBals.B : info.poolBals.A);
    let priceImpact = 0;
    if (reserveIn > 0n && reserveOut > 0n) {
      const spotPrice = Number(reserveOut) / Number(reserveIn);
      const execPrice = Number(amountOut) / Number(amount);
      priceImpact = Math.max(0, (spotPrice - execPrice) / spotPrice);
    }

    return {
      provider: 'humble',
      poolId,
      fromTokenId,
      toTokenId,
      amountIn: amount,
      amountOut,
      minAmountOut,
      priceImpact,
      isAToB,
      totFee: info.protoInfo.totFee,
    };
  }

  // ── Build Swap Transactions (uses ulujs swap class) ─────────────

  async prepareSwapTransactions(
    quote: HumbleSwapQuote,
    userAddr: string,
    algodClient: Algodv2,
    indexerClient: Indexer,
    slippage: number = 0.005 // 0.5% default
  ): Promise<string[]> {
    await loadHumbleMarketData();

    const acc = { addr: userAddr, sk: new Uint8Array(0) };
    const v3Algod = createV3Algod(extractBaseUrl(algodClient));
    const v3Indexer = createV3Indexer(extractBaseUrl(indexerClient));
    const ci = new UluSwap(quote.poolId, v3Algod, v3Indexer, { acc });

    // Look up token metadata for A and B
    const effectiveFrom = quote.fromTokenId === 0 ? WVOI_ID : quote.fromTokenId;
    const effectiveTo = quote.toTokenId === 0 ? WVOI_ID : quote.toTokenId;
    const fromToken = findHumbleToken(effectiveFrom);
    const toToken = findHumbleToken(effectiveTo);

    // Get pool info to know tokA/tokB order
    const info = await this.fetchPoolInfo(quote.poolId, userAddr, algodClient, indexerClient);

    // Build token objects matching ulujs swap() expectations
    const fromDecimals = fromToken?.decimals ?? 6;
    const toDecimals = toToken?.decimals ?? 6;
    const humanAmount = Number(quote.amountIn) / Math.pow(10, fromDecimals);
    const humanToAmount = Number(quote.amountOut) / Math.pow(10, toDecimals);

    const A: any = {
      contractId: effectiveFrom,
      amount: humanAmount.toString(),
      decimals: String(fromDecimals),
      symbol: fromToken?.symbol || 'TOKEN',
      // If native VOI, set tokenId to 0 for wVOI wrapping
      ...(quote.fromTokenId === 0 ? { tokenId: '0' } : {}),
    };

    const B: any = {
      contractId: effectiveTo,
      amount: humanToAmount.toString(),
      decimals: String(toDecimals),
      symbol: toToken?.symbol || 'TOKEN',
      ...(quote.toTokenId === 0 ? { tokenId: '0' } : {}),
    };

    const swapR = await ci.swap(userAddr, quote.poolId, A, B, [], {
      debug: false,
      slippage,
      degenMode: false,
      skipWithdraw: false,
    });

    if (!swapR?.success) {
      throw new Error(`Humble swap build failed: ${swapR?.error || 'unknown error'}`);
    }

    return swapR.txns as string[];
  }

  // ── Pair Support Check ──────────────────────────────────────────

  async isAssetPairSupported(
    fromTokenId: number,
    toTokenId: number
  ): Promise<boolean> {
    await loadHumbleMarketData();
    return findHumblePool(fromTokenId, toTokenId) !== null;
  }
}

export default HumbleClient;
