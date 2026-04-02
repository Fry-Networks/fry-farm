const algosdk = require('algosdk');
const logger = require('../config/logger');

const ALGOD_NODES = [
  {
    name: 'ATLAS00',
    server: 'http://192.168.9.2',
    port: 4190,
    token: process.env.ATLAS00_ALGOD_TOKEN || '',
  },
  {
    name: 'Nodely',
    server: 'https://mainnet-api.4160.nodely.dev',
    port: 443,
    token: '',
  },
  {
    name: 'Algonode',
    server: 'https://mainnet-api.algonode.cloud',
    port: 443,
    token: '',
  },
];

const nodes = ALGOD_NODES.map(n => ({
  ...n,
  client: new algosdk.Algodv2(n.token, n.server, n.port),
  failures: 0,
  circuitOpen: false,
  lastProbe: 0,
}));

const CIRCUIT_OPEN_DURATION_MS = 30_000;
const MAX_FAILURES = 3;

async function withFallback(operation) {
  const errors = [];
  for (const node of nodes) {
    if (node.circuitOpen) {
      if (Date.now() - node.lastProbe < CIRCUIT_OPEN_DURATION_MS) continue;
      node.lastProbe = Date.now();
      try {
        await node.client.ready().do();
        node.circuitOpen = false;
        node.failures = 0;
        logger.info(`Algod circuit closed — ${node.name} recovered`);
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
      logger.warn(`Algod ${node.name} failed (${node.failures}/${MAX_FAILURES}): ${err.message}`);
      if (node.failures >= MAX_FAILURES) {
        node.circuitOpen = true;
        logger.error(`Algod circuit opened for ${node.name}`);
      }
    }
  }
  throw new Error(`All algod nodes failed: ${errors.join('; ')}`);
}

function getAlgodClient() {
  for (const node of nodes) {
    if (!node.circuitOpen) return node.client;
  }
  return nodes[0].client;
}

module.exports = { withFallback, getAlgodClient };
