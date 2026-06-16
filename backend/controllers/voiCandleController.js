const VoiPriceSample = require('../models/voiPriceSampleSchema');
const logger = require('../config/logger');

async function getCandles(req, res) {
  try {
    const fromTokenId = Number(req.query.from);
    const toTokenId = Number(req.query.to);

    if (isNaN(fromTokenId) || isNaN(toTokenId)) {
      return res.status(400).json({ success: false, message: 'from and to token IDs required' });
    }

    const interval = Number(req.query.interval) || 3600; // default 1 hour
    const now = Math.floor(Date.now() / 1000);
    const start = Number(req.query.start) || now - 86400; // default 24h ago
    const end = Number(req.query.end) || now;

    const startDate = new Date(start * 1000);
    const endDate = new Date(end * 1000);
    const intervalMs = interval * 1000;

    const samples = await VoiPriceSample.aggregate([
      {
        $match: {
          $or: [
            { fromTokenId, toTokenId },
            { fromTokenId: toTokenId, toTokenId: fromTokenId },
          ],
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $addFields: {
          // Invert price when the stored direction is reversed from what was requested
          effectivePrice: {
            $cond: {
              if: { $eq: ['$fromTokenId', fromTokenId] },
              then: '$price',
              else: {
                $cond: {
                  if: { $gt: ['$price', 0] },
                  then: { $divide: [1, '$price'] },
                  else: 0,
                },
              },
            },
          },
          bucket: {
            $floor: {
              $divide: [{ $subtract: ['$timestamp', new Date(0)] }, intervalMs],
            },
          },
        },
      },
      {
        $sort: { timestamp: 1 },
      },
      {
        $group: {
          _id: '$bucket',
          timestamp: { $first: '$timestamp' },
          open: { $first: '$effectivePrice' },
          high: { $max: '$effectivePrice' },
          low: { $min: '$effectivePrice' },
          close: { $last: '$effectivePrice' },
          volume: { $sum: '$volume' },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          timestamp: { $floor: { $divide: [{ $subtract: ['$timestamp', new Date(0)] }, 1000] } },
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
        },
      },
    ]);

    res.json(samples);
  } catch (err) {
    logger.error('voiCandles: aggregation error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch candle data' });
  }
}

module.exports = { getCandles };
