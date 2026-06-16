const logger = require("../config/logger");
const GasFee = require("../models/gasFeeSchema");
const { getIndexerUrl } = require("./algodService");
const { getChainConfig } = require("../config/chains");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with retry — mirrors paymentVerificationService.js pattern.
 */
async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.ok || res.status === 404) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const delay = Math.min(200 * Math.pow(2, attempt - 1), 2000);
      logger.warn(`feeVerification: retry ${attempt}/${maxRetries} for ${res.status}`);
      await sleep(delay);
      continue;
    }
    throw new Error(`Indexer returned ${res.status}`);
  }
}

/**
 * Verify a fee transaction on-chain via the Algorand indexer.
 *
 * Supports both ASA transfers (tx-type 'axfer') and ALGO payments (tx-type 'pay').
 *
 * @param {string} txId - The fee transaction ID to verify
 * @param {Object} params
 * @param {string} params.senderWallet - Expected sender address
 * @param {string} params.feeRecipient - Expected receiver (treasury wallet)
 * @param {number} params.assetId - ASA ID (0 for ALGO)
 * @param {number} params.expectedMinAmount - Minimum fee amount in micro-units
 * @param {number} [params.tolerancePercent=2] - Acceptable variance below expectedMinAmount
 * @returns {Promise<{verified: boolean, amount?: number, error?: string}>}
 */
async function verifyFeeTransaction(txId, { senderWallet, feeRecipient, assetId, expectedMinAmount, tolerancePercent = 2 }, chainId = 'algorand-mainnet') {
  // 1. Replay check — has this txId already been recorded?
  const existing = await GasFee.findOne({ txId }).lean();
  if (existing) {
    return { verified: false, error: "Fee transaction already used" };
  }

  // 2. Query indexer for the transaction
  const url = `${getIndexerUrl(chainId)}/v2/transactions/${txId}`;
  let res;
  try {
    res = await fetchWithRetry(url);
  } catch (err) {
    logger.error(`feeVerification: indexer error for txId ${txId}: ${err.message}`);
    return { verified: false, error: "Failed to query transaction" };
  }

  if (res.status === 404) {
    return { verified: false, error: "Transaction not found on indexer" };
  }

  const json = await res.json();
  const tx = json.transaction;
  if (!tx) {
    return { verified: false, error: "Invalid transaction response" };
  }

  // 3. Must be confirmed
  if (!tx["confirmed-round"]) {
    return { verified: false, error: "Transaction not confirmed" };
  }

  // 4. Validate based on asset type
  let receiver, amount;

  if (assetId === 0) {
    // ALGO payment
    const pay = tx["payment-transaction"];
    if (tx["tx-type"] !== "pay" || !pay) {
      return { verified: false, error: "Expected ALGO payment transaction" };
    }
    receiver = pay.receiver;
    amount = pay.amount;
  } else {
    // ASA transfer
    const axfer = tx["asset-transfer-transaction"];
    if (tx["tx-type"] !== "axfer" || !axfer) {
      return { verified: false, error: "Expected asset transfer transaction" };
    }
    if (axfer["asset-id"] !== assetId) {
      return { verified: false, error: `Wrong asset: expected ${assetId}, got ${axfer["asset-id"]}` };
    }
    receiver = axfer.receiver;
    amount = axfer.amount;
  }

  // 5. Receiver must be fee recipient (treasury direct) or FeeRouter (routed)
  const chainCfg = getChainConfig(chainId);
  const validReceivers = [feeRecipient];
  if (chainCfg.feeRouterAddr) {
    validReceivers.push(chainCfg.feeRouterAddr);
  }
  if (!validReceivers.includes(receiver)) {
    return { verified: false, error: "Wrong receiver" };
  }

  // 6. Sender must match authenticated user
  if (tx.sender !== senderWallet) {
    return { verified: false, error: "Sender does not match authenticated wallet" };
  }

  // 7. Amount must meet minimum (with tolerance)
  const minAcceptable = Math.floor(expectedMinAmount * (1 - tolerancePercent / 100));
  if (amount < minAcceptable) {
    return { verified: false, error: `Insufficient fee: ${amount} < ${minAcceptable} (expected ~${expectedMinAmount})` };
  }

  return { verified: true, amount };
}

/**
 * Verify with retry — polls indexer up to maxAttempts times with delay between.
 * Handles the 2-8 second indexer lag after on-chain confirmation.
 */
async function verifyFeeTransactionWithRetry(txId, params, chainId = 'algorand-mainnet', maxAttempts = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await verifyFeeTransaction(txId, params, chainId);

    // If verified or a definitive rejection (not just "not found yet"), return immediately
    if (result.verified) return result;
    if (result.error && result.error !== "Transaction not found on indexer") return result;

    // Transaction not indexed yet — retry after delay
    if (attempt < maxAttempts) {
      logger.info(`feeVerification: txId ${txId} not indexed yet, retry ${attempt}/${maxAttempts} in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  return { verified: false, error: "Fee transaction not found after retries (indexer lag)" };
}

module.exports = { verifyFeeTransaction, verifyFeeTransactionWithRetry };
