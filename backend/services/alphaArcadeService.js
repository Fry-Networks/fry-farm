const algosdk = require('algosdk');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { getAlgodClient } = require('./algodService');
const AlphaArcadePool = require('../models/alphaArcadePoolSchema');

const {
  AlphaClient,
  getLiveMarketsFromApi,
  getMarketFromApi,
  getMarketGlobalState,
  checkAssetOptIn,
} = require('@alpha-arcade/sdk');

const MATCHER_APP_ID = 3078581851;
const USDC_ASA_ID = 31566704;
const DEFAULT_SPREAD_BPS = 50;

const INDEXER_NODES = [
  { server: 'https://mainnet-idx.4160.nodely.dev', port: 443 },
  { server: 'https://mainnet-idx.algonode.cloud', port: 443 },
];

let readClient = null;

function getIndexerClient() {
  for (const node of INDEXER_NODES) {
    try {
      return new algosdk.Indexer('', node.server, node.port);
    } catch {
      continue;
    }
  }
  return new algosdk.Indexer('', INDEXER_NODES[0].server, INDEXER_NODES[0].port);
}

/**
 * Lazy-init a read-only AlphaClient for market data queries.
 * Uses a no-op signer (never signs — read-only).
 */
function getReadClient() {
  if (readClient) return readClient;

  const algodClient = getAlgodClient();
  const indexerClient = getIndexerClient();
  const noopSigner = async () => [];
  const dummyAddress = algosdk.getApplicationAddress(MATCHER_APP_ID).toString();

  readClient = new AlphaClient({
    algodClient,
    indexerClient,
    signer: noopSigner,
    activeAddress: dummyAddress,
    matcherAppId: MATCHER_APP_ID,
    usdcAssetId: USDC_ASA_ID,
    // TODO: move ALPHA_ARCADE_API_KEY to 1Password (op://FryFarm/Alpha Arcade/API Key) and inject via op run
    apiKey: process.env.ALPHA_ARCADE_API_KEY || '',
  });

  return readClient;
}

/**
 * Get config object for standalone API functions.
 */
function getApiConfig() {
  return {
    apiKey: process.env.ALPHA_ARCADE_API_KEY || '',
  };
}

const MARKETS_CACHE_KEY = 'alpha_live_markets';
const MARKETS_CACHE_TTL = 300; // 5 min
const MARKETS_STALE_TTL = 3600; // 1 hour stale fallback

/**
 * Fetch all live markets from the Alpha Arcade API.
 * Redis-cached (5-min TTL) with stale fallback on API errors (e.g. 429).
 */
