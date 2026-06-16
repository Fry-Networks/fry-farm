import algosdk, {
  Algodv2,
  AtomicTransactionComposer,
  getApplicationAddress,
  makeAssetTransferTxnWithSuggestedParams,
  makePaymentTxnWithSuggestedParams,
  SuggestedParams,
  Transaction,
} from 'algosdk';

import { NomadexTokenType, NomadexPool, NomadexSwapQuote, NomadexToken } from './types';
import { getABIMethod, noopSigner } from './poolAbi';
import { calculateOutTokens, calculatePriceImpact } from './amm';
import { loadMarketData, getPools, getTokens, findPool, findToken } from './api';

const FACTORY_APP_ID = 411751;
const BOX_FUND_AMOUNT = 28_500;

export class NomadexClient {
  // ── Data Loading (delegates to shared api.ts cache) ─────────────

  async loadMarketData(): Promise<void> {
    return loadMarketData();
  }

  getTokens(): NomadexToken[] {
    return getTokens();
  }

  getPools(): NomadexPool[] {
    return getPools();
  }

  findPool(tokenAId: number, tokenBId: number): NomadexPool | null {
    return findPool(tokenAId, tokenBId);
  }

  findToken(tokenId: number): NomadexToken | undefined {
    return findToken(tokenId);
  }

  // ── Swap Quote ────────────────────────────────────────────────────

  async fetchSwapQuote(
    fromTokenId: number,
    toTokenId: number,
    amount: bigint,
    slippageBps: number = 50
  ): Promise<NomadexSwapQuote> {
    await loadMarketData();

    const pool = findPool(fromTokenId, toTokenId);
    if (!pool) {
      throw new Error(`No Nomadex pool found for ${fromTokenId} → ${toTokenId}`);
    }

    const isAlphaToBeta = pool.alphaId === fromTokenId;
    const inSupply = BigInt(isAlphaToBeta ? pool.balances[0] : pool.balances[1]);
    const outSupply = BigInt(isAlphaToBeta ? pool.balances[1] : pool.balances[0]);
    const swapFee = BigInt(pool.swapFee);

    const amountOut = calculateOutTokens(amount, inSupply, outSupply, swapFee);
    if (amountOut === 0n) {
      throw new Error('Swap output is zero — amount too small or pool has no liquidity');
    }

    const slippageScale = 10_000n;
    const minAmountOut = amountOut - (amountOut * BigInt(slippageBps)) / slippageScale;
    const priceImpact = calculatePriceImpact(amount, inSupply, outSupply, swapFee);

    const fromToken = findToken(fromTokenId);
    const toToken = findToken(toTokenId);

    return {
      provider: 'nomadex',
      poolId: pool.id,
      fromTokenId,
      fromTokenType: fromToken?.type ?? (fromTokenId === 0 ? NomadexTokenType.ALGO : NomadexTokenType.SMART),
      toTokenId,
      toTokenType: toToken?.type ?? (toTokenId === 0 ? NomadexTokenType.ALGO : NomadexTokenType.SMART),
      amountIn: amount,
      amountOut,
      minAmountOut,
      priceImpact,
      isAlphaToBeta,
      swapFee: pool.swapFee,
    };
  }

  // ── Transaction Building ──────────────────────────────────────────

