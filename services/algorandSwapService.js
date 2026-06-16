const algosdk = require('algosdk');
const axios = require('axios');
const logger = require('../config/logger');
const { withFallbackForChain, getAlgodClientForChain } = require('./algodService');
const { getTreasury } = require('./stakingClaimService');
const { getChainConfig } = require('../config/chains');
const SwapLog = require('../models/swapLogSchema');

// ── Constants ────────────────────────────────────────────────────────────────

const FOLKS_BASE = 'https://api.folksrouter.io/v1';
const VESTIGE_BASE = 'https://api.vestigelabs.org';
const REQUEST_TIMEOUT = 15000;

const AVOI_ASA_ID = 2320775407;
const FRY_ASA_ID = 2485314946;
const ALGO_ASA_ID = 0;

const MIN_SWAP_THRESHOLD = parseInt(process.env.AVOI_SWAP_THRESHOLD || '500000000'); // 500 aVOI default
const MAX_SLIPPAGE_BPS = 300;        // 3% for Folks Router
const VESTIGE_SLIPPAGE = 0.03;       // 3% for Vestige
const MAX_PRICE_IMPACT = 0.10;       // 10% — abort if exceeded

const CHAIN_ID = 'algorand-mainnet';

// ── Folks Router: aVOI → ALGO ────────────────────────────────────────────────

/**
 * Get a swap quote from Folks Router.
 * @param {number} fromAsset - Input ASA ID (0 for ALGO)
 * @param {number} toAsset - Output ASA ID (0 for ALGO)
 * @param {number} amount - Amount in microunits
 * @returns {Promise<{ quoteAmount: number, priceImpact: number, txnPayload: string, microalgoTxnsFee: number }>}
 */
async function getFolksQuote(fromAsset, toAsset, amount) {
  const { data } = await axios.get(`${FOLKS_BASE}/fetch/quote`, {
    params: { network: 'mainnet', fromAsset, toAsset, amount, type: 'FIXED_INPUT' },
    timeout: REQUEST_TIMEOUT,
  });
  if (!data.success) {
    throw new Error(`Folks Router quote failed: ${JSON.stringify(data.errors)}`);
  }
  return {
    quoteAmount: Number(data.result.quoteAmount),
    priceImpact: data.result.priceImpact,
    txnPayload: data.result.txnPayload,
    microalgoTxnsFee: data.result.microalgoTxnsFee,
  };
}

/**
 * Prepare, sign, and submit a Folks Router swap.
 * Returns the confirmed transaction ID.
 */
async function executeFolksSwap(userAddress, sk, slippageBps, txnPayload) {
  // Fetch unsigned transactions
  const { data } = await axios.get(`${FOLKS_BASE}/prepare/swap`, {
    params: { userAddress, slippageBps, txnPayload },
    timeout: REQUEST_TIMEOUT,
  });
  if (!data.success) {
    throw new Error(`Folks Router prepare failed: ${JSON.stringify(data.errors)}`);
  }

  const base64Txns = data.result;
  if (!Array.isArray(base64Txns) || base64Txns.length === 0) {
    throw new Error('Folks Router returned empty transaction group');
  }

  // Decode and sign each transaction
  const signedTxns = base64Txns.map((b64) => {
    const txnBytes = Buffer.from(b64, 'base64');
    const txn = algosdk.decodeUnsignedTransaction(txnBytes);
    return txn.signTxn(sk);
  });

  // Submit and confirm
  const txId = await withFallbackForChain(CHAIN_ID, async (client) => {
    const { txid } = await client.sendRawTransaction(signedTxns).do();
    await algosdk.waitForConfirmation(client, txid, 4);
    return txid;
  });

  return txId;
}

// ── Vestige: ALGO → FRY ─────────────────────────────────────────────────────

/**
 * Get a swap quote from Vestige.
 * @param {number} fromAsa - Input ASA ID
 * @param {number} toAsa - Output ASA ID
 * @param {number} amount - Amount in microunits
 * @returns {Promise<{ amountOut: number, priceImpact: number, quote: object }>}
 */