async function getMarkets() {
  // Serve from cache if fresh
  try {
    const cached = await redis.get(MARKETS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* cache miss */ }

  // Cache miss — call external API
  try {
    const config = getApiConfig();
    const markets = await getLiveMarketsFromApi(config);
    try {
      await redis.set(MARKETS_CACHE_KEY, JSON.stringify(markets), 'EX', MARKETS_CACHE_TTL);
      await redis.set(MARKETS_CACHE_KEY + ':stale', JSON.stringify(markets), 'EX', MARKETS_STALE_TTL);
    } catch (e) { /* cache write failed, non-fatal */ }
    return markets;
  } catch (err) {
    // API error (429, timeout, etc.) — try stale cache
    try {
      const stale = await redis.get(MARKETS_CACHE_KEY + ':stale');
      if (stale) {
        logger.warn('Alpha Arcade getMarkets: serving stale cache due to API error: ' + err.message);
        return JSON.parse(stale);
      }
    } catch (e) { /* no stale cache available */ }
    logger.warn('Alpha Arcade getMarkets: API error with no cache fallback, returning empty: ' + err.message);
    return [];
  }
}

/**
 * Fetch a single market by its app ID from the Alpha Arcade API.
 */
async function getMarket(marketAppId) {
  try {
    const client = getReadClient();
    return await client.getMarketOnChain(Number(marketAppId));
  } catch (err) {
    logger.error(`Alpha Arcade getMarket(${marketAppId}) error:`, err.message);
    throw err;
  }
}

/**
 * Fetch reward markets from the Alpha Arcade API.
 */
async function getRewardMarkets() {
  try {
    const client = getReadClient();
    return await client.getRewardMarkets();
  } catch (err) {
    logger.error('Alpha Arcade getRewardMarkets error:', err.message);
    throw err;
  }
}

/**
 * Fetch the full orderbook for a market.
 */
async function getOrderbook(marketAppId) {
  try {
    const client = getReadClient();
    return await client.getOrderbook(Number(marketAppId));
  } catch (err) {
    logger.error(`Alpha Arcade getOrderbook(${marketAppId}) error:`, err.message);
    throw err;
  }
}

/**
 * Find or auto-create a pool record for the given market.
 * On first deposit to a market, creates the pool with defaults + API metadata.
 */
async function getOrCreatePool(marketAppId) {
  const numericId = Number(marketAppId);

  // Check for existing pool
  let pool = await AlphaArcadePool.findOne({ marketAppId: numericId });
  if (pool) return pool;

  // Fetch market metadata from API
  let marketData;
  try {
    marketData = await getMarket(numericId);
  } catch (err) {
    logger.error(`Failed to fetch market ${numericId} for pool auto-creation:`, err.message);
    throw new Error(`Cannot fetch market ${numericId} metadata`);
  }

  if (!marketData) {
    throw new Error(`Market ${numericId} not found on Alpha Arcade`);
  }

  // Fetch on-chain state for YES/NO ASA IDs
  let globalState;
  try {
    const algodClient = getAlgodClient();
    globalState = await getMarketGlobalState(algodClient, numericId);
  } catch (err) {
    logger.error(`Failed to fetch on-chain state for market ${numericId}:`, err.message);
    throw new Error(`Cannot fetch on-chain state for market ${numericId}`);
  }

  const yesAsaId = globalState.yes_asset_id || 0;
  const noAsaId = globalState.no_asset_id || 0;
  const resolutionTime = marketData.endTs || marketData.resolutionTime || marketData.resolution_time || 0;

  pool = await AlphaArcadePool.create({
    creatorId: 'system',
    marketAppId: numericId,
    matcherAppId: MATCHER_APP_ID,
    marketQuestion: marketData.title || marketData.question || '',
    marketCategory: marketData.category || '',
    marketImageUrl: marketData.imageUrl || marketData.image_url || '',
    marketResolutionTime: resolutionTime,
    yesAsaId,
    noAsaId,
    usdcAsaId: USDC_ASA_ID,
    spreadBps: DEFAULT_SPREAD_BPS,
    poolEndTime: resolutionTime,
    isActive: true,
  });

  logger.info(`Auto-created Alpha Arcade pool for market ${numericId}`);
  return pool;
}

/**
 * Build unsigned deposit transactions (split shares + limit orders).
 * Returns base64-encoded unsigned transaction bytes.
 */
async function buildDepositTxns({ wallet, marketAppId, usdcAmount, spreadBps, yesAsaId, noAsaId, feeWallet, feeMicro }) {
  const algodClient = getAlgodClient();
  const numericMarketAppId = Number(marketAppId);
  const spread = spreadBps || DEFAULT_SPREAD_BPS;

  // Fetch market on-chain state
  const globalState = await getMarketGlobalState(algodClient, numericMarketAppId);
  const effectiveYesAsaId = yesAsaId || globalState.yes_asset_id;
  const effectiveNoAsaId = noAsaId || globalState.no_asset_id;
  const marketAddress = algosdk.getApplicationAddress(numericMarketAppId).toString();

  const suggestedParams = await algodClient.getTransactionParams().do();

  const txns = [];
  let optInCosts = 0;

  // 1. Check and add opt-in transactions for YES/NO tokens
  const hasYesOptIn = await checkAssetOptIn(algodClient, wallet, effectiveYesAsaId);
  if (!hasYesOptIn) {
    txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: wallet,
      assetIndex: effectiveYesAsaId,
      amount: 0,
      suggestedParams,
    }));
    optInCosts += 1000;
  }

  const hasNoOptIn = await checkAssetOptIn(algodClient, wallet, effectiveNoAsaId);
  if (!hasNoOptIn) {
    txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: wallet,
      assetIndex: effectiveNoAsaId,
      amount: 0,
      suggestedParams,
    }));
    optInCosts += 1000;
  }

  // 2. ALGO payment to market contract (funds inner transaction fees)
  txns.push(algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    amount: 5000 + optInCosts,
    suggestedParams,
  }));

  // 3. USDC payment to market contract for split shares
  txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    assetIndex: USDC_ASA_ID,
    amount: usdcAmount,
    suggestedParams,
  }));

  // 4. ABI app call — split_shares()uint8
  const splitMethod = algosdk.ABIMethod.fromSignature('split_shares()uint8');
  txns.push(algosdk.makeApplicationCallTxnFromObject({
    sender: wallet,
    appIndex: numericMarketAppId,
    appArgs: [splitMethod.getSelector()],
    foreignAssets: [USDC_ASA_ID, effectiveYesAsaId, effectiveNoAsaId],
    suggestedParams,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  }));

  // Assign group ID to the split group
  if (txns.length > 1) {
    algosdk.assignGroupID(txns);
  }

  // 5. Fee transaction — separate, NOT in the split group
  let feeTxn = null;
  if (feeMicro > 0 && feeWallet) {
    const feeTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: feeWallet,
      assetIndex: USDC_ASA_ID,
      amount: feeMicro,
      suggestedParams,
    });
    feeTxn = Buffer.from(algosdk.encodeUnsignedTransaction(feeTransfer)).toString('base64');
  }

  // Compute mid-price and spread offsets for the response
  const midPrice = 500; // 50 cents default mid-price (in millicents)
  const spreadOffset = Math.floor(midPrice * spread / 10000);

  return {
    unsignedTxns: txns.map(txn => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64')),
    feeTxn,
    yesAsaId: effectiveYesAsaId,
    noAsaId: effectiveNoAsaId,
    marketAddress,
    spreadBps: spread,
    midPrice,
    spreadOffset,
    fee: feeMicro || 0,
  };
}

