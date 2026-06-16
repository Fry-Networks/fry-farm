const algosdk = require('algosdk');
const logger = require('../config/logger');
const GasFee = require('../models/gasFeeSchema');
const FeeDistributionLog = require('../models/feeDistributionLogSchema');
const FeeConfig = require('../models/feeConfigSchema');
const { getTreasury } = require('./stakingClaimService');
const { withFallbackForChain } = require('./algodService');
const { bridgeVoiToAlgorand } = require('./aramidBridgeService');
const { checkAndSwapAvoiToFry } = require('./algorandSwapService');

const V2_APP_ID = 3557518709;
const FRY_ASA_ID = 2485314946;
const ELIGIBLE_MAX = 1000;

// Automation wallet (loaded from AUTOMATION_MNEMONIC env var)
let automationAddr, automationSk;
try {
  if (process.env.AUTOMATION_MNEMONIC) {
    const acct = algosdk.mnemonicToSecretKey(process.env.AUTOMATION_MNEMONIC);
    automationAddr = acct.addr;
    automationSk = acct.sk;
    logger.info('feeDistribution: automation wallet configured');
  }
} catch (err) {
  logger.warn('feeDistribution: AUTOMATION_MNEMONIC not configured:', err.message);
}

/**
 * Calculate fee distribution splits.
 * Cron moves 65% (60% stakers + 5% compound) to DistPoolV2.
 * 25% stays in treasury (accounting only). 10% already on-chain via FeeRouter.
 */
function calculateDistribution(totalFeesMicro, feeConfig) {
  const stakerAmount = Math.floor(totalFeesMicro * feeConfig.revShareStakers / 100);
  const compoundAmount = Math.floor(totalFeesMicro * feeConfig.revShareCompound / 100);
  const treasuryRetained = Math.floor(totalFeesMicro * feeConfig.revShareTreasury / 100);
  const poolCreatorOnChain = totalFeesMicro - stakerAmount - compoundAmount - treasuryRetained;
  const distPoolDeposit = stakerAmount + compoundAmount;

  return { stakerAmount, compoundAmount, treasuryRetained, poolCreatorOnChain, distPoolDeposit };
}

async function depositToDistPool(amountMicro, chainId) {
  const { addr: senderAddr, sk: signingKey } = getTreasury(chainId);
  if (!senderAddr || !signingKey) {
    throw new Error('Treasury signing not configured for ' + chainId);
  }

  const distPoolAddr = algosdk.getApplicationAddress(V2_APP_ID);

  const txId = await withFallbackForChain(chainId, async (algod) => {
    const params = await algod.getTransactionParams().do();
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: senderAddr,
      receiver: distPoolAddr,
      amount: amountMicro,
      assetIndex: FRY_ASA_ID,
      suggestedParams: params,
    });
    const signedTxn = txn.signTxn(signingKey);
    const { txid } = await algod.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(algod, txid, 4);
    return txid;
  });

  logger.info('feeDistribution: deposited ' + (amountMicro / 1e6).toFixed(6) + ' FRY to DistPoolV2, txId=' + txId);
  return txId;
}

async function readDistPoolState(algod) {
  const appInfo = await algod.getApplicationByID(V2_APP_ID).do();
  const state = {};
  for (const item of (appInfo.params || {})['global-state'] || []) {
    const key = Buffer.from(item.key, 'base64').toString('utf-8');
    if (item.value.type === 2) {
      state[key] = item.value.uint;
    } else if (item.value.type === 1) {
      state[key] = Buffer.from(item.value.bytes, 'base64');
    }
  }
  return state;
}

