#!/usr/bin/env node
/**
 * Backfill UserSwapHistory from Algorand blockchain.
 *
 * Queries the Algorand indexer for DEX swap transactions (Tinyman V2,
 * FolksRouter) for all known wallets, then inserts matching records
 * into UserSwapHistory so the event points cron can calculate
 * trading_volume points.
 *
 * Usage:
 *   node scripts/backfillSwapHistory.js              # dry-run (default)
 *   node scripts/backfillSwapHistory.js --execute     # actually insert
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const axios = require("axios");
const UserSwapHistory = require("../models/userSwapHistorySchema");

// ── Config ───────────────────────────────────────────────────────────────────

const INDEXER_URL = "https://mainnet-idx.4160.nodely.dev";
const EVENT_START = "2026-03-07T07:00:00Z";
const EVENT_END = "2026-03-29T04:59:00Z";

// Known DEX app IDs
const SWAP_APP_IDS = new Set([
  1002541853,  // Tinyman V2
  1212658560,  // FolksRouter
]);

const DRY_RUN = !process.argv.includes("--execute");
const WALLET_DELAY_MS = 200;
const MIN_ALGO_AMOUNT = 100_000; // 0.1 ALGO — ignore fee-only payments

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decimalsCache = {};

async function getAssetDecimals(asaId) {
  if (asaId === 0) return 6; // ALGO
  if (decimalsCache[asaId] !== undefined) return decimalsCache[asaId];
  try {
    const res = await axios.get(`${INDEXER_URL}/v2/assets/${asaId}`, { timeout: 10000 });
    const decimals = res.data?.asset?.params?.decimals ?? 6;
    decimalsCache[asaId] = decimals;
    return decimals;
  } catch {
    decimalsCache[asaId] = 6; // safe default
    return 6;
  }
}

async function fetchWithRetry(url, params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.get(url, { params, timeout: 15000 });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if ((status === 429 || (status && status >= 500)) && attempt < maxRetries) {
        const delay = Math.min(300 * Math.pow(2, attempt - 1), 3000);
        console.warn(`  [retry] ${status} for ${url}, waiting ${delay}ms (${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

// ── Indexer Queries ──────────────────────────────────────────────────────────

async function getWalletTransactions(wallet) {
  const allTxns = [];
  let nextToken = null;

  do {
    const params = {
      "after-time": EVENT_START,
      "before-time": EVENT_END,
      limit: 500,
    };
    if (nextToken) params.next = nextToken;

    const data = await fetchWithRetry(
      `${INDEXER_URL}/v2/accounts/${wallet}/transactions`,
      params
    );
    allTxns.push(...(data.transactions || []));
    nextToken = data["next-token"] || null;
    if (nextToken) await sleep(100);
  } while (nextToken);

  return allTxns;
}

// ── Swap Detection ───────────────────────────────────────────────────────────

function detectSwaps(txns, wallet) {
  // Group transactions by group ID
  const groups = {};
  for (const t of txns) {
    const g = t.group;
    if (!g) continue;
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  }

  const swaps = [];

  for (const [groupId, gtxns] of Object.entries(groups)) {
    // Must contain an app call to a known DEX
    const hasDex = gtxns.some(
      (t) =>
        t["tx-type"] === "appl" &&
        SWAP_APP_IDS.has(t["application-transaction"]?.["application-id"])
    );
    if (!hasDex) continue;

    // Find outgoing transfer from wallet (the swap input)
    let inputAsset = null;
    let inputAmount = 0;

    for (const t of gtxns) {
      if (t.sender !== wallet) continue;

      if (t["tx-type"] === "axfer") {
        const atx = t["asset-transfer-transaction"] || {};
        if (atx.receiver !== wallet && (atx.amount || 0) > 0) {
          inputAsset = atx["asset-id"];
          inputAmount = atx.amount;
        }
      } else if (t["tx-type"] === "pay") {
        const ptx = t["payment-transaction"] || {};
        if (ptx.receiver !== wallet && (ptx.amount || 0) > MIN_ALGO_AMOUNT) {
          inputAsset = 0; // ALGO
          inputAmount = ptx.amount;
        }
      }
    }

    // Find incoming transfer to wallet from inner transactions (the swap output)
    let outputAsset = null;

    for (const t of gtxns) {
      for (const it of t["inner-txns"] || []) {
        if (it["tx-type"] === "axfer") {
          const atx = it["asset-transfer-transaction"] || {};
          if (atx.receiver === wallet && (atx.amount || 0) > 0) {
            outputAsset = atx["asset-id"];
          }
        } else if (it["tx-type"] === "pay") {
          const ptx = it["payment-transaction"] || {};
          if (ptx.receiver === wallet && (ptx.amount || 0) > 0) {
            outputAsset = 0; // ALGO
          }
        }
      }
    }

    // Valid swap: different input and output assets
    if (inputAsset !== null && outputAsset !== null && inputAsset !== outputAsset) {
      const time = Math.min(...gtxns.map((t) => t["round-time"] || Infinity));
      swaps.push({ inputAsset, inputAmount, outputAsset, time, groupId });
    }
  }

  return swaps;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Swap History Backfill`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "EXECUTE (writing to DB)"}`);
  console.log(`  Event window: ${EVENT_START} → ${EVENT_END}`);
  console.log(`  Indexer: ${INDEXER_URL}`);
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

  process.on("SIGINT", async () => {
    console.log("\nInterrupted — disconnecting...");
    await mongoose.disconnect();
    process.exit(0);
  });

  // 2. Get all wallets to scan
  const wallets = await mongoose.connection.db
    .collection("stakingtokens")
    .distinct("wallet");
  console.log(`Found ${wallets.length} wallets to scan\n`);

  // 3. Process each wallet
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let walletsWithSwaps = 0;

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const prefix = `[${i + 1}/${wallets.length}] ${wallet.slice(0, 12)}...`;

    try {
      const txns = await getWalletTransactions(wallet);
      const swaps = detectSwaps(txns, wallet);

      if (swaps.length === 0) {
        continue; // No swaps found — skip silently
      }

      walletsWithSwaps++;
      let walletInserted = 0;

      for (const swap of swaps) {
        // Check for duplicate
        const swapTime = new Date(swap.time * 1000);
        const exists = await UserSwapHistory.findOne({
          userId: wallet,
          timeOfSwap: swapTime,
        });

        if (exists) {
          totalSkipped++;
          continue;
        }

        // Convert raw amount to whole units
        const decimals = await getAssetDecimals(swap.inputAsset);
        const amount = swap.inputAmount / Math.pow(10, decimals);

        if (amount <= 0) continue;

        const record = {
          userId: wallet,
          amount,
          token1: { id: String(swap.inputAsset), name: "token" },
          token2: { id: String(swap.outputAsset), name: "token" },
          liquidityPoolId: "backfill",
          fee: 0,
          timeOfSwap: swapTime,
        };

        if (!DRY_RUN) {
          await UserSwapHistory.create(record);
        }

        walletInserted++;
        totalInserted++;

        const dateStr = swapTime.toISOString().slice(0, 19);
        console.log(
          `  ${prefix} ${DRY_RUN ? "[would insert]" : "[inserted]"} ` +
            `${amount.toFixed(4)} of ASA ${swap.inputAsset} → ASA ${swap.outputAsset} @ ${dateStr}`
        );
      }

      if (walletInserted > 0) {
        console.log(`  ${prefix} total: ${walletInserted} swaps\n`);
      }
    } catch (err) {
      console.error(`  ${prefix} ERROR: ${err.message}`);
      totalErrors++;
    }

    await sleep(WALLET_DELAY_MS);
  }

  // 4. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY (${DRY_RUN ? "DRY RUN" : "EXECUTED"})`);
  console.log(`  Wallets scanned:       ${wallets.length}`);
  console.log(`  Wallets with swaps:    ${walletsWithSwaps}`);
  console.log(`  Records inserted:      ${totalInserted}`);
  console.log(`  Duplicates skipped:    ${totalSkipped}`);
  console.log(`  Errors:                ${totalErrors}`);
  console.log(`  Decimals cached:       ${Object.keys(decimalsCache).length} assets`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  Run with --execute to apply changes.\n");
  }

  // Verification (execute mode only)
  if (!DRY_RUN && totalInserted > 0) {
    console.log("--- Verification ---");
    const count = await UserSwapHistory.countDocuments({});
    const backfillCount = await UserSwapHistory.countDocuments({
      liquidityPoolId: "backfill",
    });
    console.log(`  Total UserSwapHistory records: ${count}`);
    console.log(`  Backfilled records: ${backfillCount}\n`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
