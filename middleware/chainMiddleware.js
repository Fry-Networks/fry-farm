/**
 * Express middleware that extracts chainId from request and injects chain config.
 *
 * Chain ID sources (in priority order):
 * 1. X-Chain-Id header
 * 2. ?chainId query parameter
 * 3. Default: 'algorand-mainnet'
 *
 * Usage in controllers: req.chainId, req.chainConfig
 */
const { getChainConfig, isValidChainId, DEFAULT_CHAIN_ID } = require('../config/chains');

function chainMiddleware(req, res, next) {
  const chainId = req.headers['x-chain-id'] || req.query.chainId || DEFAULT_CHAIN_ID;

  if (!isValidChainId(chainId)) {
    return res.status(400).json({
      error: 'Invalid chain',
      message: `Unsupported chainId: ${chainId}. Supported: algorand-mainnet, voi-mainnet`,
    });
  }

  req.chainId = chainId;
  req.chainConfig = getChainConfig(chainId);
  next();
}

/** Route-level middleware: reject requests not on the specified chain */
function requireChain(requiredChainId) {
  return (req, res, next) => {
    if (req.chainId !== requiredChainId) {
      const name = req.chainConfig?.displayName || req.chainId;
      return res.status(400).json({
        error: 'Not available',
        message: `This feature is only available on Algorand`,
      });
    }
    next();
  };
}

const algorandOnly = requireChain('algorand-mainnet');

module.exports = chainMiddleware;
module.exports.requireChain = requireChain;
module.exports.algorandOnly = algorandOnly;
