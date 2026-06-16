#!/usr/bin/env node
/**
 * Manual test for Aramid bridge service (VOI → aVOI on Algorand).
 *
 * Bridges 1.5 VOI from the Voi treasury to the swap treasury (REWARD_MNEMONIC addr).
 * DO NOT run unattended — this sends REAL funds.
 *
 * Usage:
 *   node scripts/testBridge.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { bridgeVoiToAlgorand } = require("../services/aramidBridgeService");
const { getTreasury } = require("../services/stakingClaimService");

const AMOUNT_MICRO = 1_500_000; // 1.5 VOI

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  // Resolve swap treasury address (default bridge destination)
  const { addr } = getTreasury('algorand-mainnet');
  const destination = addr.toString();

  console.log(`Bridging ${AMOUNT_MICRO / 1e6} VOI → aVOI to ${destination}`);
  console.log("---");

  const result = await bridgeVoiToAlgorand(AMOUNT_MICRO, destination, 'manual-test');

  console.log("\nResult:", JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
