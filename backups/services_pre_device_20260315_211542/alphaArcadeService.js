const algosdk = require('algosdk');
const logger = require('../config/logger');
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

/**
 * Fetch all live markets from the Alpha Arcade API.
 */
async function getMarkets() {
  try {
    const config = getApiConfig();
    return await getLiveMarketsFromApi(config);
  } catch (err) {
    logger.error('Alpha Arcade getMarkets error:', err.message);
    throw err;
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

module.exports = {
  getReadClient,
  getMarkets,
  getMarket,
  getRewardMarkets,
  getOrderbook,
  getOrCreatePool,
  getResolutionTime,
  buildDepositTxns,
  buildWithdrawTxns,
  buildMergeSharesTxns,
};