  async prepareSwapTransactions(
    quote: NomadexSwapQuote,
    userAddress: string,
    algodClient: Algodv2
  ): Promise<string[]> {
    const params = await algodClient.getTransactionParams().do();
    const poolAppAddr = getApplicationAddress(quote.poolId);

    const txns: Transaction[] = [];

    const optinTxns = await this.buildOptinTxns(
      quote.toTokenId, quote.toTokenType, userAddress, algodClient, params
    );
    txns.push(...optinTxns);

    const depositTxn = this.buildDepositTxn(
      quote.fromTokenId, quote.fromTokenType, quote.amountIn, userAddress, poolAppAddr, params
    );

    const swapMethodName = quote.isAlphaToBeta ? 'swapAlphaToBeta' : 'swapBetaToAlpha';
    const minAmountArg = quote.minAmountOut;

    const atc = new AtomicTransactionComposer();

    if (quote.fromTokenType === NomadexTokenType.SMART) {
      const arc200DepositTxns = await this.buildArc200TransferTxns(
        quote.fromTokenId, userAddress, poolAppAddr, quote.amountIn, algodClient, params
      );
      for (const t of txns) {
        t.group = undefined;
        atc.addTransaction({ txn: t, signer: noopSigner });
      }
      for (const t of arc200DepositTxns) {
        t.group = undefined;
        atc.addTransaction({ txn: t, signer: noopSigner });
      }
      atc.addMethodCall({
        sender: userAddress,
        signer: noopSigner,
        appID: quote.poolId,
        method: getABIMethod(swapMethodName),
        methodArgs: [
          { txn: arc200DepositTxns[arc200DepositTxns.length - 1], signer: noopSigner },
          minAmountArg,
        ],
        suggestedParams: { ...params, fee: 3000, flatFee: true },
        appForeignApps: this.getForeignApps(quote),
        appForeignAssets: this.getForeignAssets(quote),
        appAccounts: [poolAppAddr],
        boxes: this.getBoxRefs(quote, userAddress),
      });
    } else {
      for (const t of txns) {
        t.group = undefined;
        atc.addTransaction({ txn: t, signer: noopSigner });
      }
      atc.addMethodCall({
        sender: userAddress,
        signer: noopSigner,
        appID: quote.poolId,
        method: getABIMethod(swapMethodName),
        methodArgs: [
          { txn: depositTxn, signer: noopSigner },
          minAmountArg,
        ],
        suggestedParams: { ...params, fee: 3000, flatFee: true },
        appForeignApps: this.getForeignApps(quote),
        appForeignAssets: this.getForeignAssets(quote),
        appAccounts: [poolAppAddr],
        boxes: this.getBoxRefs(quote, userAddress),
      });
    }

    const builtGroup = atc.buildGroup();
    return builtGroup.map(({ txn }) => {
      txn.group = builtGroup[0].txn.group;
      const encoded = algosdk.encodeUnsignedTransaction(txn);
      return Buffer.from(encoded).toString('base64');
    });
  }

  // ── LP Operations ─────────────────────────────────────────────────

  async prepareAddLiquidityTransactions(
    poolId: number,
    tokenA: { id: number; type: NomadexTokenType },
    tokenB: { id: number; type: NomadexTokenType },
    amountA: bigint,
    amountB: bigint,
    userAddress: string,
    algodClient: Algodv2
  ): Promise<string[]> {
    const params = await algodClient.getTransactionParams().do();
    const poolAppAddr = getApplicationAddress(poolId);
    const pools = getPools();
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) throw new Error(`Pool ${poolId} not found`);

    const isAAlpha = pool.alphaId === tokenA.id;
    const alphaToken = isAAlpha ? tokenA : tokenB;
    const betaToken = isAAlpha ? tokenB : tokenA;
    const alphaAmount = isAAlpha ? amountA : amountB;
    const betaAmount = isAAlpha ? amountB : amountA;

    const atc = new AtomicTransactionComposer();

    const alphaDepositTxn = this.buildDepositTxn(
      alphaToken.id, alphaToken.type, alphaAmount, userAddress, poolAppAddr, params
    );
    const betaDepositTxn = this.buildDepositTxn(
      betaToken.id, betaToken.type, betaAmount, userAddress, poolAppAddr, params
    );

    atc.addMethodCall({
      sender: userAddress,
      signer: noopSigner,
      appID: poolId,
      method: getABIMethod('addLiquidity'),
      methodArgs: [
        { txn: alphaDepositTxn, signer: noopSigner },
        { txn: betaDepositTxn, signer: noopSigner },
      ],
      suggestedParams: { ...params, fee: 4000, flatFee: true },
      appForeignApps: [FACTORY_APP_ID, alphaToken.id, betaToken.id].filter((id) => id > 0),
      appForeignAssets: [alphaToken.id, betaToken.id].filter(
        (id) => id > 0 && (alphaToken.type === NomadexTokenType.ASA || betaToken.type === NomadexTokenType.ASA)
      ),
      appAccounts: [poolAppAddr],
      boxes: [
        { appIndex: poolId, name: algosdk.decodeAddress(userAddress).publicKey },
      ],
    });

