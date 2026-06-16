const logger = require("../config/logger");
const FeeConfig = require("../models/feeConfigSchema");
const GasFee = require("../models/gasFeeSchema");
const { verifyFeeTransactionWithRetry } = require("../services/feeVerificationService");

// Map operation types to FeeConfig field names
const FEE_PERCENT_FIELDS = {
  stakingDeposit: "stakingDepositFeePercent",
  stakingWithdraw: "stakingWithdrawFeePercent",
  stakingClaim: "stakingClaimFeePercent",
  farmingDeposit: "farmingDepositFeePercent",
  farmingWithdraw: "farmingWithdrawFeePercent",
  farmingClaim: "farmingClaimFeePercent",
  p2pCreate: "p2pCreateFeePercent",
  p2pAccept: "p2pAcceptFeePercent",
};

// Grace period: if set, requests without feeTxId are allowed (with warning) until this time
const GRACE_UNTIL = process.env.FEE_ENFORCEMENT_GRACE_UNTIL
  ? new Date(process.env.FEE_ENFORCEMENT_GRACE_UNTIL).getTime()
  : 0;

/**
 * Middleware factory that verifies fee payment on-chain before allowing position recording.
 *
 * @param {string} operationType - One of: stakingDeposit, stakingWithdraw, stakingClaim,
 *                                  farmingDeposit, farmingWithdraw, farmingClaim
 * @param {Function} getBaseAmount - (req) => number — extracts base amount in micro-units from req.body
 * @returns {Function} Express middleware
 */
function requireFeePayment(operationType, getBaseAmount) {
  const feeField = FEE_PERCENT_FIELDS[operationType];
  if (!feeField) {
    throw new Error(`requireFeePayment: unknown operationType "${operationType}"`);
  }

  return async (req, res, next) => {
    try {
      // 1. Load fee configuration
      const config = await FeeConfig.getFeeConfig();
      const feePercent = config[feeField] || 0;

      // 2. No fee configured for this operation — skip verification
      if (feePercent === 0) {
        return next();
      }

      // 3. Compute expected fee
      const baseAmount = getBaseAmount(req);
      const expectedFee = Math.floor(baseAmount * (feePercent / 100));

      // 4. If expected fee is 0 (e.g., base amount is 0) — skip
      if (expectedFee <= 0) {
        return next();
      }

      // 5. Check for feeTxId in request
      const { feeTxId, feeAssetId } = req.body;

      if (!feeTxId) {
        // Grace period: allow without feeTxId but log warning
        if (GRACE_UNTIL && Date.now() < GRACE_UNTIL) {
          logger.warn(
            `[FeePayment] Grace period: allowing ${operationType} without feeTxId for wallet ${req.user?.wallet?.slice(0, 8)}...`
          );
          return next();
        }

        return res.status(400).json({
          success: false,
          error: "Fee transaction ID (feeTxId) is required. Please sign the fee transaction.",
        });
      }

      // 6. Verify on-chain
      const senderWallet = req.user?.wallet;
      if (!senderWallet) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }

      const chainFeeRecipient = req.chainConfig?.feeRecipient || config.feeRecipient;
      const retryConfig = req.chainConfig?.indexerRetry || { maxAttempts: 3, delayMs: 3000 };
      const result = await verifyFeeTransactionWithRetry(feeTxId, {
        senderWallet,
        feeRecipient: chainFeeRecipient,
        assetId: feeAssetId || 0,
        expectedMinAmount: expectedFee,
      }, req.chainId, retryConfig.maxAttempts, retryConfig.delayMs);

      if (!result.verified) {
        logger.warn(
          `[FeePayment] Verification failed for ${operationType} by ${senderWallet.slice(0, 8)}...: ${result.error}`
        );
        return res.status(402).json({
          success: false,
          error: "Fee payment verification failed",
          details: result.error,
        });
      }

      // 7. Record the verified fee in GasFee collection (replay protection)
      try {
        await GasFee.create({
          appId: req.body.appId || req.body.poolId || 0,
          userId: senderWallet,
          gasAmount: result.amount || expectedFee,
          gasType: operationType,
          feeType: "percentage",
          feePercent,
          baseAmount,
          txId: feeTxId,
        });
      } catch (dupErr) {
        // Unique index violation = replay attempt
        if (dupErr.code === 11000) {
          return res.status(400).json({
            success: false,
            error: "Fee transaction has already been used",
          });
        }
        throw dupErr;
      }

      logger.info(
        `[FeePayment] Verified ${operationType} fee: txId=${feeTxId}, amount=${result.amount}, wallet=${senderWallet.slice(0, 8)}...`
      );

      // 8. Attach verification info to request for downstream use
      req.feeVerification = {
        txId: feeTxId,
        amount: result.amount,
        operationType,
        feePercent,
      };

      next();
    } catch (err) {
      logger.error(`[FeePayment] Error in ${operationType} verification:`, err.message);
      return res.status(500).json({
        success: false,
        error: "Fee verification service error",
      });
    }
  };
}

module.exports = { requireFeePayment };
