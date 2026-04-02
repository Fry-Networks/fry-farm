const logger = require("../config/logger");
const NftStakingClaim = require("../models/nftStakingClaimSchema");
const NftStakingPool = require("../models/nftStakingPoolSchema");

// Record a reward claim
const addClaim = async (req, res) => {
  const { wallet, poolId, appId, rewardClaimed, txId, feeAmount } = req.body;

  try {
    const newClaim = new NftStakingClaim({
      wallet,
      poolId,
      appId,
      rewardClaimed,
      txId,
      feeAmount,
    });

    const saved = await newClaim.save();

    // Update pool total rewards claimed
    await NftStakingPool.findOneAndUpdate(
      { appId },
      { $inc: { totalRewardsClaimed: rewardClaimed } }
    );

    res.status(201).json({
      success: true,
      message: "Claim recorded successfully.",
      data: saved,
    });
  } catch (error) {
    logger.error("Error recording claim:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while recording the claim.",
      error: error.message,
    });
  }
};

// Get claims by wallet
const getClaimsByWallet = async (req, res) => {
  const { wallet } = req.params;

  try {
    const claims = await NftStakingClaim.find({ wallet }).sort({ claimedAt: -1 });

    res.status(200).json({
      success: true,
      message: claims.length === 0
        ? "No claims found for this wallet."
        : "Claims fetched successfully.",
      data: claims,
    });
  } catch (error) {
    logger.error("Error fetching claims:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching claims.",
      error: error.message,
    });
  }
};

module.exports = {
  addClaim,
  getClaimsByWallet,
};