async function getVestigeQuote(fromAsa, toAsa, amount) {
  const { data } = await axios.get(`${VESTIGE_BASE}/swap/v4`, {
    params: { from_asa: fromAsa, to_asa: toAsa, amount, mode: 'sef', network: 'mainnet' },
    timeout: REQUEST_TIMEOUT,
  });
  if (!data || data.amount_out === 0) {
    throw new Error(`Vestige quote returned zero output for ${fromAsa}→${toAsa} amount=${amount}`);
  }
  return {
    amountOut: data.amount_out,
    priceImpact: data.price_impact,
    quote: data,
  };
}

/**
 * Prepare, sign, and submit a Vestige swap.
 * Returns the confirmed transaction ID.
 */
async function executeVestigeSwap(senderAddress, sk, quote, slippage) {
  // Fetch unsigned transactions
  const { data: txnResponses } = await axios.post(
    `${VESTIGE_BASE}/swap/v4/transactions`,
    quote,
    {
      params: { sender: senderAddress, slippage },
      timeout: REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    },
  );

  if (!Array.isArray(txnResponses) || txnResponses.length === 0) {
    throw new Error('Vestige returned empty transaction group');
  }

  // Decode and sign each transaction that requires our signature
  const signedTxns = txnResponses.map((txnResp) => {
    const txnBytes = Buffer.from(txnResp.txn, 'base64');
    const txn = algosdk.decodeUnsignedTransaction(txnBytes);
    return txn.signTxn(sk);
  });

  // Submit and confirm
  const txId = await withFallbackForChain(CHAIN_ID, async (client) => {
    const { txid } = await client.sendRawTransaction(signedTxns).do();
    await algosdk.waitForConfirmation(client, txid, 4);
    return txid;
  });

  return txId;
}

// ── Main Swap Function ───────────────────────────────────────────────────────

/**
 * Swap aVOI → ALGO → FRY via two sequential DEX trades.
 *
 * Leg 1: aVOI → ALGO via Folks Router
 * Leg 2: ALGO → FRY via Vestige
 *
 * @param {number} amountMicroAvoi - Amount of aVOI to swap in microunits
 * @param {string} [triggerSource='manual'] - Source that triggered the swap
 * @returns {Promise<{ success: boolean, leg1TxId?: string, leg2TxId?: string,
 *   inputAmount?: number, intermediateAmount?: number, outputAmount?: number,
 *   route?: string, error?: string }>}
 */
