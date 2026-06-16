const logger = require("../config/logger");
const Withdraw = require("../models/withdrawSchema");

// Add a new withdrawal log
const addWithdrawLog = async (req, res) => {
  try {
    const { tokens, wallet, poolId, appId } = req.body;

    if (tokens == null || !wallet || !poolId || appId == null) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Verify wallet matches authenticated user
    if (wallet !== req.user.wallet) {
      return res.status(403).json({ success: false, message: "Wallet does not match authenticated user" });
    }

    const newWithdraw = new Withdraw({
      tokens,
      wallet,
      poolId,
      appId
    });

    const saved = await newWithdraw.save();

    res.status(201).json({
      success: true,
      message: "Withdrawal log saved successfully",
      data: saved,
    });
  } catch (error) {
    logger.error("Error saving withdrawal log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save withdrawal log",
      error: error.message,
    });
  }
};

// Get all withdrawal logs
const getAllWithdrawals = async (req, res) => {
  try {
    const logs = await Withdraw.find().sort({ timestamp: -1 });
    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching withdrawal logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawal logs",
      error: error.message,
    });
  }
};

// Get withdrawals by wallet address
const getWithdrawalsByWallet = async (req, res) => {
  try {
    const { wallet } = req.params;
    const logs = await Withdraw.find({ wallet }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching wallet logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet logs",
      error: error.message,
    });
  }
};

// Get withdrawals by pool ID
const getWithdrawalsByPool = async (req, res) => {
  try {
    const { poolId } = req.params;
    const logs = await Withdraw.find({ poolId }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Error fetching pool withdrawal logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawal logs for pool",
      error: error.message,
    });
  }
};

module.exports = {
  addWithdrawLog,
  getAllWithdrawals,
  getWithdrawalsByWallet,
  getWithdrawalsByPool
};
