const logger = require("../config/logger");
const DevicePosition = require("../models/devicePositionSchema");
const devicePoolService = require("../services/devicePoolService");
const deviceAnnouncementService = require("../services/deviceAnnouncementService");
const deviceAnalyticsService = require("../services/deviceAnalyticsService");
const walletLinkService = require("../services/walletLinkService");
const { checkRequirements } = require("../services/requirementCheckerService");

// Create a new device staking pool
const createPool = async (req, res) => {
  try {
    const result = await devicePoolService.createPool(req.body);

    res.status(201).json({
      success: true,
      message: "Device staking pool created successfully.",
      data: result,
    });
  } catch (error) {
    logger.error("Error creating device staking pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while creating the device staking pool.",
      error: error.message,
    });
  }
};

// Get all device staking pools
const getAllPools = async (req, res) => {
  try {
    const pools = await devicePoolService.getAllPools(req.query);

    res.status(200).json({
      success: true,
      message: pools.length === 0
        ? "No device staking pools found."
        : "Device staking pools fetched successfully.",
      data: pools,
    });
  } catch (error) {
    logger.error("Error fetching device staking pools:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching device staking pools.",
      error: error.message,
    });
  }
};

// Get pool by appId
const getPool = async (req, res) => {
  const { appId } = req.params;

  try {
    const pool = await devicePoolService.getPool(appId);

    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `Device staking pool with appId ${appId} not found.`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Device staking pool fetched successfully.",
      data: pool,
    });
  } catch (error) {
    logger.error("Error fetching device staking pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching the device staking pool.",
      error: error.message,
    });
  }
};

// Get pools by creator wallet
const getPoolsByCreator = async (req, res) => {
  const { wallet } = req.params;

  try {
    const pools = await devicePoolService.getPoolsByCreator(wallet);

    res.status(200).json({
      success: true,
      message: pools.length === 0
        ? "No device staking pools found for this creator."
        : "Device staking pools fetched successfully.",
      data: pools,
    });
  } catch (error) {
    logger.error("Error fetching device staking pools by creator:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching device staking pools.",
      error: error.message,
    });
  }
};