async function swapAvoiToFry(amountMicroAvoi, triggerSource = 'manual') {
  try {
    // ── Validate amount ──────────────────────────────────────────────────
    if (!Number.isFinite(amountMicroAvoi) || amountMicroAvoi < MIN_SWAP_THRESHOLD) {
      const msg = `Amount ${amountMicroAvoi} below minimum swap threshold (${MIN_SWAP_THRESHOLD} = ${MIN_SWAP_THRESHOLD / 1e6} aVOI)`;
      logger.warn(`algorandSwap: ${msg}`);
      return { success: false, error: msg };
    }

    // ── Get treasury ─────────────────────────────────────────────────────
    const { addr: senderAddr, sk: senderSk } = getTreasury(CHAIN_ID);
    if (!senderAddr || !senderSk) {
      const msg = 'Algorand treasury signing not configured (REWARD_MNEMONIC/REWARD_REKEY missing)';
      logger.error(`algorandSwap: ${msg}`);
      return { success: false, error: msg };
    }

    logger.info(`algorandSwap: initiating swap of ${amountMicroAvoi / 1e6} aVOI → FRY for wallet ${senderAddr}`);

    // ── Leg 1: aVOI → ALGO via Folks Router ─────────────────────────────
    logger.info(`algorandSwap: Leg 1 — quoting aVOI → ALGO (${amountMicroAvoi} micro aVOI)`);
    const folksQuote = await getFolksQuote(AVOI_ASA_ID, ALGO_ASA_ID, amountMicroAvoi);

    if (folksQuote.priceImpact > MAX_PRICE_IMPACT) {
      const msg = `Leg 1 price impact too high: ${(folksQuote.priceImpact * 100).toFixed(2)}% (max ${MAX_PRICE_IMPACT * 100}%)`;
      logger.warn(`algorandSwap: ${msg}`);
      return { success: false, error: msg };
    }

    logger.info(`algorandSwap: Leg 1 quote — ${amountMicroAvoi / 1e6} aVOI → ${folksQuote.quoteAmount / 1e6} ALGO (impact: ${(folksQuote.priceImpact * 100).toFixed(2)}%, fee: ${folksQuote.microalgoTxnsFee} microALGO)`);

    const leg1TxId = await executeFolksSwap(senderAddr, senderSk, MAX_SLIPPAGE_BPS, folksQuote.txnPayload);
    logger.info(`algorandSwap: Leg 1 CONFIRMED — txId=${leg1TxId}`);

    // ── Leg 2: ALGO → FRY via Vestige ───────────────────────────────────
    // Use the quoted ALGO amount from Leg 1 (actual received may differ slightly due to slippage)
    const algoForLeg2 = folksQuote.quoteAmount;

    logger.info(`algorandSwap: Leg 2 — quoting ALGO → FRY (${algoForLeg2} micro ALGO)`);
    const vestigeQuote = await getVestigeQuote(ALGO_ASA_ID, FRY_ASA_ID, algoForLeg2);

    if (vestigeQuote.priceImpact > MAX_PRICE_IMPACT) {
      const msg = `Leg 2 price impact too high: ${(vestigeQuote.priceImpact * 100).toFixed(2)}% (max ${MAX_PRICE_IMPACT * 100}%)`;
      logger.warn(`algorandSwap: ${msg} — Leg 1 already executed (txId=${leg1TxId}), ALGO sitting in wallet`);
      return { success: false, error: msg, leg1TxId };
    }

    logger.info(`algorandSwap: Leg 2 quote — ${algoForLeg2 / 1e6} ALGO → ${vestigeQuote.amountOut / 1e6} FRY (impact: ${(vestigeQuote.priceImpact * 100).toFixed(2)}%)`);

    const leg2TxId = await executeVestigeSwap(senderAddr, senderSk, vestigeQuote.quote, VESTIGE_SLIPPAGE);
    logger.info(`algorandSwap: Leg 2 CONFIRMED — txId=${leg2TxId}`);

    // ── Log to MongoDB ───────────────────────────────────────────────────
    await SwapLog.create({
      chainId: CHAIN_ID,
      direction: 'avoi-to-fry',
      inputAsset: AVOI_ASA_ID,
      outputAsset: FRY_ASA_ID,
      inputAmount: amountMicroAvoi,
      outputAmount: vestigeQuote.amountOut,
      expectedOutput: vestigeQuote.amountOut,
      slippage: vestigeQuote.priceImpact,
      route: `aVOI→ALGO(folks:${leg1TxId})→FRY(vestige:${leg2TxId})`,
      txId: leg2TxId,
      wallet: senderAddr,
      status: 'confirmed',
      triggerSource,
      completedAt: new Date(),
    });

    const result = {
      success: true,
      leg1TxId,
      leg2TxId,
      inputAmount: amountMicroAvoi,
      intermediateAmount: folksQuote.quoteAmount,
      outputAmount: vestigeQuote.amountOut,
      route: 'aVOI→ALGO→FRY',
    };

    logger.info(`algorandSwap: SUCCESS — ${amountMicroAvoi / 1e6} aVOI → ${folksQuote.quoteAmount / 1e6} ALGO → ${vestigeQuote.amountOut / 1e6} FRY`);
    return result;
  } catch (err) {
    const msg = `Swap failed: ${err.message}`;
    logger.error(`algorandSwap: ${msg}`, {
      amountMicroAvoi,
      stack: err.stack,
    });
    return { success: false, error: msg };
  }
}

// ── FRY Forwarding ──────────────────────────────────────────────────────────

/**
 * Send all FRY from the swap treasury (HXWYLL) to the admin wallet (E2F2LT).
 * Called after a successful swap to consolidate FRY in the public wallet.
 */
