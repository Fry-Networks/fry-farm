/**
 * Shadow model: compare current streak-based emissions vs proposed capped-hybrid.
 * Read-only — does not modify any data.
 *
 * Usage: cd /opt/fry-farm/backend && node scripts/shadow-model-checkin.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DAYS = 90;
const BUDGET = 5000;
const MAX_PER_USER = 25;
const LIQUID_BPS = 2000;

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const claims = db.collection('dailyclaims');

  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const pipeline = [
    { $match: { claimDate: { $gte: cutoff } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$claimDate' } },
      currentTotal: { $sum: '$actualReward' },
      claimCount: { $sum: 1 },
      wallets: { $addToSet: '$walletAddress' },
    }},
    { $sort: { _id: 1 } },
  ];

  const days = await claims.aggregate(pipeline).toArray();

  console.log('Date       | Wallets | Current  | Proposed | Liquid | Vault  | Delta');
  console.log('-'.repeat(80));

  let totalCurrent = 0, totalProposed = 0, totalLiquid = 0, totalVault = 0;

  for (const d of days) {
    const walletCount = d.wallets.length;
    const gross = Math.min(walletCount * MAX_PER_USER, BUDGET);
    const liquid = Math.floor(gross * LIQUID_BPS / 10000);
    const vault = gross - liquid;
    const delta = d.currentTotal - gross;

    totalCurrent += d.currentTotal;
    totalProposed += gross;
    totalLiquid += liquid;
    totalVault += vault;

    console.log(
      `${d._id} | ${String(walletCount).padStart(7)} | ${String(d.currentTotal).padStart(8)} | ` +
      `${String(gross).padStart(8)} | ${String(liquid).padStart(6)} | ${String(vault).padStart(6)} | ` +
      `${delta >= 0 ? '+' : ''}${delta}`
    );
  }

  console.log('-'.repeat(80));
  console.log(`TOTALS (${days.length}d) | Current: ${totalCurrent} | Proposed: ${totalProposed} | ` +
    `Liquid: ${totalLiquid} | Vault: ${totalVault}`);
  console.log(`Reduction: ${((1 - totalProposed / totalCurrent) * 100).toFixed(1)}% gross, ` +
    `${((1 - totalLiquid / totalCurrent) * 100).toFixed(1)}% liquid (immediate sell pressure)`);
  console.log(`Daily avg current: ${(totalCurrent / days.length).toFixed(0)} | ` +
    `Daily avg proposed: ${(totalProposed / days.length).toFixed(0)}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