/**
 * Build unsigned withdraw transactions (cancel orders + merge shares).
 * Returns base64-encoded unsigned transaction bytes.
 */
async function buildWithdrawTxns({ wallet, marketAppId, matcherAppId, escrowAppIds, feeWallet, feeMicro }) {
  const algodClient = getAlgodClient();
  const numericMarketAppId = Number(marketAppId);
  const effectiveMatcherAppId = matcherAppId || MATCHER_APP_ID;

  const globalState = await getMarketGlobalState(algodClient, numericMarketAppId);
  const yesAsaId = globalState.yes_asset_id;
  const noAsaId = globalState.no_asset_id;

  const suggestedParams = await algodClient.getTransactionParams().do();
  const txns = [];

  // 1. Cancel each escrow order
  for (const escrowAppId of (escrowAppIds || [])) {
    txns.push(algosdk.makeApplicationCallTxnFromObject({
      sender: wallet,
      appIndex: numericMarketAppId,
      appArgs: [new TextEncoder().encode('delete_escrow'), algosdk.encodeUint64(escrowAppId)],
      foreignApps: [escrowAppId],
      foreignAssets: [USDC_ASA_ID, yesAsaId, noAsaId],
      accounts: [wallet],
      suggestedParams: { ...suggestedParams, fee: 7000, flatFee: true },
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    }));
  }

  // Assign group ID
  if (txns.length > 1) {
    algosdk.assignGroupID(txns);
  }

  // 2. Fee transfer — separate, NOT in the escrow group
  let feeTxn = null;
  if (feeMicro > 0 && feeWallet) {
    const feeTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: feeWallet,
      assetIndex: USDC_ASA_ID,
      amount: feeMicro,
      suggestedParams,
    });
    feeTxn = Buffer.from(algosdk.encodeUnsignedTransaction(feeTransfer)).toString('base64');
  }

  return {
    unsignedTxns: txns.map(txn => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64')),
    feeTxn,
    yesAsaId,
    noAsaId,
    matcherAppId: effectiveMatcherAppId,
    fee: feeMicro || 0,
  };
}

