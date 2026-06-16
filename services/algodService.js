const algosdk = require('algosdk');
const logger = require('../config/logger');
const { getChainConfig, DEFAULT_CHAIN_ID } = require('../config/chains');

const CIRCUIT_OPEN_DURATION_MS = 30_000;
const MAX_FAILURES = 3;

/** Per-chain circuit breaker state: Map<chainId, nodes[]> */
const chainNodes = new Map();

function getNodes(chainId) {
  if (chainNodes.has(chainId)) return chainNodes.get(chainId);

  const config = getChainConfig(chainId);
  const nodes = config.algodEndpoints.map(n => ({
    ...n,
    client: new algosdk.Algodv2(n.token, n.server, n.port),
    failures: 0,
    circuitOpen: false,
    lastProbe: 0,
  }));
  chainNodes.set(chainId, nodes);
  return nodes;
}

/** Per-chain indexer nodes */
const chainIndexerNodes = new Map();

function getIndexerNodes(chainId) {
  if (chainIndexerNodes.has(chainId)) return chainIndexerNodes.get(chainId);

  const config = getChainConfig(chainId);
  const nodes = config.indexerEndpoints.map(n => ({
    ...n,
    client: new algosdk.Indexer(n.token, n.server, n.port),
    failures: 0,
    circuitOpen: false,
    lastProbe: 0,
  }));
  chainIndexerNodes.set(chainId, nodes);
  return nodes;
}

/**
 * Execute an operation with circuit breaker fallback across chain-specific algod nodes.
 * @param {string} chainId - Chain to use (default: algorand-mainnet)
 * @param {function} operation - async (algodClient) => result
 */
async function withFallbackForChain(chainId, operation) {
  const nodes = getNodes(chainId);
  const errors = [];
  for (const node of nodes) {
    if (node.circuitOpen) {
      if (Date.now() - node.lastProbe < CIRCUIT_OPEN_DURATION_MS) continue;
      node.lastProbe = Date.now();
      try {
        await node.client.ready().do();
        node.circuitOpen = false;
        node.failures = 0;
        logger.info(`Algod circuit closed — ${node.name} (${chainId}) recovered`);
      } catch {
        continue;
      }
    }
    try {
      const result = await operation(node.client);
      if (node.failures > 0) {
        node.failures = 0;
      }
      return result;
    } catch (err) {
      node.failures++;
      errors.push(`${node.name}: ${err.message}`);
      logger.warn(`Algod ${node.name} (${chainId}) failed (${node.failures}/${MAX_FAILURES}): ${err.message}`);
      if (node.failures >= MAX_FAILURES) {
        node.circuitOpen = true;
        logger.error(`Algod circuit opened for ${node.name} (${chainId})`);
      }
    }
  }
  throw new Error(`All algod nodes failed for ${chainId}: ${errors.join('; ')}`);
}

/** Backward-compatible: defaults to algorand-mainnet */
function withFallback(operation) {
  return withFallbackForChain(DEFAULT_CHAIN_ID, operation);
}

/** Get first healthy algod client for a chain */
function getAlgodClientForChain(chainId) {
  const nodes = getNodes(chainId);
  for (const node of nodes) {
    if (!node.circuitOpen) return node.client;
  }
  return nodes[0].client;
}

/** Backward-compatible: defaults to algorand-mainnet */
function getAlgodClient() {
  return getAlgodClientForChain(DEFAULT_CHAIN_ID);
}

/** Get first healthy indexer client for a chain */
function getIndexerClient(chainId = DEFAULT_CHAIN_ID) {
  const nodes = getIndexerNodes(chainId);
  for (const node of nodes) {
    if (!node.circuitOpen) return node.client;
  }
  return nodes[0].client;
}

/**
 * Get the indexer base URL for raw fetch() calls.
 * Returns the server URL of the first healthy indexer endpoint.
 */
function getIndexerUrl(chainId = DEFAULT_CHAIN_ID) {
  const nodes = getIndexerNodes(chainId);
  for (const node of nodes) {
    if (!node.circuitOpen) return node.server;
  }
  return nodes[0].server;
}

module.exports = {
  // Backward compatible (algorand-mainnet default)
  withFallback,
  getAlgodClient,
  // Chain-aware
  withFallbackForChain,
  getAlgodClientForChain,
  getIndexerClient,
  getIndexerUrl,
};
