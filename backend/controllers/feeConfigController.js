const logger = require('../config/logger');
const FeeConfig = require('../models/feeConfigSchema');
const { getFryUsdPrice } = require('../services/priceService');

const getFeeConfig = async (req, res) => {
  try {
    const config = await FeeConfig.getFeeConfig();
    const data = config.toObject ? config.toObject() : { ...config };
    // Override feeRecipient with chain-specific value
    if (req.chainConfig?.feeRecipient) {
      data.feeRecipient = req.chainConfig.feeRecipient;
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    logger.error('getFeeConfig error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateFeeConfig = async (req, res) => {
  try {
    const config = await FeeConfig.getFeeConfig();
    const updates = req.body;

    // Apply updates for fields that exist in the schema
    Object.keys(updates).forEach((key) => {
      if (config.schema.paths[key]) {
        config[key] = updates[key];
      }
    });

    // Validate revShare sum = 100 if any revShare field was updated
    const revShareKeys = ['revShareStakers', 'revShareTreasury', 'revSharePoolCreator', 'revShareCompound'];
    const hasRevShareUpdate = revShareKeys.some((k) => k in updates);
    if (hasRevShareUpdate) {
      const sum = revShareKeys.reduce((acc, k) => acc + config[k], 0);
      if (sum !== 100) {
        return res.status(400).json({
          success: false,
          message: `Revenue share percentages must sum to 100, got ${sum}`,
        });
      }
    }

    config.updatedBy = req.user.wallet;
    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Fee config updated',
      data: config,
    });
  } catch (err) {
    logger.error('updateFeeConfig error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const calculatePoolCreationFee = async (req, res) => {
  try {
    const config = await FeeConfig.getFeeConfig();
    const fryPrice = await getFryUsdPrice();

    if (!fryPrice || fryPrice === 0) {
      return res.status(503).json({
        success: false,
        message: 'Unable to fetch FRY price. Try again later.',
      });
    }

    const feeUsd = config.poolCreationFeeUsd;
    const feeInFry = Math.ceil(feeUsd / fryPrice);
    const feeInMicroFry = feeInFry * 1_000_000;

    return res.status(200).json({
      success: true,
      data: {
        feeUsd,
        fryPrice,
        feeInFry,
        feeInMicroFry,
      },
    });
  } catch (err) {
    logger.error('calculatePoolCreationFee error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getFeeConfig,
  updateFeeConfig,
  calculatePoolCreationFee,
};