/**
 * Build unsigned merge_shares transactions (convert YES+NO tokens back to USDC).
 * Used when positions have no escrow orders to cancel.
 */
async function buildMergeSharesTxns({ wallet, marketAppId, amount, feeWallet, feeMicro }) {
  const algodClient = getAlgodClient();
  const numericMarketAppId = Number(marketAppId);

  const globalState = await getMarketGlobalState(algodClient, numericMarketAppId);
  const yesAsaId = globalState.yes_asset_id;
  const noAsaId = globalState.no_asset_id;
  const marketAddress = algosdk.getApplicationAddress(numericMarketAppId).toString();

  const suggestedParams = await algodClient.getTransactionParams().do();
  const txns = [];
  let optInCosts = 0;

  // 1. Check if user needs USDC opt-in
  const hasUsdcOptIn = await checkAssetOptIn(algodClient, wallet, USDC_ASA_ID);
  if (!hasUsdcOptIn) {
    txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: wallet,
      assetIndex: USDC_ASA_ID,
      amount: 0,
      suggestedParams,
    }));
    optInCosts += 1000;
  }

  // 2. ALGO payment to market (funds inner txn fees for sending USDC back)
  txns.push(algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    amount: 5000 + optInCosts,
    suggestedParams,
  }));

  // 3. YES token transfer to market
  txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    assetIndex: yesAsaId,
    amount: amount,
    suggestedParams,
  }));

  // 4. NO token transfer to market
  txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    assetIndex: noAsaId,
    amount: amount,
    suggestedParams,
  }));

  // 5. App call: merge_shares()uint8
  const mergeMethod = algosdk.ABIMethod.fromSignature('merge_shares()uint8');
  txns.push(algosdk.makeApplicationCallTxnFromObject({
    sender: wallet,
    appIndex: numericMarketAppId,
    appArgs: [mergeMethod.getSelector()],
    foreignAssets: [USDC_ASA_ID],
    suggestedParams,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  }));

  // Assign group ID
  algosdk.assignGroupID(txns);

  // Fee transaction — separate, NOT in the merge group
  let feeTxn = null;
  if (feeMicro > 0 && feeWallet) {
    const feeTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: feeWallet,
      assetIndex: USDC_ASA_ID,
      amount: feeMicro,
      suggestedParams,
    });
    feeTxn = Buffer.from(algosdk.encodeUnsignedTransaction(feeTransfer)).toString('base64');
  }

  return {
    unsignedTxns: txns.map(txn => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64')),
    feeTxn,
    yesAsaId,
    noAsaId,
    fee: feeMicro || 0,
  };
}

/**
 * Get the resolution time for a market, with pool cache + live API fallback.
 */
async function getResolutionTime(marketAppId) {
  const pool = await AlphaArcadePool.findOne({ marketAppId: Number(marketAppId) });
  if (pool?.marketResolutionTime > 0) return pool.marketResolutionTime;

  // Fallback: fetch from live API
  let market;
  try {
    market = await getMarket(marketAppId);
  } catch {
    return 0;
  }
  const endTs = market?.endTs || 0;

  // Backfill the pool if found
  if (pool && endTs > 0) {
    await AlphaArcadePool.updateOne({ _id: pool._id }, { $set: { marketResolutionTime: endTs } });
  }
  return endTs;
}

const ORDERBOOK_DEPTH_TTL = 300; // 5 minutes

/**
 * Get total orderbook depth (active liquidity) for a market.
 * Cached in Redis for 5 minutes to minimize API calls.
 */