async function triggerStartEpoch(fryAmountMicro, chainId) {
  if (!automationAddr || !automationSk) {
    throw new Error('Automation wallet not configured (AUTOMATION_MNEMONIC)');
  }

  const result = await withFallbackForChain(chainId, async (algod) => {
    const gs = await readDistPoolState(algod);
    const epochStatus = gs.epoch_status || 0;

    if (epochStatus === 2) {
      logger.info('feeDistribution: epoch active (status=2), cancelling...');
      const cancelMethod = algosdk.ABIMethod.fromSignature('cancel_epoch()void');
      const cancelParams = await algod.getTransactionParams().do();
      const cancelTxn = algosdk.makeApplicationCallTxnFromObject({
        sender: automationAddr,
        appIndex: V2_APP_ID,
        appArgs: [cancelMethod.getSelector()],
        suggestedParams: cancelParams,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
      });
      const signedCancel = cancelTxn.signTxn(automationSk);
      const { txid: cancelTxid } = await algod.sendRawTransaction(signedCancel).do();
      await algosdk.waitForConfirmation(algod, cancelTxid, 4);
      logger.info('feeDistribution: cancelled active epoch, txId=' + cancelTxid);
    } else if (epochStatus !== 0 && epochStatus !== 3) {
      throw new Error('Cannot start epoch: epoch_status=' + epochStatus);
    }

    const method = algosdk.ABIMethod.fromSignature('start_epoch(uint64,uint64)uint64');
    const amountEncoded = algosdk.ABIType.from('uint64').encode(fryAmountMicro);
    const eligibleEncoded = algosdk.ABIType.from('uint64').encode(ELIGIBLE_MAX);
    const params = await algod.getTransactionParams().do();
    const txn = algosdk.makeApplicationCallTxnFromObject({
      sender: automationAddr,
      appIndex: V2_APP_ID,
      appArgs: [method.getSelector(), amountEncoded, eligibleEncoded],
      suggestedParams: params,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
    });
    const signedTxn = txn.signTxn(automationSk);
    const { txid } = await algod.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(algod, txid, 4);

    const newGs = await readDistPoolState(algod);
    const newEpoch = newGs.current_epoch || 0;
    logger.info('feeDistribution: start_epoch OK, newEpoch=' + newEpoch + ', txId=' + txid);
    return { txId: txid, newEpochNumber: newEpoch };
  });

  return result;
}

/**
 * Process Voi fees: bridge VOI → aVOI on Algorand, swap aVOI → FRY.
 * Non-blocking — Algorand distribution proceeds even if Voi fails.
 */
async function processVoiFees() {
  const feeRecords = await GasFee.find({
    chainId: 'voi-mainnet',
    distributed: { $ne: true },
  }).lean();

  if (feeRecords.length === 0) {
    return { skipped: true, reason: 'no_voi_fees' };
  }

  const totalVoiMicro = feeRecords.reduce((sum, r) => sum + (r.gasAmount || 0), 0);
  logger.info('feeDistribution: Voi fees — ' + feeRecords.length + ' records, ' + totalVoiMicro + ' microVOI');

  // Bridge VOI → aVOI on Algorand (3 retries)
  let bridgeResult;
  for (let attempt = 1; attempt <= 3; attempt++) {
    bridgeResult = await bridgeVoiToAlgorand(totalVoiMicro, null, 'feeDistributionCron');
    if (bridgeResult.success) break;
    logger.warn('feeDistribution: Voi bridge attempt ' + attempt + ' failed: ' + (bridgeResult.error || 'unknown'));
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 5000));
  }
  if (!bridgeResult.success) {
    return { success: false, error: 'bridge_failed', detail: bridgeResult.error, voiRecordCount: feeRecords.length };
  }

  logger.info('feeDistribution: Voi bridge OK, txId=' + bridgeResult.txId + ', waiting for Aramid delivery...');

  // Wait for Aramid delivery (~3 min)
  await new Promise(r => setTimeout(r, 4 * 60 * 1000));

  // Swap aVOI → FRY (3 retries)
  let swapResult;
  for (let attempt = 1; attempt <= 3; attempt++) {
    swapResult = await checkAndSwapAvoiToFry('feeDistributionCron');
    if (swapResult.success) break;
    logger.warn('feeDistribution: Voi swap attempt ' + attempt + ' failed: ' + (swapResult.error || 'unknown'));
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 3000));
  }

  // Mark Voi records as distributed
  await GasFee.updateMany(
    { _id: { $in: feeRecords.map(r => r._id) } },
    { $set: { distributed: true, distributionEpochId: 'voi-bridge-' + new Date().toISOString().slice(0, 10) } }
  );

  const result = {
    success: true,
    voiRecordCount: feeRecords.length,
    totalVoiMicro,
    bridgeTxId: bridgeResult.txId,
    swapSuccess: swapResult ? swapResult.success : false,
    fryReceived: swapResult ? (swapResult.outputAmount || 0) : 0,
    swapError: swapResult ? (swapResult.error || null) : null,
  };

  logger.info('feeDistribution: Voi processing complete — ' + JSON.stringify(result));
  return result;
}

