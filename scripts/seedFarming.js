#!/usr/bin/env node
/**
 * Seed farming pools into MongoDB from on-chain state.
 *
 * Reads the 12 farming pool appIds from contract-addresses-summary.json,
 * fetches each application's global state from the Algorand indexer,
 * and upserts records into the farmingPools collection.
 *
 * Usage:  node scripts/seedFarming.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Farming = require("../models/farmingSchema");
const path = require("path");

const INDEXER_BASE = "https://mainnet-idx.4160.nodely.dev";
const SUMMARY_PATH = path.join(__dirname, "..", "..", "frontend", "contract-addresses-summary.json");

// ── helpers ──────────────────────────────────────────────────────────────────

/** Decode a base64 string to UTF-8 */
const b64 = (s) => Buffer.from(s, "base64").toString("utf-8");

/** Extract global-state into a plain { key: value } object */
function parseGlobalState(globalState) {
  const out = {};
  for (const entry of globalState) {
    const key = b64(entry.key);
    if (entry.value.type === 2) {
      out[key] = entry.value.uint;
    } else if (entry.value.type === 1) {
      out[key] = entry.value.bytes; // keep as base64
    }
  }
  return out;
}

/** Fetch application info from the Algorand indexer */
async function fetchAppState(appId) {
  const url = `${INDEXER_BASE}/v2/applications/${appId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Indexer ${res.status} for appId ${appId}`);
  const json = await res.json();
  const gs = json.application?.params?.["global-state"];
  if (!gs) throw new Error(`No global-state for appId ${appId}`);
  return parseGlobalState(gs);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load pool list
  const summary = require(SUMMARY_PATH);
  const pools = summary.farmingPools;
  console.log(`Found ${pools.length} farming pools in contract-addresses-summary.json`);

  // 2. Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  for (const pool of pools) {
    const { appId, creatorId, rewardToken, lpToken } = pool;

    // Skip if already exists
    const existing = await Farming.findOne({ appId });
    if (existing) {
      console.log(`  [skip] appId ${appId} already in DB`);
      skipped++;
      continue;
    }

    let gs = null;
    try {
      gs = await fetchAppState(appId);
    } catch (err) {
      console.warn(`  [warn] appId ${appId}: ${err.message} — using JSON defaults`);
    }

    try {
      const farmStartTime = gs?.["farm_start_time"] ?? 0;
      const farmEndTime = gs?.["farm_end_time"] ?? 0;

      const doc = {
        appId,
        creatorId: creatorId || "",
        lpToken: {
          tokenA: String(gs?.["lp_token_a"] ?? lpToken?.tokenA ?? "0"),
          tokenB: String(gs?.["lp_token_b"] ?? lpToken?.tokenB ?? "0"),
        },
        rewardToken: {
          id: String(gs?.["reward_token"] ?? rewardToken?.id ?? "0"),
          name: "",
        },
        rewardTokenAmount: gs?.["reward_token_amount"] ?? 0,
        farmStartTime,
        farmEndTime,
        duration: farmEndTime > farmStartTime ? farmEndTime - farmStartTime : 0,
        lockPeriod: gs?.["lock_period"] ?? 0,
        farmEntryFee: gs?.["farm_entry_fee"] ?? 0,
        rewardDistributionRate: gs?.["reward_distribution_rate"] ?? 0,
        rewardDistributionSchedule: gs?.["reward_distribution_schedule"] ?? 0,
        fryRewardFee: gs?.["fry_reward_fee"] ?? 0,
        aprRate: gs?.["apr"] ?? 0,
        totalFarmers: gs?.["total_farmers"] ?? 0,
        totalStaked: gs?.["total_staked"] ?? 0,
        rewardsDistributed: gs?.["rewards_distributed"] ?? 0,
      };

      await Farming.create(doc);
      console.log(`  [ok]   appId ${appId} inserted${gs ? '' : ' (defaults)'}`);
      inserted++;
    } catch (err) {
      console.error(`  [err]  appId ${appId}: ${err.message}`);
      errored++;
    }
  }

  console.log(`\nDone — inserted: ${inserted}, skipped: ${skipped}, errors: ${errored}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