async function getOrderbookDepth(marketAppId) {
  const cacheKey = `ob_depth:${marketAppId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* cache miss */ }

  try {
    const orderbook = await getOrderbook(marketAppId);
    let totalDepthMicro = 0;
    for (const side of ['yes', 'no']) {
      for (const type of ['bids', 'asks']) {
        for (const entry of (orderbook?.[side]?.[type] || [])) {
          totalDepthMicro += entry.quantity || 0;
        }
      }
    }
    const result = { totalDepthUsdc: totalDepthMicro / 1_000_000 };
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', ORDERBOOK_DEPTH_TTL); } catch (e) { /* ok */ }
    return result;
  } catch (err) {
    logger.warn(`Orderbook depth failed for ${marketAppId}: ${err.message}`);
    return { totalDepthUsdc: 0 };
  }
}

/**
 * Get total token supply (USDC locked) for a market from on-chain state.
 * Fallback when orderbook depth unavailable.
 */
async function getMarketTokenSupply(marketAppId) {
  try {
    const algodClient = getAlgodClient();
    const gs = await getMarketGlobalState(algodClient, Number(marketAppId));
    const totalSupplyMicro = Math.min(gs.yes_supply || 0, gs.no_supply || 0);
    return { totalSupplyUsdc: totalSupplyMicro / 1_000_000 };
  } catch (err) {
    logger.warn(`Token supply failed for ${marketAppId}: ${err.message}`);
    return { totalSupplyUsdc: 0 };
  }
}

/**
 * Get market resolution outcome from on-chain state.
 * @returns {{ isResolved: boolean, outcome: string|null }}
 */
async function getMarketOutcome(marketAppId) {
  try {
    const algodClient = getAlgodClient();
    const globalState = await getMarketGlobalState(algodClient, Number(marketAppId));
    const isResolved = globalState.is_resolved === 1;
    let outcome = null;
    if (isResolved) {
      outcome = globalState.outcome === 1 ? 'yes' : 'no';
    }
    return { isResolved, outcome };
  } catch (err) {
    logger.warn(`Failed to get market outcome for ${marketAppId}: ${err.message}`);
    return { isResolved: false, outcome: null };
  }
}

/**
 * Build unsigned claim transactions for redeeming winning tokens after resolution.
 * Replicates the SDK's claim() transaction structure without signing.
 */
async function buildClaimTxns({ wallet, marketAppId, assetId, amount, feeWallet, feeMicro }) {
  const algodClient = getAlgodClient();
  const numericMarketAppId = Number(marketAppId);
  const marketAddress = algosdk.getApplicationAddress(numericMarketAppId).toString();
  const suggestedParams = await algodClient.getTransactionParams().do();

  const txns = [];

  // 1. Transfer outcome tokens to market contract
  txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    assetIndex: Number(assetId),
    amount: Number(amount),
    suggestedParams,
  }));

  // 2. App call: claim()uint8
  const claimMethod = algosdk.ABIMethod.fromSignature('claim()uint8');
  txns.push(algosdk.makeApplicationCallTxnFromObject({
    sender: wallet,
    appIndex: numericMarketAppId,
    appArgs: [claimMethod.getSelector()],
    foreignAssets: [USDC_ASA_ID, Number(assetId)],
    suggestedParams: { ...suggestedParams, fee: 1000, flatFee: true },
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  }));

  // 3. Close out outcome token (return remainder to market)
  txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: wallet,
    receiver: marketAddress,
    assetIndex: Number(assetId),
    amount: 0,
    closeRemainderTo: marketAddress,
    suggestedParams,
  }));

  // Assign group ID
  algosdk.assignGroupID(txns);

  // 4. Fee transaction (separate, not in claim group)
  let feeTxn = null;
  if (feeMicro > 0 && feeWallet) {
    const feeTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: wallet,
      receiver: feeWallet,
      assetIndex: USDC_ASA_ID,
      amount: feeMicro,
      suggestedParams,
    });
    feeTxn = Buffer.from(algosdk.encodeUnsignedTransaction(feeTransfer)).toString('base64');
  }

  return {
    unsignedTxns: txns.map(txn => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64')),
    feeTxn,
    marketAddress,
    assetId: Number(assetId),
    amount: Number(amount),
    fee: feeMicro || 0,
  };
}

module.exports = {
  getReadClient,
  getMarkets,
  getMarket,
  getRewardMarkets,
  getOrderbook,
  getOrderbookDepth,
  getMarketTokenSupply,
  getOrCreatePool,
  getResolutionTime,
  getMarketOutcome,
  buildDepositTxns,
  buildWithdrawTxns,
  buildMergeSharesTxns,
  buildClaimTxns,
};