// Update pool by appId
const updatePool = async (req, res) => {
  const { appId } = req.params;

  try {
    const updated = await devicePoolService.updatePool(appId, req.user.wallet, req.body);

    res.status(200).json({
      success: true,
      message: `Device staking pool with appId ${appId} updated successfully.`,
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating device staking pool:", error);

    const status = error.message.includes('not found') ? 404
      : error.message.includes('Only the pool creator') ? 403
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Stake a device NFT
const stakeDevice = async (req, res) => {
  const { poolAppId, deviceNftId, deviceNftName } = req.body;

  try {
    const position = await devicePoolService.stakeDevice(
      poolAppId, req.user.wallet, deviceNftId, deviceNftName
    );

    res.status(201).json({
      success: true,
      message: "Device staked successfully.",
      data: position,
    });
  } catch (error) {
    logger.error("Error staking device:", error);

    const status = error.message.includes('not found') ? 404
      : error.message.includes('not active') ? 400
      : error.message.includes('does not hold') ? 400
      : error.message.includes('not from the accepted') ? 400
      : error.message.includes('not in the whitelist') ? 400
      : error.message.includes('requirements') ? 400
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Unstake a device NFT
const unstakeDevice = async (req, res) => {
  const { poolAppId, deviceNftId } = req.body;

  try {
    const position = await devicePoolService.unstakeDevice(
      poolAppId, req.user.wallet, deviceNftId
    );

    res.status(200).json({
      success: true,
      message: "Device unstaked successfully.",
      data: position,
    });
  } catch (error) {
    logger.error("Error unstaking device:", error);

    const status = error.message.includes('not found') ? 404
      : error.message.includes('Already unstaked') ? 400
      : error.message.includes('Lock period') ? 400
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Claim rewards
const claimRewards = async (req, res) => {
  const { poolAppId, rewardClaimed, txId, feeAmount } = req.body;

  try {
    const position = await devicePoolService.claimRewards(
      poolAppId, req.user.wallet, rewardClaimed, txId, feeAmount
    );

    res.status(200).json({
      success: true,
      message: "Rewards claimed successfully.",
      data: position,
    });
  } catch (error) {
    logger.error("Error claiming rewards:", error);

    const status = error.message.includes('No active position') ? 404
      : error.message.includes('Requirements') ? 400
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Get positions by wallet
const getPositionsByWallet = async (req, res) => {
  const { wallet } = req.params;

  try {
    const positions = await DevicePosition.find({ wallet }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: positions.length === 0
        ? "No device positions found for this wallet."
        : "Device positions fetched successfully.",
      data: positions,
    });
  } catch (error) {
    logger.error("Error fetching device positions by wallet:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching device positions.",
      error: error.message,
    });
  }
};

// Get positions by pool
const getPositionsByPool = async (req, res) => {
  const { appId } = req.params;

  try {
    const positions = await DevicePosition.find({ poolAppId: appId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: positions.length === 0
        ? "No device positions found for this pool."
        : "Device positions fetched successfully.",
      data: positions,
    });
  } catch (error) {
    logger.error("Error fetching device positions by pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching device positions.",
      error: error.message,
    });
  }
};

// Check requirements for a wallet against a pool
const checkRequirementsEndpoint = async (req, res) => {
  const { appId, wallet } = req.params;

  try {
    const pool = await devicePoolService.getPool(appId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `Pool ${appId} not found.`,
      });
    }

    const result = await checkRequirements(wallet, pool.requirements);

    res.status(200).json({
      success: true,
      message: "Requirements checked successfully.",
      data: result,
    });
  } catch (error) {
    logger.error("Error checking requirements:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while checking requirements.",
      error: error.message,
    });
  }
};

// Create announcement
const createAnnouncement = async (req, res) => {
  const { appId } = req.params;

  try {
    const announcement = await deviceAnnouncementService.createAnnouncement(
      appId, req.user.wallet, req.body
    );

    res.status(201).json({
      success: true,
      message: "Announcement created successfully.",
      data: announcement,
    });
  } catch (error) {
    logger.error("Error creating announcement:", error);

    const status = error.message.includes('not found') ? 404
      : error.message.includes('Only the pool creator') ? 403
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Get announcements
const getAnnouncements = async (req, res) => {
  const { appId } = req.params;
  const { limit, before } = req.query;

  try {
    const announcements = await deviceAnnouncementService.getAnnouncements(
      appId, { limit: Number(limit) || 20, before }
    );

    res.status(200).json({
      success: true,
      message: "Announcements fetched successfully.",
      data: announcements,
    });
  } catch (error) {
    logger.error("Error fetching announcements:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching announcements.",
      error: error.message,
    });
  }
};

// Mark announcement as read
const markAnnouncementRead = async (req, res) => {
  const { id } = req.params;

  try {
    const announcement = await deviceAnnouncementService.markRead(id, req.user.wallet);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Announcement marked as read.",
      data: announcement,
    });
  } catch (error) {
    logger.error("Error marking announcement as read:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while marking announcement as read.",
      error: error.message,
    });
  }
};

// Get creator analytics
const getCreatorAnalytics = async (req, res) => {
  const { appId } = req.params;

  try {
    const analytics = await deviceAnalyticsService.getCreatorAnalytics(appId, req.user.wallet);

    res.status(200).json({
      success: true,
      message: "Analytics fetched successfully.",
      data: analytics,
    });
  } catch (error) {
    logger.error("Error fetching creator analytics:", error);

    const status = error.message.includes('not found') ? 404
      : error.message.includes('Only the pool creator') ? 403
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Link a cross-chain wallet
const linkWallet = async (req, res) => {
  try {
    const result = await walletLinkService.linkWallet(req.user.wallet, req.body);

    res.status(200).json({
      success: true,
      message: "Wallet linked successfully.",
      data: result,
    });
  } catch (error) {
    logger.error("Error linking wallet:", error);

    const status = error.message.includes('expired') ? 400
      : error.message.includes('verification failed') ? 400
      : 500;

    res.status(status).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
};

// Get linked wallets
const getLinkedWallets = async (req, res) => {
  const { wallet } = req.params;

  try {
    const result = await walletLinkService.getLinkedWallets(wallet);

    res.status(200).json({
      success: true,
      message: result
        ? "Linked wallets fetched successfully."
        : "No linked wallets found.",
      data: result,
    });
  } catch (error) {
    logger.error("Error fetching linked wallets:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching linked wallets.",
      error: error.message,
    });
  }
};

module.exports = {
  createPool,
  getAllPools,
  getPool,
  getPoolsByCreator,
  updatePool,
  stakeDevice,
  unstakeDevice,
  claimRewards,
  getPositionsByWallet,
  getPositionsByPool,
  checkRequirementsEndpoint,
  createAnnouncement,
  getAnnouncements,
  markAnnouncementRead,
  getCreatorAnalytics,
  linkWallet,
  getLinkedWallets,
};
