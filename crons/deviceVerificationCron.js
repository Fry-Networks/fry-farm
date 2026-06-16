const cron = require("node-cron");
const logger = require("../config/logger");
const algosdk = require("algosdk");
const DevicePool = require("../models/devicePoolSchema");
const DevicePosition = require("../models/devicePositionSchema");
const { checkRequirements, computeMultiplier } = require("../services/requirementCheckerService");
const { withFallback, getIndexerUrl } = require("../services/algodService");

const INDEXER_BASE_URL = getIndexerUrl('algorand-mainnet');

cron.schedule('*/15 * * * *', async () => {
  const start = Date.now();
  logger.info('Device verification cron: starting');

  const stats = { checked: 0, verified: 0, failed: 0, expired: 0, reactivated: 0, errors: 0 };

  try {
    // Query positions needing verification
    const positions = await DevicePosition.find({
      status: { $in: ['active', 'requirements_not_met'] },
      stakingMode: 'verified-hold',
    }).limit(100);

    if (positions.length === 0) {
      logger.info(`Device verification cron: no positions to verify, completed in ${Date.now() - start}ms`);
      return;
    }

    // Batch fetch pools
    const uniqueAppIds = [...new Set(positions.map(p => p.poolAppId))];
    const pools = await DevicePool.find({ appId: { $in: uniqueAppIds } });
    const poolMap = new Map(pools.map(p => [p.appId, p]));

    // Check Indexer reachability
    let indexerReachable = true;
    try {
      const testRes = await fetch(`${INDEXER_BASE_URL}/health`);
      if (!testRes.ok) indexerReachable = false;
    } catch {
      indexerReachable = false;
    }

    if (!indexerReachable) {
      logger.warn('Device verification cron: Indexer unreachable, skipping tick');
      return;
    }

    // Get verifier account if available
    let verifierAccount = null;
    if (process.env.VERIFIER_MNEMONIC) {
      try {
        verifierAccount = algosdk.mnemonicToSecretKey(process.env.VERIFIER_MNEMONIC);
      } catch (err) {
        logger.error('Device verification cron: invalid VERIFIER_MNEMONIC:', err.message);
      }
    }

    for (const position of positions) {
      stats.checked++;

      try {
        const pool = poolMap.get(position.poolAppId);
        if (!pool) {
          stats.errors++;
          continue;
        }

        // Verify wallet still holds NFT
        const nftRes = await fetch(
          `${INDEXER_BASE_URL}/v2/accounts/${position.wallet}/assets?asset-id=${position.deviceNftId}`
        );

        let nftHeld = false;
        if (nftRes.ok) {
          const nftData = await nftRes.json();
          const asset = nftData.assets?.[0];
          nftHeld = asset && asset.amount > 0;
        }

        if (!nftHeld) {
          position.consecutiveFailures++;
          if (position.consecutiveFailures > (pool.verificationGracePeriod || 3)) {
            position.status = 'verification_expired';
            position.lastVerificationResult = 'failed';
            stats.expired++;
          } else {
            position.lastVerificationResult = 'failed';
            stats.failed++;
          }
          position.lastVerificationTime = new Date();
          await position.save();
          continue;
        }

        // NFT held — reset consecutive failures
        position.consecutiveFailures = 0;

        // Check requirements
        const reqResult = await checkRequirements(position.wallet, pool.requirements);
        const allRequiredMet = reqResult ? reqResult.allRequiredMet : position.allRequiredMet;

        // Compute multiplier
        const { effectiveMultiplier, activeMultipliers } = await computeMultiplier(
          position.wallet, pool, position
        );

        // State transitions
        const prevStatus = position.status;
        if (allRequiredMet) {
          position.status = 'active';
          position.lastVerificationResult = 'verified';
          if (prevStatus === 'requirements_not_met') {
            stats.reactivated++;
          } else {
            stats.verified++;
          }
        } else {
          position.status = 'requirements_not_met';
          position.lastVerificationResult = 'failed';
          stats.failed++;
        }

        // Update position fields
        if (reqResult) {
          position.requirementStatus = reqResult.statuses;
          position.allRequiredMet = reqResult.allRequiredMet;
        }
        position.activeMultipliers = activeMultipliers;
        position.effectiveMultiplier = effectiveMultiplier;
        position.lastVerificationTime = new Date();

        await position.save();

        // Call contract update_verification if verifier is configured
        if (verifierAccount && pool.appId) {
          try {
            await withFallback(async (algodClient) => {
              const suggestedParams = await algodClient.getTransactionParams().do();
              const appId = Number(pool.appId);

              // Build ABI method call for update_verification
              const txn = algosdk.makeApplicationCallTxnFromObject({
                from: verifierAccount.addr,
                appIndex: appId,
                onComplete: algosdk.OnApplicationComplete.NoOpOC,
                appArgs: [
                  new TextEncoder().encode('update_verification'),
                  algosdk.decodeAddress(position.wallet).publicKey,
                  algosdk.encodeUint64(1), // nft_count
                  algosdk.encodeUint64(allRequiredMet ? 1 : 0), // is_verified
                  algosdk.encodeUint64(allRequiredMet ? 1 : 0), // requirements_met
                  algosdk.encodeUint64(effectiveMultiplier), // effective_multiplier
                ],
                suggestedParams,
              });

              const signedTxn = txn.signTxn(verifierAccount.sk);
              await algodClient.sendRawTransaction(signedTxn).do();
            });
          } catch (err) {
            logger.error(`Device verification cron: contract call failed for position ${position._id}:`, err.message);
            stats.errors++;
          }
        }
      } catch (err) {
        logger.error(`Device verification cron: error processing position ${position._id}:`, err.message);
        stats.errors++;
      }
    }
  } catch (error) {
    logger.error('Device verification cron: error:', error);
  }

  logger.info(`Device verification cron: completed in ${Date.now() - start}ms — ${JSON.stringify(stats)}`);
});

logger.info('Device verification cron: registered (every 15 minutes)');
