#!/usr/bin/env node
/**
 * Recovery script: Insert 36 missing StakingToken records.
 *
 * Root cause: on-chain stake succeeded but the separate fee transfer failed,
 * throwing an exception before the backend /stakingtoken/add call executed.
 *
 * Also cleans up 2 duplicate records in pool 3465579498 for wallet S7OS...
 *
 * Usage:
 *   node scripts/recoverMissingStakes.js              # dry-run (default)
 *   node scripts/recoverMissingStakes.js --execute     # actually insert
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const StakingToken = require("../models/stakingTokenSchema");
const Staking = require("../models/stakingSchema");

const INDEXER_BASE = "https://mainnet-idx.4160.nodely.dev";
const DRY_RUN = !process.argv.includes("--execute");

// ── Missing positions (wallets with staked > 0 only) ────────────────────────

const MISSING_POSITIONS = [
  // Pool 3468848937 (USDC → Fry) — 4 active of 6
  { appId: 3468848937, wallet: "FGCOER2A6CWC3XLQ3AWNBAB6HZF2SHYS26YCAG6EH56I62DM6RCU7BGJAQ" },
  { appId: 3468848937, wallet: "FMVQGM4DCVL2DHXET2RT5AAUPY2TZZV7RCF3V4BEBWGYIAYBU4CEP67G24" },
  { appId: 3468848937, wallet: "XTZEJ4EJXOZEOPHJHCBHO5N3ZBWBPCK6QKECVSKJ3OFSVW7PUWOM3WITHE" },
  { appId: 3468848937, wallet: "3FD4MSYU7SEHJPXYWIUXH5R7PVH7TQMSPMYKIB7N6BYYODUILL5G4WS564" },

  // Pool 3469720617 (Fry → Fry) — 13
  { appId: 3469720617, wallet: "AHR3OGEL2ZP454SC4BIOYJ73N2Y344K56MOPTPJ7G32BSUYR6HST4DOPIU" },
  { appId: 3469720617, wallet: "C7QJMEPTOC2ZVLHOXVVDF2GQINE2UQMPFDBCTM5JQFCWSOBTU52VHS5EII" },
  { appId: 3469720617, wallet: "FKULJE4P33XUZOPK56JUZPKGBDCFXP5NVNWDAYAQQVQYHU7RIHQWB6H4JA" },
  { appId: 3469720617, wallet: "IVZBBARAF2VX5LGLUYZJGV3IXIQQ2F7FN7MO5Z7MV252TSR4R5QKJ56KMY" },
  { appId: 3469720617, wallet: "JILQRZXII46DCFLMH2BTHJXS6H447NI3OU36WGRWRVQP5XGQ5LSYFLHERE" },
  { appId: 3469720617, wallet: "JOSSUIJF66PV4726EMH267H7DJPIYDNAFFQCGCXG5KUPJUL3J2FDC2S47E" },
  { appId: 3469720617, wallet: "K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ" },
  { appId: 3469720617, wallet: "NLWZTXWG63AVYQSY7VUJQKPVEHXDUUP4GUHKFX3MHMEHT42LB3XN3NAHJU" },
  { appId: 3469720617, wallet: "P744HKOJ5NTUS4JK7BJ62K6EAIW5CVUO3GJESYXZQV2BFMT3MDRFXFJMZQ" },
  { appId: 3469720617, wallet: "S7UK3J65HMPU5BL5V6NBFNDQRSGFOJTLPN34BYJQTL4RYVEVIVNXLOP2BM" },
  { appId: 3469720617, wallet: "VNRQZAX4M4AUIZAXZNVNQ74X7XPPCX3WIUYG5QE2EIGC6VQD55537KRQ7A" },
  { appId: 3469720617, wallet: "XTZEJ4EJXOZEOPHJHCBHO5N3ZBWBPCK6QKECVSKJ3OFSVW7PUWOM3WITHE" },
  { appId: 3469720617, wallet: "42TRM7VUYIJTAQGEAOKEDAI66CHJDEZ5EJA3AKIWIHY5FTPGB55XVAEUYM" },

  // Pool 3470020844 (Fry → Fry) — 4
  { appId: 3470020844, wallet: "C3OBUOZOTFYICFWX5EIMWFT5IODXOJZNV7IFK6GGAUEITUO6S2IYT6NSPQ" },
  { appId: 3470020844, wallet: "C7QJMEPTOC2ZVLHOXVVDF2GQINE2UQMPFDBCTM5JQFCWSOBTU52VHS5EII" },
  { appId: 3470020844, wallet: "K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ" },
  { appId: 3470020844, wallet: "TXDBUB2E7WAZ5CW4HDT5QEWSHVTGRC3YYBRDYEPVCD6BDRHRG62RCTNEFM" },

  // Pool 3473560676 (Fry Node → Fry Node) — 10
  { appId: 3473560676, wallet: "C7QJMEPTOC2ZVLHOXVVDF2GQINE2UQMPFDBCTM5JQFCWSOBTU52VHS5EII" },
  { appId: 3473560676, wallet: "FKULJE4P33XUZOPK56JUZPKGBDCFXP5NVNWDAYAQQVQYHU7RIHQWB6H4JA" },
  { appId: 3473560676, wallet: "JOSSUIJF66PV4726EMH267H7DJPIYDNAFFQCGCXG5KUPJUL3J2FDC2S47E" },
  { appId: 3473560676, wallet: "K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ" },
  { appId: 3473560676, wallet: "MVDHJTPITMSIANV722FSLZRISEWHPN72QNONXJTNXGE3DEAEGXMDGCJJ44" },
  { appId: 3473560676, wallet: "TU3ZQOJVHDUQ3CPH3B3MF5M7L6RJMCAHP73UD7DVR4YOKRK2YF23B7QMZU" },
  { appId: 3473560676, wallet: "UV5CWWZCR2WOFJSOCDAECUUEGOJOOWLCX2QMDEVTY7W4PYQFUWBKQGTLOY" },
  { appId: 3473560676, wallet: "VNRQZAX4M4AUIZAXZNVNQ74X7XPPCX3WIUYG5QE2EIGC6VQD55537KRQ7A" },
  { appId: 3473560676, wallet: "3KSLWW7KIUGIWOVGPIIPIXZUUGTFQ63XST6BIRYDTIIH6B7OOPHDEH764Q" },
  { appId: 3473560676, wallet: "42TRM7VUYIJTAQGEAOKEDAI66CHJDEZ5EJA3AKIWIHY5FTPGB55XVAEUYM" },

  // Pool 3473562061 (Fry VPN → Fry VPN) — 1
  { appId: 3473562061, wallet: "K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ" },

  // Pool 3473563847 (Fry → Fry) — 1 active of 2 (FMVQ... has staked=0, skipped)
  { appId: 3473563847, wallet: "K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ" },

  // Pool 3473565258 (Fry Node → Fry Node) — 0 active (FMVQ... has staked=0, skipped)

  // Pool 3473573376 (Fry → Fry) — 1
  { appId: 3473573376, wallet: "FMVQGM4DCVL2DHXET2RT5AAUPY2TZZV7RCF3V4BEBWGYIAYBU4CEP67G24" },

  // Pool 3473574550 (Fry Node → Fry Node) — 2
  { appId: 3473574550, wallet: "FMVQGM4DCVL2DHXET2RT5AAUPY2TZZV7RCF3V4BEBWGYIAYBU4CEP67G24" },
  { appId: 3473574550, wallet: "TXDBUB2E7WAZ5CW4HDT5QEWSHVTGRC3YYBRDYEPVCD6BDRHRG62RCTNEFM" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Decode Algorand address to 32-byte public key, then base64 encode for box query */
