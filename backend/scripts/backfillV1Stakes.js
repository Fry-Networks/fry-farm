#!/usr/bin/env node
/**
 * Backfill missing StakingToken records for V1 staking pools.
 *
 * Dynamically discovers all stakers by querying Algorand indexer for
 * on-chain box data, then inserts missing StakingToken records into MongoDB.
 *
 * Usage:
 *   node scripts/backfillV1Stakes.js              # dry-run (default)
 *   node scripts/backfillV1Stakes.js --execute     # actually insert
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const algosdk = require("algosdk");
const StakingToken = require("../models/stakingTokenSchema");
const Staking = require("../models/stakingSchema");

const INDEXER_BASE = "https://mainnet-idx.4160.nodely.dev";
const DRY_RUN = !process.argv.includes("--execute");
const DELAY_MS = 150;
const BOX_LIST_DELAY_MS = 300;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Decode Algorand address to 32-byte public key, then base64 encode for box query */
function addressToBoxB64(address) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of address) {
    const val = alpha.indexOf(c);
    if (val < 0) throw new Error(`Invalid base32 char: ${c}`);
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const pubkey = Buffer.from(bytes.slice(0, 32));
  return pubkey.toString("base64");
}

/** Fetch with retry for transient indexer errors */
async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.ok || res.status === 404) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const delay = Math.min(200 * Math.pow(2, attempt - 1), 2000);
      console.warn(`  [retry] ${res.status} for ${url}, waiting ${delay}ms (${attempt}/${maxRetries})`);
      await sleep(delay);
      continue;
    }
    throw new Error(`Indexer ${res.status} for ${url} after ${maxRetries} attempts`);
  }
}

/** Read box data for a wallet from Algorand indexer */
async function readBox(appId, wallet) {
  const boxName = addressToBoxB64(wallet);
  const url = `${INDEXER_BASE}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(boxName)}`;
  const res = await fetchWithRetry(url);
  if (res.status === 404) return null;
  const json = await res.json();
  const raw = Buffer.from(json.value, "base64");
  if (raw.length < 16) {
    console.warn(`  [warn] Box too short (${raw.length} bytes) for ${wallet} in ${appId}`);
    return null;
  }

  const staked = raw.readBigUInt64BE(0);
  const stakeTime = raw.readBigUInt64BE(8);
  return { staked: Number(staked), stakeTime: Number(stakeTime) };
}

