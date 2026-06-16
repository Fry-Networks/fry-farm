const algosdk = require('algosdk');
const logger = require('../config/logger');
const { withFallbackForChain } = require('./algodService');
const { getTreasury } = require('./stakingClaimService');
const BridgeLog = require('../models/bridgeLogSchema');

// ── Aramid Bridge Constants ─────────────────────────────────────────────────

const ARAMID_BRIDGE_ADDRESS = 'ARAMIDFJYV2TOFB5MRNZJIXBSAVZCVAUDAPFGKR5PNX4MTILGAZABBTXQQ';
const ARAMID_VOI_CHAIN_ID = 416101;
const ARAMID_ALGORAND_CHAIN_ID = 416001;
const AVOI_ASA_ON_ALGORAND = 2320775407;
const BRIDGE_FEE_PERCENT = 0.001;       // 0.1%
const BRIDGE_MIN_AMOUNT = 100000;        // 0.1 VOI in microunits — Aramid minimum
const MIN_BRIDGE_THRESHOLD = 1000000;    // 1 VOI in microunits — operational minimum
const NOTE_PREFIX = 'aramid-transfer/v1:j';

// ── Fee Calculation ─────────────────────────────────────────────────────────

/**
 * Calculate the Aramid bridge fee for a given amount.
 * @param {number} amountMicro - Amount in microVOI (before fee)
 * @returns {{ feeAmount: number, destinationAmount: number }}
 */
function calculateBridgeFee(amountMicro) {
  const feeAmount = Math.floor(amountMicro * BRIDGE_FEE_PERCENT);
  const destinationAmount = amountMicro - feeAmount;
  return { feeAmount, destinationAmount };
}

// ── Bridge Function ─────────────────────────────────────────────────────────

/**
 * Bridge native VOI from Voi chain to Algorand as aVOI via Aramid.
 *
 * Sends a payment transaction to the Aramid bridge address on Voi with a
 * JSON-encoded note specifying the destination chain, address, and token.
 * Aramid soldiers auto-deliver aVOI on Algorand (~3 min).
 *
 * @param {number} amountMicro - Amount of VOI to bridge in microunits
 * @param {string} destinationAddress - Algorand address to receive aVOI
 * @param {string} [triggerSource='manual'] - Source that triggered the bridge
 * @returns {Promise<{ success: boolean, txId?: string, amountBridged?: number,
 *   feeAmount?: number, destinationAmount?: number, destinationAddress?: string,
 *   error?: string }>}
 */
async function bridgeVoiToAlgorand(amountMicro, destinationAddress, triggerSource = 'manual') {
  try {
    // ── Validate amount ───────────────────────────────────────────────────
    if (!Number.isFinite(amountMicro) || amountMicro < MIN_BRIDGE_THRESHOLD) {
      const msg = `Amount ${amountMicro} below minimum bridge threshold (${MIN_BRIDGE_THRESHOLD} = ${MIN_BRIDGE_THRESHOLD / 1e6} VOI)`;
      logger.warn(`aramidBridge: ${msg}`);
      return { success: false, error: msg };
    }

    // ── Resolve destination ──────────────────────────────────────────────
    if (!destinationAddress) {
      const { addr } = getTreasury('algorand-mainnet');
      destinationAddress = addr.toString();
    }

    // ── Calculate fee ─────────────────────────────────────────────────────
    const { feeAmount, destinationAmount } = calculateBridgeFee(amountMicro);

    logger.info(`aramidBridge: initiating bridge of ${amountMicro / 1e6} VOI → ${destinationAmount / 1e6} aVOI (fee: ${feeAmount / 1e6}) to ${destinationAddress}`);

    // ── Get treasury ──────────────────────────────────────────────────────
    const { addr: senderAddr, sk: senderSk } = getTreasury('voi-mainnet');
    if (!senderAddr || !senderSk) {
      const msg = 'Voi treasury signing not configured (VOI_REWARD_MNEMONIC missing)';
      logger.error(`aramidBridge: ${msg}`);
      return { success: false, error: msg };
    }

    // ── Build note ────────────────────────────────────────────────────────
    const notePayload = {
      destinationNetwork: ARAMID_ALGORAND_CHAIN_ID,
      destinationAddress,
      destinationToken: String(AVOI_ASA_ON_ALGORAND),
      feeAmount,
      destinationAmount,
      note: 'fry-farm-fee-pipeline',
      sourceAmount: destinationAmount,
    };
    const noteString = NOTE_PREFIX + JSON.stringify(notePayload);
    const noteBytes = new TextEncoder().encode(noteString);

    // ── Submit transaction ────────────────────────────────────────────────
    const txId = await withFallbackForChain('voi-mainnet', async (client) => {
      const params = await client.getTransactionParams().do();

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: senderAddr,
        receiver: ARAMID_BRIDGE_ADDRESS,
        amount: amountMicro,
        note: noteBytes,
        suggestedParams: params,
      });

      const signedTxn = txn.signTxn(senderSk);
      const { txid } = await client.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(client, txid, 4);
      return txid;
    });

    // ── Log to MongoDB ────────────────────────────────────────────────────
    await BridgeLog.create({
      chainId: 'voi-mainnet',
      direction: 'voi-to-algorand',
      sourceAmount: amountMicro,
      bridgeFee: feeAmount,
      destinationAmount,
      destinationAddress,
      destinationToken: String(AVOI_ASA_ON_ALGORAND),
      sourceTxId: txId,
      status: 'pending',
      triggerSource,
    });

    logger.info(`aramidBridge: SUCCESS — txId=${txId}, bridged ${amountMicro / 1e6} VOI, destination gets ${destinationAmount / 1e6} aVOI`);

    return {
      success: true,
      txId,
      amountBridged: amountMicro,
      feeAmount,
      destinationAmount,
      destinationAddress,
    };
  } catch (err) {
    const msg = `Bridge failed: ${err.message}`;
    logger.error(`aramidBridge: ${msg}`, {
      amountMicro,
      destinationAddress,
      stack: err.stack,
    });
    return { success: false, error: msg };
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  bridgeVoiToAlgorand,
  calculateBridgeFee,
  MIN_BRIDGE_THRESHOLD,
  BRIDGE_MIN_AMOUNT,
};
