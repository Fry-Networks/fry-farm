const logger = require('../config/logger');
const NftCollection = require('../models/nftCollectionSchema');
const NftStakingPool = require('../models/nftStakingPoolSchema');
const { getIndexerClient } = require('./algodService');
const https = require('https');

/**
 * Fetch JSON from a URL (for ARC3 metadata).
 */
function fetchJson(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    protocol.get(url, { timeout }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

/**
 * Sync a single collection by creator address.
 * Discovers all NFT-like ASAs (total=1, decimals=0) created by this address.
 */
async function syncCollectionByCreator(creatorAddress, chainId = 'algorand-mainnet') {
  const indexer = getIndexerClient(chainId);

  // Paginate all created assets
  let allAssets = [];
  let nextToken;
  for (let page = 0; page < 50; page++) {
    const query = indexer.lookupAccountCreatedAssets(creatorAddress).limit(100);
    if (nextToken) query.nextToken(nextToken);
    const result = await query.do();
    const batch = result.assets || [];
    allAssets = allAssets.concat(batch);
    nextToken = result.nextToken;
    if (!nextToken || batch.length === 0) break;
  }

  // Filter NFT-like assets
  const nfts = allAssets.filter((a) => {
    const total = Number(a.params?.total);
    const decimals = Number(a.params?.decimals);
    return total === 1 && decimals === 0 && !a.deleted;
  });

  if (nfts.length === 0) {
    logger.warn(`NFT collection sync: ${creatorAddress} (${chainId}) has 0 NFTs`);
    return null;
  }

  // Extract collection name from first NFT (strip #N suffix)
  const firstName = (nfts[0].params?.name || '').replace(/\s*#?\d+$/, '').trim();
  const collectionName = firstName || `Collection by ${creatorAddress.slice(0, 8)}...`;

  // Get thumbnail from first NFT's ARC3 metadata URL
  let imageUrl = '';
  const metadataUrl = nfts[0].params?.url || '';
  if (metadataUrl && (metadataUrl.startsWith('https://') || metadataUrl.startsWith('http://'))) {
    try {
      const cleanUrl = metadataUrl.replace(/#arc3$/, '');
      const meta = await fetchJson(cleanUrl);
      imageUrl = meta.image || meta.image_url || '';
    } catch {
      // metadata fetch failed — leave imageUrl empty
    }
  }

  // Sample ASA IDs (first 5)
  const sampleAsaIds = nfts.slice(0, 5).map((a) => Number(a.index));

  // Upsert
  const update = {
    name: collectionName,
    imageUrl,
    totalSupply: nfts.length,
    sampleAsaIds,
    lastSync: new Date(),
  };

  const result = await NftCollection.findOneAndUpdate(
    { chainId, creatorAddress },
    { $set: update, $setOnInsert: { chainId, creatorAddress, createdAt: new Date() } },
    { upsert: true, new: true }
  );

  logger.info(`NFT collection sync: ${creatorAddress.slice(0, 12)}... (${chainId}) — "${collectionName}" ${nfts.length} NFTs`);
  return result;
}

/**
 * Seed collections from existing NFT staking pools.
 */
async function seedFromExistingPools() {
  const pools = await NftStakingPool.find({}).lean();
  const creators = [...new Set(pools.map((p) => p.collectionCreator).filter(Boolean))];
  const stats = { total: creators.length, synced: 0, errors: 0 };

  for (const creator of creators) {
    const chainId = pools.find((p) => p.collectionCreator === creator)?.chainId || 'algorand-mainnet';
    try {
      await syncCollectionByCreator(creator, chainId);
      stats.synced++;
    } catch (err) {
      logger.warn(`NFT collection seed failed for ${creator}: ${err.message}`);
      stats.errors++;
    }
    // Small delay between creators
    await new Promise((r) => setTimeout(r, 300));
  }

  return stats;
}

/**
 * Re-sync all collections that haven't been synced in >24 hours.
 */
async function syncAllCollections() {
  const staleDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stale = await NftCollection.find({
    $or: [{ lastSync: null }, { lastSync: { $lt: staleDate } }],
  }).lean();

  const stats = { total: stale.length, synced: 0, errors: 0 };

  for (const coll of stale) {
    try {
      await syncCollectionByCreator(coll.creatorAddress, coll.chainId);
      stats.synced++;
    } catch (err) {
      logger.warn(`NFT collection re-sync failed for ${coll.creatorAddress}: ${err.message}`);
      stats.errors++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return stats;
}

module.exports = { syncCollectionByCreator, seedFromExistingPools, syncAllCollections };
