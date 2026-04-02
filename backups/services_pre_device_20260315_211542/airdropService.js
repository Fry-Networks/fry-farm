const algosdk = require("algosdk");
const logger = require("../config/logger");
const Event = require("../models/eventSchema");
const EventPoints = require("../models/eventPointsSchema");
const RewardsConfig = require("../models/rewardsConfigSchema");
const { withFallback } = require("./algodService");

const FRY_ASA_ID_DEFAULT = 2485314946;

let treasuryAddr, signingKey;
try {
  const ogAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_MNEMONIC);
  const rekeyAccount = algosdk.mnemonicToSecretKey(process.env.REWARD_REKEY);
  treasuryAddr = ogAccount.addr;
  signingKey = rekeyAccount.sk;
} catch (err) {
  logger.warn('Airdrop service: REWARD_MNEMONIC/REWARD_REKEY not configured:', err.message);
}

async function distributeAirdrop(eventId) {
  const event = await Event.findById(eventId);
  if (!event) throw new Error('Event not found');
  if (event.status !== 'ended') throw new Error('Event must be ended before airdrop');

  const isCommunity = event.eventType === 'community';
  let asaId, poolAmount, amountMultiplier;

  if (isCommunity) {
    if (event.fundingStatus !== 'funded') {
      logger.info(`Community event ${event.name}: not funded, skipping airdrop`);
      return { distributed: 0, successful: 0, failed: 0 };
    }
    asaId = event.rewardAsaId;
    poolAmount = event.rewardPool;
    amountMultiplier = 1; // already in base units
  } else {
    if (!event.airdropPoolFry || event.airdropPoolFry <= 0) {
      logger.info(`Event ${event.name}: no airdrop pool configured, skipping`);
      return { distributed: 0, successful: 0, failed: 0 };
    }
    const config = await RewardsConfig.getConfig();
    asaId = config.fryAsaId || FRY_ASA_ID_DEFAULT;
    poolAmount = event.airdropPoolFry;
    amountMultiplier = 1e6; // FRY whole units → microunits
  }

  if (!treasuryAddr || !signingKey) {
    throw new Error('Treasury wallet not configured (REWARD_MNEMONIC/REWARD_REKEY missing)');
  }

  const qualifiedUsers = await EventPoints.find({
    eventId,
    totalPoints: { $gte: event.minPointsToQualify || 0 },
  }).sort({ totalPoints: -1 }).lean();

  if (!qualifiedUsers.length) {
    logger.info(`Event ${event.name}: no qualified participants for airdrop`);
    return { distributed: 0, successful: 0, failed: 0 };
  }

  // Calculate airdrop amounts
  const totalPointsSum = qualifiedUsers.reduce((sum, u) => sum + u.totalPoints, 0);
  const airdropAmounts = [];

  if (event.airdropDistribution === 'tiered' && event.airdropTiers?.length) {
    for (const user of qualifiedUsers) {
      const tier = event.airdropTiers.find(
        t => user.rank >= t.rank && user.rank <= (t.rankEnd || t.rank)
      );
      const tierReward = tier
        ? (isCommunity ? (tier.rewardAmount || tier.rewardFry) : tier.rewardFry)
        : 0;
      airdropAmounts.push({
        wallet: user.wallet,
        amount: tierReward,
        pointsDocId: user._id,
      });
    }
  } else {
    for (const user of qualifiedUsers) {
      const share = totalPointsSum > 0
        ? (user.totalPoints / totalPointsSum) * poolAmount
        : 0;
      airdropAmounts.push({
        wallet: user.wallet,
        amount: share,
        pointsDocId: user._id,
      });
    }
  }

  let successful = 0;
  let failed = 0;

  for (const entry of airdropAmounts) {
    if (entry.amount <= 0) continue;

    const onChainAmount = Math.floor(entry.amount * amountMultiplier);
    if (onChainAmount <= 0) continue;

    try {
      const { txId } = await withFallback(async (client) => {
        const params = await client.getTransactionParams().do();
        const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: treasuryAddr,
          receiver: entry.wallet,
          amount: onChainAmount,
          assetIndex: asaId,
          suggestedParams: params,
        });
        const signedTxn = txn.signTxn(signingKey);
        const { txid } = await client.sendRawTransaction(signedTxn).do();
        await algosdk.waitForConfirmation(client, txid, 4);
        return { txId: txid };
      });

      await EventPoints.findByIdAndUpdate(entry.pointsDocId, {
        airdropAmount: entry.amount,
        airdropTxId: txId,
        airdropStatus: 'sent',
      });
      successful++;
    } catch (error) {
      logger.error(`Airdrop failed for wallet ${entry.wallet}:`, error.message);
      await EventPoints.findByIdAndUpdate(entry.pointsDocId, {
        airdropAmount: entry.amount,
        airdropStatus: 'failed',
      });
      failed++;
    }
  }

  // Mark community event as distributed
  if (isCommunity) {
    event.fundingStatus = 'distributed';
    await event.save();
  }

  const distributed = successful + failed;
  logger.info(`Event ${event.name} airdrop complete: ${successful} sent, ${failed} failed out of ${distributed}`);
  return { distributed, successful, failed };
}

module.exports = { distributeAirdrop };
