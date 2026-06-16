const logger = require('../config/logger');
const { getLaunchesStats, getTokenList, enrichTokens, getTokenDetail } = require('../services/launchesService');

const getStats = async (req, res) => {
  try {
    const stats = await getLaunchesStats(req.chainId);
    return res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Launches getStats error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getTokens = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const tokens = await getTokenList(req.chainId);
    const enriched = await enrichTokens(tokens, req.chainId, limit);
    return res.json({ success: true, data: enriched, total: tokens.length });
  } catch (err) {
    logger.error('Launches getTokens error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getTokenDetailHandler = async (req, res) => {
  try {
    const asaId = parseInt(req.params.asaId);
    if (!Number.isInteger(asaId) || asaId <= 0) {
      return res.status(400).json({ success: false, message: 'asaId must be a positive integer' });
    }
    const detail = await getTokenDetail(asaId, req.chainId);
    return res.json({ success: true, data: detail });
  } catch (err) {
    if (err.statusCode === 404 || err.message.includes('not found')) {
      logger.warn('Launches getTokenDetail not found:', asaId);
      return res.status(404).json({ success: false, message: 'Token not found' });
    }
    logger.error('Launches getTokenDetail error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats, getTokens, getTokenDetail: getTokenDetailHandler };
