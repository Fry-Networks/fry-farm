/**
 * Vesting Service — off-chain linear vesting for event rewards.
 *
 * Patterns reused:
 * - Module-load rekey signing (rewardsController.js:14-22)
 * - withFallback() circuit-breaker for algod ops (algodService.js:85)
 *
 * NOTE: BigInt is used for the totalAllocation × elapsedMs / durationMs
 * multiplication to avoid JS Number overflow on large microFRY values.
 */

const algosdk = require('algosdk');
const logger = require('../config/logger');
const { withFallback, withFallbackForChain } = require('./algodService');

// Rekey signing setup — copied from rewardsController.js:14-22
let ogAccount, rekeyAccount, treasuryAddr, ogSigningKey, rekeySigningKey;
try {
  ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  treasuryAddr = ogAccount.addr;     // SENDER on rekeyed txns
  ogSigningKey = ogAccount.sk;
  rekeySigningKey = rekeyAccount.sk;
} catch (err) {
  logger.warn('REWARD_MNEMONIC/REWARD_REKEY not configured for vestingService:', err.message);
}

// FRY 2.0 ASA ID (consistent with services/algorandSwapService.js:16)
const FRY_ASA_ID = 2485314946;

/**
 * Compute claimable vesting amount using BigInt.
 * Linear vesting: vested = totalAllocation × elapsed / totalDuration
 *
 * @param {Object} params
 * @param {number} params.totalAllocation - Total microFRY allocated
 * @param {number} params.alreadyClaimed - microFRY already claimed
 * @param {Date|string} params.vestingStartDate
 * @param {number} params.durationDays
 * @returns {{ vestedAmount, claimableAmount, percentVested, vestingEndDate, isFullyVested }}
 */
function computeClaimable({ totalAllocation, alreadyClaimed, vestingStartDate, durationDays }) {
  const now = Date.now();
  const startMs = new Date(vestingStartDate).getTime();
  const durationMs = durationDays * 24 * 60 * 60 * 1000;
  const endMs = startMs + durationMs;

  // Elapsed clamped to [0, duration]
  const elapsedMs = Math.max(0, Math.min(now - startMs, durationMs));

  // BigInt math to avoid Number overflow on large microFRY × ms products
  const totalBI = BigInt(totalAllocation);
  const elapsedBI = BigInt(elapsedMs);
  const durationBI = BigInt(durationMs);
  const vestedAmount = durationBI > 0n
    ? Number((totalBI * elapsedBI) / durationBI)
    : 0;

  const claimableAmount = Math.max(0, vestedAmount - alreadyClaimed);
  const percentVested = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 0;

  return {
    vestedAmount,
    claimableAmount,
    percentVested,
    vestingEndDate: new Date(endMs),
    isFullyVested: elapsedMs >= durationMs,
  };
}

/**
 * Send vested ASA tokens to participant via the rekey wallet.
 *
 * @param {string} recipientWallet - Algorand address
 * @param {number} microAmount - microFRY amount
 * @param {number} [asaId=FRY_ASA_ID] - ASA to send (defaults to FRY 2.0)
 * @returns {Promise<{ txId: string }>}
 */
async function sendVestedTokens(recipientWallet, microAmount, asaId = FRY_ASA_ID, chainId = 'algorand-mainnet') {
  if (!ogSigningKey || !rekeySigningKey) {
    throw new Error('Vesting signing keys not configured');
  }
  if (microAmount <= 0) {
    throw new Error('Claim amount must be positive');
  }

  const result = await withFallbackForChain(chainId, async (client) => {
    // Determine signing key for this chain (rekeyed vs original)
    const acctInfo = await client.accountInformation(treasuryAddr).do();
    const authAddr = acctInfo['auth-addr'] || acctInfo.address;
    const signingKey = (authAddr !== treasuryAddr) ? rekeySigningKey : ogSigningKey;

    const params = await client.getTransactionParams().do();

    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: treasuryAddr,
      receiver: recipientWallet,
      amount: microAmount,
      assetIndex: asaId,
      suggestedParams: params,
    });

    const signedTxn = txn.signTxn(signingKey);
    const { txid } = await client.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(client, txid, 4);

    logger.info(`Vesting claim sent: ${microAmount} microFRY (asa ${asaId}) → ${recipientWallet}, txId: ${txid}`);
    return { txId: txid };
  });

  return result;
}

/**
 * Get vesting status for an event/wallet pair (display API).
 *
 * @param {Object} params
 * @param {Object} params.event - Event document
 * @param {Object} params.eventPoints - EventPoints document for the wallet
 */
function getVestingStatus({ event, eventPoints }) {
  if (!event.vesting || !event.vesting.enabled) {
    return { enabled: false };
  }

  const totalAllocation = eventPoints.vestingAllocation || 0;
  const alreadyClaimed = eventPoints.vestingClaimed || 0;

  if (totalAllocation === 0) {
    return {
      enabled: true,
      qualified: false,
      message: 'No vesting allocation for this wallet',
    };
  }

  const vc = computeClaimable({
    totalAllocation,
    alreadyClaimed,
    vestingStartDate: event.vesting.startDate,
    durationDays: event.vesting.durationDays,
  });

  // Approximate next 24h unlock
  const dailyRate = totalAllocation / event.vesting.durationDays;
  const nextUnlockAmount = vc.isFullyVested ? 0 : Math.floor(dailyRate);

  return {
    enabled: true,
    qualified: true,
    totalAllocation,
    vestedAmount: vc.vestedAmount,
    claimedAmount: alreadyClaimed,
    claimableAmount: vc.claimableAmount,
    vestingStartDate: event.vesting.startDate,
    vestingEndDate: vc.vestingEndDate,
    vestingModel: event.vesting.model || 'linear',
    durationDays: event.vesting.durationDays,
    percentVested: Math.round(vc.percentVested * 100) / 100,
    percentClaimed: totalAllocation > 0
      ? Math.round((alreadyClaimed / totalAllocation) * 10000) / 100
      : 0,
    nextUnlockAmount,
    isFullyVested: vc.isFullyVested,
    rewardAsaId: event.vesting.rewardAsaId || FRY_ASA_ID,
    vestingType: event.vesting.vestingType || 'off-chain',
    appId: event.vesting.appId || null,
    claimCount: eventPoints.vestingClaimCount || 0,
    lastClaimAt: eventPoints.vestingLastClaimAt || null,
    lastClaimTxId: eventPoints.vestingLastClaimTxId || null,
  };
}

module.exports = {
  computeClaimable,
  sendVestedTokens,
  getVestingStatus,
  FRY_ASA_ID,
};