async function runDistributionEpoch(chainId, extraFryFromVoi = 0) {
  const epochId = chainId + '-' + new Date().toISOString().slice(0, 10);

  const existing = await FeeDistributionLog.findOne({ epochId }).lean();
  if (existing && existing.status === 'epoch_started') {
    logger.info('feeDistribution: epoch ' + epochId + ' already completed, skipping');
    return { skipped: true, epochId };
  }

  const feeRecords = await GasFee.find({
    chainId,
    distributed: { $ne: true },
  }).lean();

  if (feeRecords.length === 0 && extraFryFromVoi === 0) {
    logger.info('feeDistribution: no undistributed fees for ' + chainId);
    return { skipped: true, epochId, reason: 'no_fees' };
  }

  const totalFees = feeRecords.reduce((sum, r) => sum + (r.gasAmount || 0), 0);
  logger.info('feeDistribution: processing ' + feeRecords.length + ' records, totalFees=' + totalFees + ' micro (' + chainId + ')');

  const feeConfig = await FeeConfig.getFeeConfig();
  const splits = calculateDistribution(totalFees, feeConfig);

  // Voi fees: 75% to DistPoolV2 (no on-chain 10% deduction like Algorand)
  const voiDistPoolPortion = Math.floor(extraFryFromVoi * 75 / 100);
  const totalDistPoolDeposit = splits.distPoolDeposit + voiDistPoolPortion;

  logger.info(
    'feeDistribution: splits - distPoolDeposit=' + splits.distPoolDeposit +
    ' (staker=' + splits.stakerAmount + ' + compound=' + splits.compoundAmount + ')' +
    ' treasuryRetained=' + splits.treasuryRetained +
    ' poolCreatorOnChain=' + splits.poolCreatorOnChain +
    (extraFryFromVoi > 0 ? ' + voiExtra=' + voiDistPoolPortion + ' (from ' + extraFryFromVoi + ' FRY)' : '')
  );

  if (totalDistPoolDeposit === 0) {
    logger.warn('feeDistribution: totalDistPoolDeposit is 0, skipping');
    return { skipped: true, epochId, reason: 'zero_deposit' };
  }

  const logEntry = await FeeDistributionLog.create({
    epochId,
    chainId,
    totalFeesProcessed: totalFees,
    feeRecordCount: feeRecords.length,
    ...splits,
    feeRecordIds: feeRecords.map(r => r._id),
    status: 'pending',
  });

  try {
    const depositTxId = await depositToDistPool(totalDistPoolDeposit, chainId);
    logEntry.distPoolDepositTxId = depositTxId;
    logEntry.status = 'deposited';
    await logEntry.save();

    const { txId: epochTxId, newEpochNumber } = await triggerStartEpoch(
      totalDistPoolDeposit,
      chainId
    );
    logEntry.startEpochTxId = epochTxId;
    logEntry.newEpochNumber = newEpochNumber;
    logEntry.status = 'epoch_started';
    await logEntry.save();

    if (feeRecords.length > 0) {
      const feeIds = feeRecords.map(r => r._id);
      await GasFee.updateMany(
        { _id: { $in: feeIds } },
        { $set: { distributed: true, distributionEpochId: epochId } }
      );
    }

    logger.info(
      'feeDistribution: epoch ' + epochId + ' complete - ' +
      'deposited=' + (totalDistPoolDeposit / 1e6).toFixed(6) + ' FRY' +
      (extraFryFromVoi > 0 ? ' (incl ' + (voiDistPoolPortion / 1e6).toFixed(6) + ' from Voi)' : '') +
      ', epochTx=' + epochTxId +
      ', newEpoch=' + newEpochNumber +
      ', records=' + feeRecords.length
    );

    return {
      success: true, epochId, totalFees,
      distPoolDeposit: totalDistPoolDeposit,
      depositTxId, epochTxId, newEpochNumber,
      recordCount: feeRecords.length,
      voiExtra: voiDistPoolPortion,
    };
  } catch (err) {
    logEntry.status = 'failed';
    logEntry.error = err.message;
    await logEntry.save();
    throw err;
  }
}

module.exports = {
  calculateDistribution,
  depositToDistPool,
  triggerStartEpoch,
  runDistributionEpoch,
  processVoiFees,
};
