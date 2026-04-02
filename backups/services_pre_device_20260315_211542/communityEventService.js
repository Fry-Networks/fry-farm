const algosdk = require("algosdk");
const logger = require("../config/logger");
const { withFallback, getAlgodClient } = require("./algodService");

let treasuryAddr, signingKey;
try {
  const ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  const rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  treasuryAddr = ogAccount.addr;
  signingKey = rekeyAccount.sk;
} catch (err) {
  logger.warn('CommunityEventService: REWARD_MNEMONIC/REWARD_REKEY not configured:', err.message);
}

async function checkAssetOptIn(algodClient, address, asaId) {
  try {
    await algodClient.accountAssetInformation(address, asaId).do();
    return true;
  } catch (err) {
    return false;
  }
}

async function optInTreasury(asaId) {
  if (!treasuryAddr || !signingKey) {
    throw new Error('Treasury wallet not configured (REWARD_MNEMONIC/REWARD_REKEY missing)');
  }

  const alreadyOptedIn = await withFallback(async (client) => {
    return checkAssetOptIn(client, treasuryAddr, asaId);
  });

  if (alreadyOptedIn) {
    logger.info(`Treasury already opted into ASA ${asaId}`);
    return;
  }

  await withFallback(async (client) => {
    const suggestedParams = await client.getTransactionParams().do();
    const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: treasuryAddr,
      receiver: treasuryAddr,
      assetIndex: asaId,
      amount: 0,
      suggestedParams,
    });
    const signedTxn = optInTxn.signTxn(signingKey);
    const { txid } = await client.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(client, txid, 4);
    logger.info(`Treasury opted into ASA ${asaId}, txId: ${txid}`);
  });
}

async function buildFundingTxns({ creatorWallet, asaId, grossAmount, feeRecipient, feePercent }) {
  if (!treasuryAddr || !signingKey) {
    throw new Error('Treasury wallet not configured (REWARD_MNEMONIC/REWARD_REKEY missing)');
  }

  const feeAmount = Math.floor(grossAmount * feePercent * 100 / 10000);
  const netAmount = grossAmount - feeAmount;

  if (netAmount <= 0) {
    throw new Error('Reward amount too small after fee deduction');
  }

  // Ensure treasury is opted into the reward ASA
  await optInTreasury(asaId);

  return await withFallback(async (client) => {
    const suggestedParams = await client.getTransactionParams().do();
    const txns = [];

    // 1. Reward token transfer: creator → treasury (net reward pool)
    txns.push(algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: creatorWallet,
      receiver: treasuryAddr,
      assetIndex: asaId,
      amount: netAmount,
      suggestedParams,
    }));

    // Assign group ID to core transactions only
    if (txns.length > 1) {
      algosdk.assignGroupID(txns);
    }

    // Encode core transactions
    const unsignedTxns = txns.map(txn =>
      Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64')
    );

    // 2. Fee transaction — SEPARATE, not in the group
    let feeTxnBase64 = null;
    let feeTarget = feeRecipient;

    if (feeAmount > 0) {
      if (feeRecipient && feeRecipient !== treasuryAddr) {
        const feeWalletOptedIn = await checkAssetOptIn(client, feeRecipient, asaId);
        if (!feeWalletOptedIn) {
          logger.warn(`Fee wallet ${feeRecipient} not opted into ASA ${asaId}, sending fee to treasury`);
          feeTarget = treasuryAddr;
        }
      } else {
        feeTarget = treasuryAddr;
      }

      const feeTransfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: creatorWallet,
        receiver: feeTarget,
        assetIndex: asaId,
        amount: feeAmount,
        suggestedParams,
      });
      feeTxnBase64 = Buffer.from(algosdk.encodeUnsignedTransaction(feeTransfer)).toString('base64');
    }

    return {
      unsignedTxns,
      feeTxn: feeTxnBase64,
      feeAmount,
      netAmount,
      feeTarget,
      escrowAddress: treasuryAddr,
    };
  });
}

async function buildRefundTxn(event) {
  if (!treasuryAddr || !signingKey) {
    throw new Error('Treasury wallet not configured (REWARD_MNEMONIC/REWARD_REKEY missing)');
  }

  if (!event.rewardAsaId || !event.rewardPool || event.rewardPool <= 0) {
    throw new Error('Event has no reward pool to refund');
  }

  const result = await withFallback(async (client) => {
    const suggestedParams = await client.getTransactionParams().do();
    const refundTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: treasuryAddr,
      receiver: event.creatorWallet,
      assetIndex: event.rewardAsaId,
      amount: event.rewardPool,
      suggestedParams,
    });
    const signedTxn = refundTxn.signTxn(signingKey);
    const { txid } = await client.sendRawTransaction(signedTxn).do();
    await algosdk.waitForConfirmation(client, txid, 4);
    logger.info(`Refunded ${event.rewardPool} of ASA ${event.rewardAsaId} to ${event.creatorWallet}, txId: ${txid}`);
    return { txId: txid };
  });

  return result;
}

function getTreasuryAddr() {
  return treasuryAddr;
}

module.exports = {
  checkAssetOptIn,
  optInTreasury,
  buildFundingTxns,
  buildRefundTxn,
  getTreasuryAddr,
};
