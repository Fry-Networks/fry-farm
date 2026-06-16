const logger = require('../config/logger');
const { getDropsStats, getDropList, getDropDetail, checkEligibility } = require('../services/dropsService');

const getStats = async (req, res) => {
  try {
    const stats = await getDropsStats(req.chainId);
    return res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Drops getStats error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getDrops = async (req, res) => {
  try {
    const data = await getDropList(req.chainId);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('Drops getDrops error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getDropDetailHandler = async (req, res) => {
  try {
    const dropId = parseInt(req.params.dropId);
    if (!Number.isInteger(dropId) || dropId <= 0) {
      return res.status(400).json({ success: false, message: 'dropId must be a positive integer' });
    }
    const detail = await getDropDetail(dropId, req.chainId);
    return res.json({ success: true, data: detail });
  } catch (err) {
    logger.error('Drops getDropDetail error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const checkEligibilityHandler = async (req, res) => {
  try {
    const dropId = parseInt(req.params.dropId);
    if (!Number.isInteger(dropId) || dropId <= 0) {
      return res.status(400).json({ success: false, message: 'dropId must be a positive integer' });
    }
    const wallet = req.query.wallet || req.headers['x-wallet-address'];
    if (!wallet) {
      return res.status(400).json({ success: false, message: 'wallet address required (query param or x-wallet-address header)' });
    }
    const eligibility = await checkEligibility(dropId, wallet, req.chainId);
    return res.json({ success: true, data: eligibility });
  } catch (err) {
    logger.error('Drops checkEligibility error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats, getDrops, getDropDetail: getDropDetailHandler, checkEligibility: checkEligibilityHandler };
