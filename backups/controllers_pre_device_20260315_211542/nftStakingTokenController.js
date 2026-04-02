const logger = require("../config/logger");
const NftStakedToken = require("../models/nftStakedTokenSchema");
const NftStakingPool = require("../models/nftStakingPoolSchema");

// Record a new NFT stake
const addStakedNft = async (req, res) => {
  const { wallet, poolId, appId, nftAsaId, nftName, nftImageUrl } = req.body;

  try {
    // Count existing active stakes BEFORE saving the new one
    const existingCount = await NftStakedToken.countDocuments({
      wallet,
      appId,
      isActive: true,
    });

    const newStake = new NftStakedToken({
      wallet,
      poolId,
      appId,
      nftAsaId,
      nftName,
      nftImageUrl,
    });

    const saved = await newStake.save();

    // Update pool counters
    const poolUpdate = { $inc: { totalNftsStaked: 1 } };
    if (existingCount === 0) {
      poolUpdate.$inc.totalStakers = 1;
    }
    await NftStakingPool.findOneAndUpdate({ appId }, poolUpdate);

    res.status(201).json({
      success: true,
      message: "NFT stake recorded successfully.",
      data: saved,
    });
  } catch (error) {
    logger.error("Error recording NFT stake:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while recording the NFT stake.",
      error: error.message,
    });
  }
};

// Get staked NFTs by wallet
const getStakedNftsByWallet = async (req, res) => {
  const { wallet } = req.params;

  try {
    const stakes = await NftStakedToken.find({
      wallet,
      isActive: true,
    }).sort({ stakedAt: -1 });

    res.status(200).json({
      success: true,
      message: stakes.length === 0
        ? "No active NFT stakes found for this wallet."
        : "NFT stakes fetched successfully.",
      data: stakes,
    });
  } catch (error) {
    logger.error("Error fetching NFT stakes by wallet:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching NFT stakes.",
      error: error.message,
    });
  }
};

// Get staked NFTs by pool
const getStakedNftsByPool = async (req, res) => {
  const { appId } = req.params;

  try {
    const stakes = await NftStakedToken.find({
      appId: Number(appId),
      isActive: true,
    }).sort({ stakedAt: -1 });

    res.status(200).json({
      success: true,
      message: stakes.length === 0
        ? "No active NFT stakes found for this pool."
        : "NFT stakes fetched successfully.",
      data: stakes,
    });
  } catch (error) {
    logger.error("Error fetching NFT stakes by pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching NFT stakes.",
      error: error.message,
    });
  }
};

// Unstake an NFT
const unstakeNft = async (req, res) => {
  const { wallet, appId, nftAsaId } = req.body;

  try {
    const unstaked = await NftStakedToken.findOneAndUpdate(
      { wallet, appId, nftAsaId, isActive: true },
      { $set: { isActive: false, unstakedAt: new Date() } },
      { new: true }
    );

    if (!unstaked) {
      return res.status(404).json({
        success: false,
        message: "No active stake found for this NFT.",
      });
    }

    // Decrement pool counters
    const poolUpdate = { $inc: { totalNftsStaked: -1 } };

    // Check if wallet has any remaining active stakes in this pool
    const remainingCount = await NftStakedToken.countDocuments({
      wallet,
      appId,
      isActive: true,
    });

    if (remainingCount === 0) {
      poolUpdate.$inc.totalStakers = -1;
    }

    await NftStakingPool.findOneAndUpdate({ appId }, poolUpdate);

    res.status(200).json({
      success: true,
      message: "NFT unstaked successfully.",
      data: unstaked,
    });
  } catch (error) {
    logger.error("Error unstaking NFT:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while unstaking the NFT.",
      error: error.message,
    });
  }
};

module.exports = {
  addStakedNft,
  getStakedNftsByWallet,
  getStakedNftsByPool,
  unstakeNft,
};
