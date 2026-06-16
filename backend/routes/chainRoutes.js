const express = require('express');
const router = express.Router();
const { getAllChains, getChainConfig, isValidChainId } = require('../config/chains');

/**
 * GET /chains
 * Returns all supported chain configs (sanitized — no tokens or internal endpoints)
 */
router.get('/', (req, res) => {
  const chains = getAllChains().map(sanitizeForClient);
  res.json({ chains });
});

/**
 * GET /chains/:chainId
 * Returns config for a specific chain
 */
router.get('/:chainId', (req, res) => {
  const { chainId } = req.params;
  if (!isValidChainId(chainId)) {
    return res.status(404).json({ error: `Unknown chain: ${chainId}` });
  }
  res.json(sanitizeForClient(getChainConfig(chainId)));
});

/** Strip internal details (tokens, internal IPs) before sending to client */
function sanitizeForClient(config) {
  return {
    chainId: config.chainId,
    displayName: config.displayName,
    family: config.family,
    nativeAsset: config.nativeAsset,
    fryTokenId: config.fryTokenId,
    usdcId: config.usdcId,
    explorerBaseUrl: config.explorerBaseUrl,
    features: config.features,
  };
}

module.exports = router;
