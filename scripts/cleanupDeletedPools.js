#!/usr/bin/env node
/**
 * Cleanup deleted farming pools from MongoDB.
 *
 * Queries the Algorand indexer for each farming pool's appId,
 * identifies on-chain-deleted applications, and removes them from MongoDB.
 *
 * Usage:
 *   node scripts/cleanupDeletedPools.js            # dry run (default)
 *   node scripts/cleanupDeletedPools.js --execute   # back up + delete
 *
 * Run inside the backend container:
 *   docker exec fry-farm-backend node scripts/cleanupDeletedPools.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const fs = require("fs");
const Farming = require("../models/farmingSchema");

const INDEXER_BASE = "https://mainnet-idx.4160.nodely.dev";
const DELAY_MS = 200;
const BACKUP_PATH = "/tmp/farming_backup.json";

const executeMode = process.argv.includes("--execute");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkAppDeleted(appId) {
  try {
    const url = `${INDEXER_BASE}/v2/applications/${appId}`;
    const res = await fetch(url);
    if (res.status === 404) return true;
    if (!res.ok) {
      console.warn(`  [warn] appId ${appId}: indexer returned ${res.status}`);
      return false; // don't delete on unknown errors
    }
    const json = await res.json();
    return json.application?.deleted === true;
  } catch (err) {
    console.warn(`  [warn] appId ${appId}: ${err.message}`);
    return false;
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  const pools = await Farming.find({});
  console.log(`Found ${pools.length} farming pools in database\n`);

  const alive = [];
  const deleted = [];

  for (const pool of pools) {
    const isDeleted = await checkAppDeleted(pool.appId);
    const status = isDeleted ? "DELETED" : "ALIVE";
    const label = pool.lpPairName || `${pool.lpToken?.tokenA}/${pool.lpToken?.tokenB}`;
    console.log(`  appId ${pool.appId}\t${label}\t${status}`);

    if (isDeleted) {
      deleted.push(pool);
    } else {
      alive.push(pool);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Alive:   ${alive.length}`);
  console.log(`Deleted: ${deleted.length}`);

  if (deleted.length === 0) {
    console.log("\nNo deleted pools found. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  const deletedAppIds = deleted.map((p) => p.appId);
  console.log(`\nDeleted appIds: ${deletedAppIds.join(", ")}`);

  if (!executeMode) {
    console.log("\n[DRY RUN] No changes made. Run with --execute to delete.");
    await mongoose.disconnect();
    return;
  }

  // Back up deleted pools
  const backupData = deleted.map((p) => p.toObject());
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backupData, null, 2));
  console.log(`\nBackup written to ${BACKUP_PATH} (${backupData.length} pools)`);

  // Delete from MongoDB
  const result = await Farming.deleteMany({ appId: { $in: deletedAppIds } });
  console.log(`Deleted ${result.deletedCount} pools from MongoDB`);

  const remaining = await Farming.countDocuments();
  console.log(`${remaining} pools remaining in database`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
