const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

// Memory cache for token config (simple approach)
let cachedConfig = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * GET /api/token-config
 * Returns current token configuration (mode + ASA IDs)
 * Sourced from MongoDB main.configs.reward_mode
 */
router.get('/', async (req, res) => {
  try {
    // Check cache first
    if (cachedConfig && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL_MS)) {
      return res.json(cachedConfig);
    }

    // Connect to main database and query reward_mode
    const mongoose = require('mongoose');
    let db = mongoose.connection;
    
    if (!db || !db.collection) {
      // Fallback to default if mongoose not ready
      logger.warn('Mongoose not ready, returning default token config');
      const defaultConfig = {
        mode: 'FRY2',
        active_fry_asa_id: '2485314946',
        fry2_asa_id: '2485314946',
        fry3_asa_id: '3612979527'
      };
      cachedConfig = defaultConfig;
      cacheTimestamp = Date.now();
      return res.json(defaultConfig);
    }

    // Query main.configs collection for reward_mode
    const configCollection = db.collection('configs');
    const configDoc = await configCollection.findOne({ _id: 'reward_mode' });

    let mode = 'FRY2'; // Default to FRY2
    if (configDoc && configDoc.mode) {
      mode = configDoc.mode;
    }

    const response = {
      mode: mode,
      active_fry_asa_id: mode === 'FRY3' ? '3612979527' : '2485314946',
      fry2_asa_id: '2485314946',
      fry3_asa_id: '3612979527'
    };

    // Cache the result
    cachedConfig = response;
    cacheTimestamp = Date.now();

    res.json(response);
  } catch (err) {
    logger.error('Error fetching token config:', err);
    // Fallback to FRY2 on any error
    const fallback = {
      mode: 'FRY2',
      active_fry_asa_id: '2485314946',
      fry2_asa_id: '2485314946',
      fry3_asa_id: '3612979527'
    };
    res.status(500).json(fallback);
  }
});

module.exports = router;