/** List all boxes for an app, returning decoded Algorand addresses */
async function listBoxes(appId) {
  const wallets = [];
  let nextToken = null;

  do {
    let url = `${INDEXER_BASE}/v2/applications/${appId}/boxes`;
    if (nextToken) url += `?next=${encodeURIComponent(nextToken)}`;

    const res = await fetchWithRetry(url);
    if (res.status === 404) return wallets; // app deleted

    const json = await res.json();
    for (const box of json.boxes || []) {
      const rawBytes = Buffer.from(box.name, "base64");
      if (rawBytes.length !== 32) continue; // not a wallet pubkey box
      try {
        const address = algosdk.encodeAddress(new Uint8Array(rawBytes));
        wallets.push(address);
      } catch {
        // invalid pubkey, skip
      }
    }

    nextToken = json["next-token"] || null;
    if (nextToken) await sleep(100);
  } while (nextToken);

  return wallets;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  V1 Staking Backfill`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "EXECUTE (writing to DB)"}`);
  console.log(`  Indexer: ${INDEXER_BASE}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nInterrupted — disconnecting...");
    await mongoose.disconnect();
    process.exit(0);
  });

  // 2. Load V1 pool metadata
  console.log("--- Loading V1 pool metadata ---");
  const v1Pools = await Staking.find({
    $or: [{ contractVersion: 1 }, { contractVersion: { $exists: false } }],
  }).lean();

  if (v1Pools.length === 0) {
    console.log("No V1 pools found. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  const poolCache = {};
  for (const pool of v1Pools) {
    if (!pool.stakingContractId) {
      console.log(`  [skip] Pool ${pool._id} has no stakingContractId`);
      continue;
    }
    const appId = Number(pool.stakingContractId);
    poolCache[appId] = {
      poolId: String(pool._id),
      apr: pool.aprRate,
      lockPeriod: pool.lockPeriod,
      poolStartTime: pool.stakingStartTime,
      poolEndTime: pool.stakingEndTime,
      poolTime: pool.stakingEndTime - pool.stakingStartTime,
      rewardToken: Number(pool.rewardToken.id),
      stakeTokens: Number(pool.stakeToken.id),
    };
    console.log(`  [ok] appId ${appId} → poolId ${poolCache[appId].poolId} (${pool.stakeToken.name} → ${pool.rewardToken.name})`);
  }

  const appIds = Object.keys(poolCache).map(Number);
  console.log(`\nFound ${appIds.length} V1 pools with contract IDs\n`);

  // 3. Discover all stakers on-chain
  console.log("--- Discovering on-chain stakers (box listing) ---");
  const discovered = []; // { appId, wallet }

  for (const appId of appIds) {
    try {
      const wallets = await listBoxes(appId);
      console.log(`  appId ${appId}: ${wallets.length} boxes found`);
      for (const wallet of wallets) {
        discovered.push({ appId, wallet });
      }
    } catch (err) {
      console.error(`  [ERR] appId ${appId}: ${err.message}`);
    }
    await sleep(BOX_LIST_DELAY_MS);
  }

  console.log(`\nTotal discovered: ${discovered.length} (wallet, pool) pairs\n`);

  // 4. Filter to missing records
  console.log("--- Checking for existing records ---");
  const missing = [];
  let alreadyExists = 0;

  for (const { appId, wallet } of discovered) {
    const existing = await StakingToken.findOne({ wallet, appId }).lean();
    if (existing) {
      alreadyExists++;
    } else {
      missing.push({ appId, wallet });
    }
  }

  console.log(`  Already in DB: ${alreadyExists}`);
  console.log(`  Missing (need backfill): ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("Nothing to backfill. All records exist.");
    await mongoose.disconnect();
    return;
  }

  // 5. Read box data and insert missing records
  console.log("--- Reading box data & inserting missing records ---");
  let inserted = 0;
  let skippedZero = 0;
  let skippedNoBox = 0;
  let errors = 0;

  for (const { appId, wallet } of missing) {
    const pool = poolCache[appId];
    try {
      const box = await readBox(appId, wallet);
      if (!box) {
        console.log(`  [skip] ${wallet.slice(0, 8)}... in ${appId} — no box on-chain`);
        skippedNoBox++;
        continue;
      }
      if (box.staked === 0) {
        console.log(`  [skip] ${wallet.slice(0, 8)}... in ${appId} — staked=0`);
        skippedZero++;
        continue;
      }

      const record = {
        wallet,
        poolId: pool.poolId,
        appId,
        totalStaked: box.staked,
        apr: pool.apr,
        lockPeriod: pool.lockPeriod,
        poolStartTime: pool.poolStartTime,
        poolEndTime: pool.poolEndTime,
        poolTime: pool.poolTime,
        rewardToken: pool.rewardToken,
        stakeTokens: pool.stakeTokens,
      };

      if (!DRY_RUN) {
        const result = await StakingToken.findOneAndUpdate(
          { wallet, appId },
          { $setOnInsert: record },
          { upsert: true, new: true }
        );
        console.log(`  [inserted] _id=${result._id} wallet=${wallet} appId=${appId} staked=${box.staked.toLocaleString()}`);
      } else {
        console.log(`  [would insert] wallet=${wallet} appId=${appId} staked=${box.staked.toLocaleString()} stakeTime=${new Date(box.stakeTime * 1000).toISOString()}`);
      }
      inserted++;

      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  [ERR] ${wallet.slice(0, 8)}... in ${appId}: ${err.message}`);
      errors++;
    }
  }

  // 6. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY (${DRY_RUN ? "DRY RUN" : "EXECUTED"})`);
  console.log(`  V1 pools scanned:    ${appIds.length}`);
  console.log(`  Total discovered:    ${discovered.length}`);
  console.log(`  Already in DB:       ${alreadyExists}`);
  console.log(`  Inserted:            ${inserted}`);
  console.log(`  Skipped (staked=0):  ${skippedZero}`);
  console.log(`  Skipped (no box):    ${skippedNoBox}`);
  console.log(`  Errors:              ${errors}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  Run with --execute to apply changes.\n");
  }

  // Verification (execute mode only)
  if (!DRY_RUN && inserted > 0) {
    console.log("--- Verification ---");
    for (const appId of appIds) {
      const count = await StakingToken.countDocuments({ appId });
      console.log(`  appId ${appId}: ${count} records in DB`);
    }
    console.log();
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
