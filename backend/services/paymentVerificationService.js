const logger = require("../config/logger");
const AiInteraction = require("../models/aiInteractionSchema");
const { getIndexerUrl } = require("./algodService");
const { getChainConfig } = require("../config/chains");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.ok || res.status === 404) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const delay = Math.min(200 * Math.pow(2, attempt - 1), 2000);
      logger.warn(`paymentVerification: retry ${attempt}/${maxRetries} for ${res.status}`);
      await sleep(delay);
      continue;
    }
    throw new Error(`Indexer returned ${res.status}`);
  }
}

/**
 * Verify with retry — polls indexer up to maxAttempts times with delay between.
 * Handles the 2-8 second indexer lag after on-chain confirmation.
 */
async function verifyFryPaymentWithRetry(txId, expectedAmount, senderWallet, chainId = 'algorand-mainnet', assetId = null, maxAttempts = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await verifyFryPayment(txId, expectedAmount, senderWallet, chainId, assetId);
    if (result.verified) return result;
    if (result.error && result.error !== "Transaction not found") return result;
    if (attempt < maxAttempts) {
      logger.info(`paymentVerification: txId ${txId} not indexed yet, retry ${attempt}/${maxAttempts} in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  return { verified: false, error: "Transaction not found after retries (indexer lag)" };
}

/**
 * Verify a FRY payment transaction on Algorand.
 * @param {string} txId - Transaction ID
 * @param {number} expectedAmount - Minimum FRY amount in micro-units
 * @param {string} senderWallet - Expected sender address
 * @returns {{ verified: boolean, error?: string }}
 */
async function verifyFryPayment(txId, expectedAmount, senderWallet, chainId = 'algorand-mainnet', assetId = null) {
  const chainConfig = getChainConfig(chainId);
  const effectiveAssetId = assetId !== null ? assetId : chainConfig.fryTokenId;
  const ADMIN_WALLET = chainConfig.feeRecipient;

  if (effectiveAssetId === null || effectiveAssetId === undefined) {
    return { verified: false, error: `Payment not available on ${chainConfig.displayName}` };
  }
  // Check replay: has this txId already been used?
  const existing = await AiInteraction.findOne({ paymentTxId: txId }).lean();
  if (existing) {
    return { verified: false, error: "Transaction already used" };
  }

  // Query indexer for the transaction
  const url = `${getIndexerUrl(chainId)}/v2/transactions/${txId}`;
  let res;
  try {
    res = await fetchWithRetry(url);
  } catch (err) {
    logger.error(`paymentVerification: indexer error for txId ${txId}: ${err.message}`);
    return { verified: false, error: "Failed to query transaction" };
  }

  if (res.status === 404) {
    return { verified: false, error: "Transaction not found" };
  }

  const json = await res.json();
  const tx = json.transaction;
  if (!tx) {
    return { verified: false, error: "Invalid transaction response" };
  }

  // Must be confirmed
  if (!tx["confirmed-round"]) {
    return { verified: false, error: "Transaction not confirmed" };
  }

  // Validate transaction type and extract receiver/amount
  let receiver, amount;

  if (effectiveAssetId === 0) {
    // Native payment (VOI)
    const pay = tx["payment-transaction"];
    if (tx["tx-type"] !== "pay" || !pay) {
      return { verified: false, error: "Expected native payment transaction" };
    }
    receiver = pay.receiver;
    amount = pay.amount;
  } else {
    // ASA transfer (FRY)
    const axfer = tx["asset-transfer-transaction"];
    if (tx["tx-type"] !== "axfer" || !axfer) {
      return { verified: false, error: "Not an asset transfer transaction" };
    }
    if (axfer["asset-id"] !== effectiveAssetId) {
      return { verified: false, error: `Wrong asset: expected ${effectiveAssetId}, got ${axfer["asset-id"]}` };
    }
    receiver = axfer.receiver;
    amount = axfer.amount;
  }

  // Amount must be sufficient (2% tolerance for price drift)
  const minAcceptable = Math.floor(expectedAmount * 0.98);
  if (amount < minAcceptable) {
    return { verified: false, error: `Insufficient amount: ${amount} < ${minAcceptable} (expected ~${expectedAmount})` };
  }

  // Receiver must be admin wallet
  if (receiver !== ADMIN_WALLET) {
    return { verified: false, error: "Wrong receiver" };
  }

  // Sender must match the authenticated user
  if (tx.sender !== senderWallet) {
    return { verified: false, error: "Sender does not match authenticated wallet" };
  }

  return { verified: true };
}

module.exports = { verifyFryPayment, verifyFryPaymentWithRetry };
