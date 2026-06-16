/**
 * Migration: Add chainId field to all documents that don't have one.
 *
 * Usage:
 *   node scripts/migrate-add-chainId.js             # Dry run (read-only)
 *   node scripts/migrate-add-chainId.js --execute    # Actually perform migration
 *
 * Safety:
 * - Default is dry run — no writes unless --execute is passed
 * - Only sets chainId on documents where it doesn't exist (no overwrites)
 * - Uses { chainId: { $exists: false } } filter
 * - Creates chainId indexes (background build)
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EXECUTE = process.argv.includes('--execute');
const DEFAULT_CHAIN_ID = 'algorand-mainnet';

// All collections that should have chainId
// Collection names match the 3rd arg in mongoose.model() or auto-pluralized model name
const COLLECTIONS = [
  'users',
  'stakings',
  'farmingPools',
  'stakingtokens',
  'stakerdatas',
  'withdrawalTokens',
  'claimrewards',
  'yieldfarmings',
  'stakeFarmingTokens',
  'farmingWithdrawalTokens',
  'claimfarmrewards',
  'userswaphistories',
  'rewardsconfig',
  'walletstreaks',
  'dailyclaims',
  'circuitbreakerstate',
  'feeconfig',
  'nftStakingPools',
  'nftStakedTokens',
  'nftStakingClaims',
  'alphaArcadePools',
  'alphaArcadePositions',
  'events',
  'eventPoints',
  'challenges',
  'tokens',
  'devicePoolAnnouncements',
  'aiinteractions',
  'gasFee',
  // Already has chainId but may have docs without it:
  'devicePools',
  'devicePositions',
];

async function main() {
  console.log(`\n=== chainId Migration ${EXECUTE ? '(EXECUTE MODE)' : '(DRY RUN)'} ===\n`);

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI environment variable is not set.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  let totalMigrated = 0;
  let totalIndexesCreated = 0;

  // Get list of actual collections in the database
  const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

  for (const collectionName of COLLECTIONS) {
    if (!existingCollections.includes(collectionName)) {
      console.log(`Collection: ${collectionName} — SKIPPED (does not exist in database)\n`);
      continue;
    }

    const collection = db.collection(collectionName);

    const totalDocs = await collection.countDocuments();
    const missingChainId = await collection.countDocuments({ chainId: { $exists: false } });
    const hasChainId = await collection.countDocuments({ chainId: { $exists: true } });

    console.log(`Collection: ${collectionName}`);
    console.log(`  Total documents:     ${totalDocs}`);
    console.log(`  Missing chainId:     ${missingChainId}`);
    console.log(`  Already has chainId: ${hasChainId}`);

    if (EXECUTE && missingChainId > 0) {
      const result = await collection.updateMany(
        { chainId: { $exists: false } },
        { $set: { chainId: DEFAULT_CHAIN_ID } }
      );
      console.log(`  MIGRATED: ${result.modifiedCount} documents set to '${DEFAULT_CHAIN_ID}'`);
      totalMigrated += result.modifiedCount;
    }

    // Check if chainId index exists
    const indexes = await collection.indexes();
    const hasIndex = indexes.some(idx => idx.key && idx.key.chainId !== undefined);

    console.log(`  chainId index:       ${hasIndex ? 'EXISTS' : 'MISSING'}`);

    if (EXECUTE && !hasIndex) {
      console.log(`  Creating index on chainId...`);
      await collection.createIndex({ chainId: 1 }, { background: true });
      console.log(`  Index created (background).`);
      totalIndexesCreated++;
    }

    console.log('');
  }

  if (EXECUTE) {
    console.log(`\nMigration complete. ${totalMigrated} documents updated, ${totalIndexesCreated} indexes created.`);
  } else {
    console.log('\nDRY RUN complete. No changes made.');
    console.log('Run with --execute to apply changes.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration error:', err);
  mongoose.disconnect().then(() => process.exit(1));
});