async function sendFryToAdmin() {
  const { addr: senderAddr, sk: senderSk } = getTreasury(CHAIN_ID);
  const { feeRecipient } = getChainConfig(CHAIN_ID);
  const client = getAlgodClientForChain(CHAIN_ID);

  const assetInfo = await client.accountAssetInformation(senderAddr.toString(), FRY_ASA_ID).do();
  const fryBalance = Number(assetInfo.assetHolding?.amount || 0);

  if (fryBalance === 0) {
    return { success: true, action: 'no-fry', amount: 0 };
  }

  const txId = await withFallbackForChain(CHAIN_ID, async (algod) => {
    const params = await algod.getTransactionParams().do();
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: senderAddr,
      receiver: feeRecipient,
      amount: fryBalance,
      assetIndex: FRY_ASA_ID,
      suggestedParams: params,
    });
    const signedTxn = txn.signTxn(senderSk);
    const { txid } = await algod.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(algod, txid, 4);
    return txid;
  });

  logger.info(`algorandSwap: sendFryToAdmin — sent ${fryBalance / 1e6} FRY to ${feeRecipient}, txId=${txId}`);
  return { success: true, txId, amount: fryBalance };
}

// ── Balance Check + Swap ─────────────────────────────────────────────────────

/**
 * Check treasury aVOI balance and swap to FRY if above threshold.
 * Called by orchestrator after every bridge — accumulates until worthwhile.
 * After swap, forwards FRY to the admin wallet (E2F2LT).
 *
 * @param {string} [triggerSource='auto'] - Source that triggered the check
 * @returns {Promise<{ success: boolean, action?: string, balance?: number, threshold?: number, message?: string, ... }>}
 */
async function checkAndSwapAvoiToFry(triggerSource = 'auto') {
  try {
    const { addr } = getTreasury(CHAIN_ID);
    const client = getAlgodClientForChain(CHAIN_ID);
    const assetInfo = await client.accountAssetInformation(addr.toString(), AVOI_ASA_ID).do();
    const balance = Number(assetInfo.assetHolding?.amount || 0);

    logger.info(`algorandSwap: checkAndSwap — aVOI balance=${balance / 1e6} threshold=${MIN_SWAP_THRESHOLD / 1e6} trigger=${triggerSource}`);

    if (balance < MIN_SWAP_THRESHOLD) {
      return {
        success: true,
        action: 'skipped',
        balance,
        threshold: MIN_SWAP_THRESHOLD,
        message: 'aVOI balance below swap threshold, accumulating',
      };
    }

    const swapResult = await swapAvoiToFry(balance, triggerSource);
    if (swapResult.success) {
      const fryForward = await sendFryToAdmin();
      swapResult.fryForwardTxId = fryForward.txId;
      swapResult.fryForwardAmount = fryForward.amount;
    }
    return swapResult;
  } catch (err) {
    const msg = `checkAndSwap failed: ${err.message}`;
    logger.error(`algorandSwap: ${msg}`, { stack: err.stack });
    return { success: false, error: msg };
  }
}

// ── Quote Helper ─────────────────────────────────────────────────────────────

/**
 * Get a combined quote for aVOI → ALGO → FRY without executing.
 * @param {number} amountMicroAvoi - Amount of aVOI in microunits
 * @returns {Promise<{ success: boolean, leg1: object, leg2: object, totalOutput: number, route: string, error?: string }>}
 */
async function getSwapQuote(amountMicroAvoi) {
  try {
    const leg1 = await getFolksQuote(AVOI_ASA_ID, ALGO_ASA_ID, amountMicroAvoi);
    const leg2 = await getVestigeQuote(ALGO_ASA_ID, FRY_ASA_ID, leg1.quoteAmount);
    return {
      success: true,
      leg1: { from: 'aVOI', to: 'ALGO', input: amountMicroAvoi, output: leg1.quoteAmount, priceImpact: leg1.priceImpact },
      leg2: { from: 'ALGO', to: 'FRY', input: leg1.quoteAmount, output: leg2.amountOut, priceImpact: leg2.priceImpact },
      totalOutput: leg2.amountOut,
      route: 'aVOI→ALGO→FRY',
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  swapAvoiToFry,
  checkAndSwapAvoiToFry,
  sendFryToAdmin,
  getSwapQuote,
  MIN_SWAP_THRESHOLD,
  AVOI_ASA_ID,
  FRY_ASA_ID,
};
