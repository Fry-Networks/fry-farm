const logger = require("../config/logger");
const deviceAccessService = require("../services/deviceAccessService");

// Check gated access for a wallet
const checkAccess = async (req, res) => {
  const { appId, wallet } = req.params;

  try {
    const result = await deviceAccessService.checkAccess(appId, wallet);

    res.status(200).json({
      success: true,
      message: result.hasAccess ? "Access granted." : "Access denied.",
      data: result,
    });
  } catch (error) {
    logger.error("Error checking device access:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while checking access.",
      error: error.message,
    });
  }
};

module.exports = { checkAccess };
