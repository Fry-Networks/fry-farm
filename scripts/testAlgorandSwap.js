#!/usr/bin/env node
/**
 * Manual test for Algorand swap service (aVOI → ALGO → FRY).
 *
 * Uses checkAndSwapAvoiToFry() which reads the swap treasury's aVOI balance
 * and swaps ALL available aVOI to FRY if above threshold, then forwards FRY to E2F2LT.
 *
 * DO NOT run unattended — this sends REAL funds.
 *
 * Usage:
 *   node scripts/testAlgorandSwap.js          # check balance & swap if above threshold
 *   node scripts/testAlgorandSwap.js quote     # quote only, no execution
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { checkAndSwapAvoiToFry, getSwapQuote, MIN_SWAP_THRESHOLD, AVOI_ASA_ID } = require("../services/algorandSwapService");
const { getAlgodClientForChain } = require("../services/algodService");
const { getTreasury } = require("../services/stakingClaimService");

async function main() {
  const quoteOnly = process.argv[2] === 'quote';

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  // Resolve swap treasury address
  const { addr } = getTreasury('algorand-mainnet');
  const swapWallet = addr.toString();

  if (quoteOnly) {
    // Quote mode: fetch balance via algod, then get quote
    const client = getAlgodClientForChain('algorand-mainnet');
    const assetInfo = await client.accountAssetInformation(swapWallet, AVOI_ASA_ID).do();
    const balance = Number(assetInfo.assetHolding?.amount || 0);

    console.log(`Swap treasury (${swapWallet}) aVOI balance: ${balance / 1e6} aVOI (${balance} micro)`);
    console.log(`Swap threshold: ${MIN_SWAP_THRESHOLD / 1e6} aVOI (${MIN_SWAP_THRESHOLD} micro)`);

    if (balance < MIN_SWAP_THRESHOLD) {
      console.log(`\nBalance below threshold — would skip. Fetching quote anyway...`);
    }

    console.log(`\nFetching quote for ${balance / 1e6} aVOI → FRY...`);
    const quote = await getSwapQuote(balance);
    console.log("Quote:", JSON.stringify(quote, null, 2));
    console.log("\n(Quote only mode — not executing swap)");
    await mongoose.disconnect();
    process.exit(quote.success ? 0 : 1);
  }

  // Execute mode: checkAndSwap handles balance check + swap + FRY forwarding
  console.log("Running checkAndSwapAvoiToFry...\n");
  const result = await checkAndSwapAvoiToFry('manual-test');
  console.log("Result:", JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
