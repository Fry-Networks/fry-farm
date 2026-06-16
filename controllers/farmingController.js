const logger = require("../config/logger");
const Farming = require("../models/farmingSchema");
const StakingFarmingToken = require("../models/stakingFarmingTokenSchema");
const FarmingWithdraw = require("../models/withdrawFarmingTokenSchema");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get all farming data
const getAllFarmingData = async (req, res) => {
  try {
    const { tokenName } = req.query;
    const chainId = req.chainId || 'algorand-mainnet';

    const query = tokenName
      ? { chainId, 'rewardToken.name': { $regex: escapeRegex(tokenName), $options: 'i' } }
      : { chainId };

    const farmingData = await Farming.find(query);

    // Aggregate totalStaked from individual staking/withdrawal records
    const [stakeAgg, withdrawAgg] = await Promise.all([
      StakingFarmingToken.aggregate([
        { $match: { chainId } },
        { $group: { _id: '$poolId', total: { $sum: '$stakedAmount' } } }
      ]),
      FarmingWithdraw.aggregate([
        { $match: { chainId } },
        { $group: { _id: '$poolId', total: { $sum: '$amount' } } }
      ]),
    ]);

    const stakeMap = {};
    for (const s of stakeAgg) stakeMap[s._id] = s.total;
    const withdrawMap = {};
    for (const w of withdrawAgg) withdrawMap[w._id] = w.total;

    const enriched = farmingData.map(p => {
      const doc = p.toObject();
      const poolId = String(doc.appId);
      const staked = stakeMap[poolId] || 0;
      const withdrawn = withdrawMap[poolId] || 0;
      // Convert human units to micro-units (frontend divides by 1M)
      doc.totalStaked = Math.round(Math.max(0, staked - withdrawn) * 1_000_000);
      return doc;
    });

    res.status(200).json({
      success: true,
      message: enriched.length === 0
        ? (tokenName ? `No farming data found for token: ${tokenName}` : "No farming data found.")
        : "Farming data fetched successfully.",
      data: enriched,
    });
  } catch (error) {
    logger.error("Error fetching farming data:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching farming data.",
      error: error.message,
    });
  }
};

// Get farming data by creatorId
const getFarmingDataByCreatorId = async (req, res) => {
  const { creatorId } = req.params;
  const { tokenName } = req.query;

  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const query = { creatorId, chainId };

    if (tokenName) {
      query['rewardToken.name'] = { $regex: escapeRegex(tokenName), $options: 'i' };
    }

    const farmingData = await Farming.find(query);

    res.status(200).json({
      success: true,
      message: farmingData.length === 0
        ? (tokenName ? `No farming data found for token: ${tokenName}` : "No farming data found.")
        : "Farming data fetched successfully.",
      data: farmingData,
    });
  } catch (error) {
    logger.error("Error fetching farming data:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching farming data.",
      error: error.message,
    });
  }
};

const getFarmingDataByAppId = async (req, res) => {
  const { appId } = req.params;
  const { tokenName } = req.query;

  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const query = { appId: Number(appId), chainId };

    // If tokenName is provided, add it as a filter in the query
    if (tokenName) {
      query['rewardToken.name'] = { $regex: escapeRegex(tokenName), $options: 'i' };
    }

    // Query the database with the modified query object
    const farmingData = await Farming.find(query);

    res.status(200).json({
      success: true,
      message: farmingData.length === 0
        ? (tokenName ? `No farming data found for token: ${tokenName}` : "No farming data found.")
        : "Farming data fetched successfully.",
      data: farmingData,
    });
  } catch (error) {
    logger.error("Error fetching farming data:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching farming data.",
      error: error.message,
    });
  }
};

const getFarmingDataByOnlyAppId = async (req, res) => {
  const { appId } = req.params;

  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const query = { appId: Number(appId), chainId };
    const farmingData = await Farming.find(query);

    res.status(200).json({
      success: true,
      message: farmingData.length === 0
        ? "No farming data found for this appId."
        : "Farming data fetched successfully.",
      data: farmingData,
    });
  } catch (error) {
    logger.error("Error fetching farming data:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching farming data.",
      error: error.message,
    });
  }
};

// Add farming data
const addFarmingData = async (req, res) => {
  const {
    creatorId,
    lpToken,
    rewardToken,
    rewardTokenAmount,
    farmStartTime,
    farmEndTime,
    duration,
    lockPeriod,
    farmEntryFee,
    rewardDistributionRate,
    rewardDistributionSchedule,
    fryRewardFee,
    aprRate,
    appId,
    poolType,
    dexProvider,
    stakeTokenName,
    stakeTokenSymbol,
    rewardTokenName,
    rewardTokenSymbol,
    lpPairName,
  } = req.body;

  try {
    const newFarming = new Farming({
      chainId: req.chainId || 'algorand-mainnet',
      creatorId,
      lpToken,
      rewardToken,
      rewardTokenAmount,
      farmStartTime,
      farmEndTime,
      duration,
      lockPeriod,
      farmEntryFee,
      rewardDistributionRate,
      rewardDistributionSchedule,
      fryRewardFee,
      aprRate,
      appId,
      poolType,
      dexProvider,
      stakeTokenName,
      stakeTokenSymbol,
      rewardTokenName,
      rewardTokenSymbol,
      lpPairName,
    });

    const savedFarming = await newFarming.save();

    res.status(201).json({
      success: true,
      message: "Farming pool created successfully.",
      data: savedFarming,
    });
  } catch (error) {
    logger.error("Error creating farming pool:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while creating the farming pool.",
      error: error.message,
    });
  }
};

// Update farming data by App ID
const updateFarmingData = async (req, res) => {
  const { appId } = req.params;
  const updatedData = req.body;
  const numericAppId = Number(appId);
  const chainId = req.chainId || 'algorand-mainnet';

  try {
    const currentData = await Farming.findOne({ appId: numericAppId, chainId });

    if (!currentData) {
      return res.status(404).json({
        success: false,
        message: `Farming data with appId ${appId} not found.`,
      });
    }

    const updated = await Farming.findOneAndUpdate(
      { appId: numericAppId, chainId },
      {
        $set: updatedData, // Replace all fields with new data
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: `Farming data with appId ${appId} updated successfully.`,
      updatedData: updated,
    });
  } catch (error) {
    logger.error("Error updating farming data:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while updating farming data.",
      error: error.message,
    });
  }
};


// Delete farming data by ID
const deleteFarmingData = async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await Farming.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: `Farming data with ID ${id} not found.`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Farming data with ID ${id} deleted successfully.`,
      deletedId: id,
    });
  } catch (error) {
    logger.error("Error deleting farming data:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while deleting farming data.",
      error: error.message,
    });
  }
};

module.exports = {
  getAllFarmingData,
  getFarmingDataByCreatorId,
  addFarmingData,
  updateFarmingData,
  deleteFarmingData,
  getFarmingDataByAppId,
  getFarmingDataByOnlyAppId
};
