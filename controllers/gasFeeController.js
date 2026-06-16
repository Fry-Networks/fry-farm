const logger = require("../config/logger");
const GasFee = require("../models/gasFeeSchema");

const addGasFee = async (req, res) => {
  const { appId, userId, gasAmount, gasType } = req.body;

  if (appId == null || !userId || gasAmount == null || !gasType) {
    return res.status(400).json({
      success: false,
      message: "Please provide all required fields: appId, userId, gasAmount, gasType",
    });
  }

  try {
    const newGasFee = new GasFee({
      appId,
      userId,
      gasAmount,
      gasType
    });

    await newGasFee.save();

    res.status(201).json({
      success: true,
      message: "Gas fee recorded successfully.",
      data: newGasFee,
    });
  } catch (error) {
    logger.error("Error adding gas fee:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while adding the gas fee.",
      error: error.message,
    });
  }
};

const getAllGasFees = async (req, res) => {
  try {
    const fees = await GasFee.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: fees,
    });
  } catch (error) {
    logger.error("Error fetching all gas fees:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch gas fees.",
      error: error.message,
    });
  }
};

const getGasFeesByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const fees = await GasFee.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: fees,
    });
  } catch (error) {
    logger.error("Error fetching gas fees by userId:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch gas fees for user.",
      error: error.message,
    });
  }
};

const getMonthlyGasFees = async (req, res) => {
  try {
    const { appId } = req.query;

    const matchQuery = {};
    if (appId) {
      matchQuery.appId = parseInt(appId);
    }

    const gasData = await GasFee.aggregate([
      { $match: matchQuery }, // ✅ Filter by appId if provided
      {
        $group: {
          _id: { $month: '$createdAt' },
          totalGas: { $sum: '$gasAmount' },
        },
      },
      {
        $sort: { '_id': 1 }, // Sort by month number
      },
    ]);

    // Convert to array with 12 months (fill 0 where no data)
    const result = Array(12).fill(0);
    gasData.forEach((entry) => {
      result[entry._id - 1] = entry.totalGas;
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error fetching monthly gas fees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gas fee statistics.',
    });
  }
};


const getWeeklyGasFees = async (req, res) => {
  try {
    const { appId } = req.query;

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const matchQuery = {
      createdAt: { $gte: fourWeeksAgo },
    };

    if (appId) {
      matchQuery.appId = parseInt(appId);
    }

    const weeklyData = await GasFee.aggregate([
      { $match: matchQuery },
      {
        $project: {
          week: { $isoWeek: '$createdAt' },
          year: { $isoWeekYear: '$createdAt' },
          gasAmount: 1,
        },
      },
      {
        $group: {
          _id: { year: '$year', week: '$week' },
          totalGas: { $sum: '$gasAmount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
    ]);

    const result = Array(4).fill(0);
    weeklyData.forEach((entry, index) => {
      result[index] = entry.totalGas;
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error fetching weekly gas fees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly gas fee stats',
    });
  }
};


module.exports = {
  addGasFee,
  getAllGasFees,
  getGasFeesByUserId,
  getMonthlyGasFees,
  getWeeklyGasFees
};