function addressToBoxB64(address) {
  // Algorand address = base32(pubkey[32] + checksum[4])
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

/** Read box data for a wallet from Algorand indexer */
async function readBox(appId, wallet) {
  const boxName = addressToBoxB64(wallet);
  const url = `${INDEXER_BASE}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(boxName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null; // box doesn't exist
    throw new Error(`Indexer ${res.status} for appId ${appId} box ${wallet}`);
  }
  const json = await res.json();
  const raw = Buffer.from(json.value, "base64");
  if (raw.length < 16) throw new Error(`Box too short (${raw.length} bytes) for ${wallet} in ${appId}`);

  const staked = raw.readBigUInt64BE(0);
  const stakeTime = raw.readBigUInt64BE(8);
  return { staked: Number(staked), stakeTime: Number(stakeTime) };
}

/** Small delay to avoid hammering the indexer */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Missing Staking Positions Recovery`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "EXECUTE (writing to DB)"}`);
  console.log(`  Positions to recover: ${MISSING_POSITIONS.length}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("FATAL: MONGODB_URI not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB\n");

  // 2. Build pool metadata cache: appId → { poolId, apr, lockPeriod, ... }
  const poolCache = {};
  const uniqueAppIds = [...new Set(MISSING_POSITIONS.map((p) => p.appId))];

  console.log("--- Loading pool metadata from MongoDB ---");
  for (const appId of uniqueAppIds) {
    const pool = await Staking.findOne({ stakingContractId: String(appId) }).lean();
    if (!pool) {
      console.error(`  FATAL: No Staking record for appId ${appId}`);
      process.exit(1);
    }
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

  // 3. For each missing position, read on-chain box and prepare insert
  console.log("\n--- Reading on-chain box data & preparing inserts ---");
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const pos of MISSING_POSITIONS) {
    const { appId, wallet } = pos;
    const pool = poolCache[appId];

    try {
      // Check if record already exists (safety check)
      const existing = await StakingToken.findOne({ wallet, appId }).lean();
      if (existing) {
        console.log(`  [skip] ${wallet.slice(0, 8)}... in ${appId} — already exists (id: ${existing._id})`);
        skipped++;
        continue;
      }

      // Read on-chain box
      const box = await readBox(appId, wallet);
      if (!box) {
        console.log(`  [skip] ${wallet.slice(0, 8)}... in ${appId} — no box found on-chain`);
        skipped++;
        continue;
      }
      if (box.staked === 0) {
        console.log(`  [skip] ${wallet.slice(0, 8)}... in ${appId} — staked=0 on-chain`);
        skipped++;
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

      console.log(`  [insert] ${wallet.slice(0, 8)}... in ${appId} — staked: ${box.staked.toLocaleString()}, stakeTime: ${new Date(box.stakeTime * 1000).toISOString()}`);

      if (!DRY_RUN) {
        await StakingToken.create(record);
      }
      inserted++;

      // Small delay between indexer calls
      await sleep(100);
    } catch (err) {
      console.error(`  [ERR] ${wallet.slice(0, 8)}... in ${appId}: ${err.message}`);
      errors++;
    }
  }

  // 4. Handle duplicate in pool 3465579498
  console.log("\n--- Cleaning up duplicate records ---");
  const dupeWallet = "S7OSRZCJ4KOCCURYEYB7KUHLQF5DU6REJK64MTQR3FYPBUONZ6O7YFW3EE";
  const dupeAppId = 3465579498;
  const dupes = await StakingToken.find({ wallet: dupeWallet, appId: dupeAppId }).sort({ createdAt: 1 }).lean();

  if (dupes.length > 1) {
    // Keep the first record, sum all totalStaked into it, delete the rest
    const totalStaked = dupes.reduce((sum, d) => sum + (d.totalStaked || 0), 0);
    const keepId = dupes[0]._id;
    const deleteIds = dupes.slice(1).map((d) => d._id);

    console.log(`  Found ${dupes.length} duplicates for ${dupeWallet.slice(0, 8)}... in ${dupeAppId}`);
    console.log(`  Keeping _id ${keepId} with combined totalStaked: ${totalStaked.toLocaleString()}`);
    console.log(`  Deleting ${deleteIds.length} duplicate(s): ${deleteIds.join(", ")}`);

    if (!DRY_RUN) {
      await StakingToken.findByIdAndUpdate(keepId, { $set: { totalStaked } });
      await StakingToken.deleteMany({ _id: { $in: deleteIds } });
    }
  } else {
    console.log(`  No duplicates found (already clean)`);
  }

  // 5. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY (${DRY_RUN ? "DRY RUN" : "EXECUTED"})`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Dupes cleaned: ${dupes.length > 1 ? dupes.length - 1 : 0}`);
  console.log(`${"=".repeat(60)}\n`);

  if (DRY_RUN) {
    console.log("  Run with --execute to apply changes.\n");
  }

  // 6. Verification (only in execute mode)
  if (!DRY_RUN && inserted > 0) {
    console.log("--- Verification ---");
    for (const appId of uniqueAppIds) {
      const count = await StakingToken.countDocuments({ appId });
      console.log(`  appId ${appId}: ${count} records in DB`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
