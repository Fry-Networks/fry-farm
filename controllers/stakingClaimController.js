const logger = require('../config/logger');
const stakingClaimService = require('../services/stakingClaimService');

/**
 * GET /staking-claim/:appId/status?wallet=...
 * Check claim eligibility and pending rewards (read-only).
 */
async function getClaimStatus(req, res) {
  try {
    const { appId } = req.params;
    const { wallet } = req.query;

    if (!wallet || !appId) {
      return res.status(400).json({ success: false, message: 'wallet and appId required' });
    }

    const status = await stakingClaimService.getClaimStatus(
      Number(appId), wallet, req.chainId
    );

    return res.json({ success: true, ...status });
  } catch (err) {
    logger.error(`getClaimStatus error (appId=${req.params.appId}):`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /staking-claim/:appId/claim
 * Process a reward claim — backend calculates and sends from treasury.
 * Body: { wallet: string }
 */
async function claimReward(req, res) {
  try {
    const { appId } = req.params;
    const { wallet } = req.body;

    if (!wallet || !appId) {
      return res.status(400).json({ success: false, message: 'wallet and appId required' });
    }

    // Verify wallet matches authenticated user
    if (req.user?.wallet && req.user.wallet !== wallet) {
      return res.status(403).json({ success: false, message: 'Wallet does not match authenticated user' });
    }

    const result = await stakingClaimService.processClaimReward(
      Number(appId), wallet, req.chainId
    );

    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error(`claimReward error (appId=${req.params.appId}):`, err.message);
    const status = err.message.includes('locked') || err.message.includes('No rewards') || err.message.includes('No active')
      ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
}

/**
 * POST /staking-claim/:appId/claim-and-withdraw
 * Claim rewards via backend, then return unsigned unstake transactions.
 * Body: { wallet: string }
 */
async function claimAndWithdraw(req, res) {
  try {
    const { appId } = req.params;
    const { wallet } = req.body;

    if (!wallet || !appId) {
      return res.status(400).json({ success: false, message: 'wallet and appId required' });
    }

    if (req.user?.wallet && req.user.wallet !== wallet) {
      return res.status(403).json({ success: false, message: 'Wallet does not match authenticated user' });
    }

    // Step 1: Claim rewards from treasury
    const claimResult = await stakingClaimService.processClaimReward(
      Number(appId), wallet, req.chainId
    );

    // Step 2: Build unsigned unstake transaction for the user to sign
    // Note: the frontend still handles unstake signing since it requires the user's wallet
    // We just return the claim result — frontend builds unstake separately
    return res.json({
      success: true,
      claimTxId: claimResult.txId,
      claimAmount: claimResult.amount,
      claimAmountDisplay: claimResult.amountDisplay,
      rewardToken: claimResult.rewardToken,
      claimedAt: claimResult.claimedAt,
      // Frontend builds and signs unstake transaction directly against the contract
    });
  } catch (err) {
    logger.error(`claimAndWithdraw error (appId=${req.params.appId}):`, err.message);
    const status = err.message.includes('locked') || err.message.includes('No rewards')
      ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message });
  }
}

module.exports = { getClaimStatus, claimReward, claimAndWithdraw };
