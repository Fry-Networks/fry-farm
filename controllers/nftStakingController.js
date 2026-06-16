const logger = require("../config/logger");
const NftStakingPool = require("../models/nftStakingPoolSchema");
const { getNftValue } = require("../services/nftPriceOracleService");

// Get all NFT staking pools
const getAllPools = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const pools = await NftStakingPool.find({ chainId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: pools.length === 0
        ? "No NFT staking pools found."
        : "NFT staking pools fetched successfully.",
      data: pools,
    });
  } catch (error) {
    logger.error("Error fetching NFT staking pools:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching NFT staking pools.",
      error: error.message,
    });
  }
};

// Get pool by appId
const getPoolByAppId = async (req, res) => {
  const { appId } = req.params;

  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const pool = await NftStakingPool.findOne({ appId: Number(appId), chainId });

    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `NFT staking pool with appId ${appId} not found.`,
      });
    }

    res.status(200).json({
      success: true,
      message: "NFT staking pool fetched successfully.",
      data: pool,
    });
  } catch (error) {
    logger.error("Error fetching NFT staking pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching the NFT staking pool.",
      error: error.message,
    });
  }
};

// Get pools by creator wallet
const getPoolsByCreator = async (req, res) => {
  const { wallet } = req.params;

  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const pools = await NftStakingPool.find({ creatorId: wallet, chainId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: pools.length === 0
        ? "No NFT staking pools found for this creator."
        : "NFT staking pools fetched successfully.",
      data: pools,
    });
  } catch (error) {
    logger.error("Error fetching NFT staking pools by creator:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching NFT staking pools.",
      error: error.message,
    });
  }
};

// Add new pool
const addPool = async (req, res) => {
  const {
    creatorId,
    appId,
    name,
    description,
    imageUrl,
    rewardTokenId,
    rewardModel,
    collectionMode,
    collectionCreator,
    whitelistedAsaIds,
    collectionName,
    nftValueInRewardToken,
    ratePerDay,
    totalRewardPool,
    aprRate,
    valuePerNft,
    poolEndTime,
    lockPeriod,
    depositFeeBps,
    withdrawFeeBps,
    claimFeeBps,
    feeRecipient,
  } = req.body;

  try {
    const newPool = new NftStakingPool({
      chainId: req.chainId || 'algorand-mainnet',
      creatorId,
      appId,
      name,
      description,
      imageUrl,
      rewardTokenId,
      rewardModel,
      collectionMode,
      collectionCreator,
      whitelistedAsaIds,
      collectionName,
      nftValueInRewardToken,
      ratePerDay,
      totalRewardPool,
      aprRate,
      valuePerNft,
      poolEndTime,
      lockPeriod,
      depositFeeBps,
      withdrawFeeBps,
      claimFeeBps,
      feeRecipient,
    });

    const savedPool = await newPool.save();

    res.status(201).json({
      success: true,
      message: "NFT staking pool created successfully.",
      data: savedPool,
    });
  } catch (error) {
    logger.error("Error creating NFT staking pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while creating the NFT staking pool.",
      error: error.message,
    });
  }
};

// Update pool by appId
const updatePool = async (req, res) => {
  const { appId } = req.params;
  const updatedData = req.body;
  const numericAppId = Number(appId);
  const chainId = req.chainId || 'algorand-mainnet';

  try {
    const currentPool = await NftStakingPool.findOne({ appId: numericAppId, chainId });

    if (!currentPool) {
      return res.status(404).json({
        success: false,
        message: `NFT staking pool with appId ${appId} not found.`,
      });
    }

    const updated = await NftStakingPool.findOneAndUpdate(
      { appId: numericAppId, chainId },
      { $set: updatedData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: `NFT staking pool with appId ${appId} updated successfully.`,
      updatedData: updated,
    });
  } catch (error) {
    logger.error("Error updating NFT staking pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while updating the NFT staking pool.",
      error: error.message,
    });
  }
};

// Get NFT price via oracle
const getNftPrice = async (req, res) => {
  try {
    const asaId = Number(req.params.asaId);
    const rewardTokenId = Number(req.query.rewardTokenId) || 0;
    const poolAppId = Number(req.query.poolAppId) || 0;

    if (isNaN(asaId) || asaId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid asaId is required.",
      });
    }

    const result = await getNftValue(asaId, rewardTokenId, poolAppId);

    res.status(200).json({
      success: true,
      message: "NFT price fetched successfully.",
      data: result,
    });
  } catch (error) {
    logger.error("Error fetching NFT price:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching NFT price.",
      error: error.message,
    });
  }
};

module.exports = {
  getAllPools,
  getPoolByAppId,
  getPoolsByCreator,
  addPool,
  updatePool,
  getNftPrice,
};