    const builtGroup = atc.buildGroup();
    return builtGroup.map(({ txn }) => {
      const encoded = algosdk.encodeUnsignedTransaction(txn);
      return Buffer.from(encoded).toString('base64');
    });
  }

  async prepareRemoveLiquidityTransactions(
    poolId: number,
    lpAmount: bigint,
    userAddress: string,
    algodClient: Algodv2
  ): Promise<string[]> {
    const params = await algodClient.getTransactionParams().do();
    const pools = getPools();
    const pool = pools.find((p) => p.id === poolId);
    if (!pool) throw new Error(`Pool ${poolId} not found`);

    const atc = new AtomicTransactionComposer();

    const alphaOptins = await this.buildOptinTxns(
      pool.alphaId, pool.alphaType, userAddress, algodClient, params
    );
    const betaOptins = await this.buildOptinTxns(
      pool.betaId, pool.betaType, userAddress, algodClient, params
    );

    for (const t of [...alphaOptins, ...betaOptins]) {
      t.group = undefined;
      atc.addTransaction({ txn: t, signer: noopSigner });
    }

    atc.addMethodCall({
      sender: userAddress,
      signer: noopSigner,
      appID: poolId,
      method: getABIMethod('removeLiquidity'),
      methodArgs: [lpAmount],
      suggestedParams: { ...params, fee: 4000, flatFee: true },
      appForeignApps: [FACTORY_APP_ID, pool.alphaId, pool.betaId].filter((id) => id > 0),
      appForeignAssets: [pool.alphaId, pool.betaId].filter(
        (id) => id > 0 && (pool.alphaType === NomadexTokenType.ASA || pool.betaType === NomadexTokenType.ASA)
      ),
      appAccounts: [getApplicationAddress(poolId)],
      boxes: [
        { appIndex: poolId, name: algosdk.decodeAddress(userAddress).publicKey },
      ],
    });

    const builtGroup = atc.buildGroup();
    return builtGroup.map(({ txn }) => {
      const encoded = algosdk.encodeUnsignedTransaction(txn);
      return Buffer.from(encoded).toString('base64');
    });
  }

  async getLpBalance(
    poolId: number,
    userAddress: string,
    algodClient: Algodv2
  ): Promise<bigint> {
    const atc = new AtomicTransactionComposer();
    const params = await algodClient.getTransactionParams().do();

    atc.addMethodCall({
      sender: userAddress,
      signer: noopSigner,
      appID: poolId,
      method: getABIMethod('arc200_balanceOf'),
      methodArgs: [userAddress],
      suggestedParams: params,
      boxes: [
        { appIndex: poolId, name: algosdk.decodeAddress(userAddress).publicKey },
      ],
    });

    const result = await atc.simulate(algodClient);
    const returnValue = result.methodResults[0]?.returnValue;
    return returnValue ? BigInt(returnValue.toString()) : 0n;
  }

  // ── Internal Helpers ──────────────────────────────────────────────

  private buildDepositTxn(
    tokenId: number,
    tokenType: NomadexTokenType,
    amount: bigint,
    sender: string,
    receiver: string,
    params: SuggestedParams
  ): Transaction {
    if (tokenType === NomadexTokenType.ALGO || tokenId === 0) {
      return makePaymentTxnWithSuggestedParams(
        sender, receiver, amount, undefined, undefined, params
      );
    } else if (tokenType === NomadexTokenType.ASA) {
      return makeAssetTransferTxnWithSuggestedParams(
        sender, receiver, undefined, undefined, amount, undefined, tokenId, params
      );
    }
    throw new Error(`Direct deposit not supported for SMART tokens — use ARC-200 transfer`);
  }

  private async buildArc200TransferTxns(
    tokenId: number,
    sender: string,
    receiver: string,
    amount: bigint,
    algodClient: Algodv2,
    params: SuggestedParams
  ): Promise<Transaction[]> {
    const txns: Transaction[] = [];
    const tokenAppAddr = getApplicationAddress(tokenId);

    const needsBox = await this.needsBalanceBox(tokenId, receiver, algodClient, params);
    if (needsBox) {
      txns.push(
        makePaymentTxnWithSuggestedParams(
          sender, tokenAppAddr, BOX_FUND_AMOUNT, undefined, undefined, params
        )
      );
    }

    const atc = new AtomicTransactionComposer();
    atc.addMethodCall({
      sender,
      signer: noopSigner,
      appID: tokenId,
      method: getABIMethod('arc200_transfer'),
      methodArgs: [receiver, amount],
      suggestedParams: { ...params, fee: 2000, flatFee: true },
      boxes: [
        { appIndex: tokenId, name: algosdk.decodeAddress(sender).publicKey },
        { appIndex: tokenId, name: algosdk.decodeAddress(receiver).publicKey },
      ],
    });

    const built = atc.buildGroup();
    txns.push(...built.map(({ txn }) => {
      txn.group = undefined;
      return txn;
    }));

    return txns;
  }

  private async needsBalanceBox(
    tokenId: number,
    address: string,
    algodClient: Algodv2,
    params: SuggestedParams
  ): Promise<boolean> {
    try {
      const atc = new AtomicTransactionComposer();
      atc.addMethodCall({
        sender: address,
        signer: noopSigner,
        appID: tokenId,
        method: getABIMethod('arc200_balanceOf'),
        methodArgs: [address],
        suggestedParams: params,
        boxes: [
          { appIndex: tokenId, name: algosdk.decodeAddress(address).publicKey },
        ],
      });
      const result = await atc.simulate(algodClient);
      const balance = result.methodResults[0]?.returnValue;
      return balance === undefined;
    } catch {
      return true;
    }
  }

  private async buildOptinTxns(
    tokenId: number,
    tokenType: NomadexTokenType,
    userAddress: string,
    algodClient: Algodv2,
    params: SuggestedParams
  ): Promise<Transaction[]> {
    const txns: Transaction[] = [];

    if (tokenType === NomadexTokenType.ASA && tokenId > 0) {
      let isOptedIn = false;
      try {
        const info = await algodClient.accountAssetInformation(userAddress, tokenId).do();
        if (typeof info?.['asset-holding']?.amount !== 'undefined') isOptedIn = true;
      } catch {
        // not opted in
      }
      if (!isOptedIn) {
        txns.push(
          makeAssetTransferTxnWithSuggestedParams(
            userAddress, userAddress, undefined, undefined, 0, undefined, tokenId, params
          )
        );
      }
    } else if (tokenType === NomadexTokenType.SMART && tokenId > 0) {
      const tokenAppAddr = getApplicationAddress(tokenId);
      const needsBox = await this.needsBalanceBox(tokenId, userAddress, algodClient, params);
      if (needsBox) {
        txns.push(
          makePaymentTxnWithSuggestedParams(
            userAddress, tokenAppAddr, BOX_FUND_AMOUNT, undefined, undefined, params
          )
        );
        const atc = new AtomicTransactionComposer();
        atc.addMethodCall({
          sender: userAddress,
          signer: noopSigner,
          appID: tokenId,
          method: getABIMethod('arc200_transfer'),
          methodArgs: [userAddress, 0n],
          suggestedParams: { ...params, fee: 2000, flatFee: true },
          boxes: [
            { appIndex: tokenId, name: algosdk.decodeAddress(userAddress).publicKey },
          ],
        });
        const built = atc.buildGroup();
        txns.push(...built.map(({ txn }) => {
          txn.group = undefined;
          return txn;
        }));
      }
    }
    return txns;
  }

  private getForeignApps(quote: NomadexSwapQuote): number[] {
    const apps: number[] = [FACTORY_APP_ID];
    if (quote.fromTokenType === NomadexTokenType.SMART && quote.fromTokenId > 0) {
      apps.push(quote.fromTokenId);
    }
    if (quote.toTokenType === NomadexTokenType.SMART && quote.toTokenId > 0) {
      apps.push(quote.toTokenId);
    }
    return [...new Set(apps)];
  }

  private getForeignAssets(quote: NomadexSwapQuote): number[] {
    const assets: number[] = [];
    if (quote.fromTokenType === NomadexTokenType.ASA && quote.fromTokenId > 0) {
      assets.push(quote.fromTokenId);
    }
    if (quote.toTokenType === NomadexTokenType.ASA && quote.toTokenId > 0) {
      assets.push(quote.toTokenId);
    }
    return [...new Set(assets)];
  }

  private getBoxRefs(
    quote: NomadexSwapQuote,
    userAddress: string
  ): { appIndex: number; name: Uint8Array }[] {
    const boxes: { appIndex: number; name: Uint8Array }[] = [];
    const userPk = algosdk.decodeAddress(userAddress).publicKey;
    const poolAppAddr = getApplicationAddress(quote.poolId);
    const poolPk = algosdk.decodeAddress(poolAppAddr).publicKey;

    boxes.push({ appIndex: quote.poolId, name: userPk });

    if (quote.toTokenType === NomadexTokenType.SMART && quote.toTokenId > 0) {
      boxes.push({ appIndex: quote.toTokenId, name: userPk });
      boxes.push({ appIndex: quote.toTokenId, name: poolPk });
    }

    if (quote.fromTokenType === NomadexTokenType.SMART && quote.fromTokenId > 0) {
      boxes.push({ appIndex: quote.fromTokenId, name: userPk });
      boxes.push({ appIndex: quote.fromTokenId, name: poolPk });
    }

    return boxes;
  }

  async isAssetPairSupported(fromTokenId: number, toTokenId: number): Promise<boolean> {
    await loadMarketData();
    return findPool(fromTokenId, toTokenId) !== null;
  }
}

export default NomadexClient;
