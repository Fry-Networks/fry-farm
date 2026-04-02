#!/usr/bin/env node
/**
 * V1 Migrated User Airdrop — sends fair-share rewards to users who
 * unstaked from V1 but received 0 rewards due to the truncation bug.
 *
 * Reads the epoch-based fair reward audit and airdrops the delta amount
 * to each migrated user with a positive delta.
 *
 * DRY RUN by default. Add --execute to actually send transactions.
 *
 * Usage:
 *   REWARD_MNEMONIC=$(docker exec fry-farm-backend printenv REWARD_MNEMONIC) \
 *   REWARD_REKEY=$(docker exec fry-farm-backend printenv REWARD_REKEY) \
 *   NODE_PATH=./backend/node_modules \
 *   node scripts/v1MigratedAirdrop.js [--execute]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const algosdk = require('algosdk');
const readline = require('readline');

// ── Constants ────────────────────────────────────────────────────────────────

const FRY_ASA_ID = 2485314946;
const ALGOD_SERVER = 'https://mainnet-api.4160.nodely.dev';
const AUDIT_PATH = path.join(__dirname, 'v1_reward_audit_final.json');
const LOG_PATH = path.join(__dirname, 'v1_migrated_airdrop_log.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const execute = process.argv.includes('--execute');

  console.log('============================================================');
  console.log('  V1 Migrated User Airdrop');
  console.log(`  Mode: ${execute ? 'EXECUTE (real transactions!)' : 'DRY RUN'}`);
  console.log('============================================================\n');

  // 1. Load audit data
  if (!fs.existsSync(AUDIT_PATH)) {
    console.error(`FATAL: Audit file not found: ${AUDIT_PATH}`);
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));

  // Build pool → rewardTokenId map from audit
  const poolTokenMap = {};
  for (const p of audit.pools) {
    poolTokenMap[p.appId] = p.rewardTokenId;
  }

  // 2. Filter to migrated users with positive delta
  const recipients = audit.users
    .filter(u => u.status === 'migrated' && u.delta > 0)
    .map(u => ({ ...u, rewardTokenId: poolTokenMap[u.poolAppId] || FRY_ASA_ID }));
  const totalMicro = recipients.reduce((sum, u) => sum + u.delta, 0);

  console.log(`  Audit generated: ${audit.generatedAt}`);
  console.log(`  Total users in audit: ${audit.users.length}`);
  console.log(`  Migrated users with delta > 0: ${recipients.length}`);
  console.log(`  Total to airdrop: ${(totalMicro / 1e6).toFixed(6)} FRY (${totalMicro} micro)\n`);

  // 3. Validate recipients
  for (const r of recipients) {
    if (!r.wallet || r.wallet.length !== 58) {
      console.error(`FATAL: Invalid wallet address: ${r.wallet}`);
      process.exit(1);
    }
    if (r.status !== 'migrated') {
      console.error(`FATAL: Non-migrated user in list: ${r.wallet} (status: ${r.status})`);
      process.exit(1);
    }
    if (r.delta <= 0) {
      console.error(`FATAL: Non-positive delta for ${r.wallet}: ${r.delta}`);
      process.exit(1);
    }
  }

  // Safety checks
  if (recipients.length > 30) {
    console.error(`FATAL: Too many recipients (${recipients.length}). Expected <= 25. Verify audit data.`);
    process.exit(1);
  }
  if (totalMicro > 100_000_000_000) { // 100,000 FRY
    console.error(`FATAL: Total exceeds 100,000 FRY (${(totalMicro / 1e6).toFixed(2)}). Verify audit data.`);
    process.exit(1);
  }

  // 4. Display all recipients
  console.log('  Recipients:');
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const tokenLabel = r.rewardTokenId === FRY_ASA_ID ? 'FRY' : `ASA:${r.rewardTokenId}`;
    console.log(`    [${i + 1}] ${r.wallet.slice(0, 12)}...${r.wallet.slice(-6)}  ${(r.delta / 1e6).toFixed(6)} ${tokenLabel}  pool:${r.poolAppId} (${r.poolName})`);
  }

  // 5. Validate env vars
  const rewardMnemonic = process.env.REWARD_MNEMONIC;
  const rewardRekey = process.env.REWARD_REKEY;

  if (!rewardMnemonic) {
    console.error('\nFATAL: REWARD_MNEMONIC not set');
    process.exit(1);
  }
  if (!rewardRekey) {
    console.error('\nFATAL: REWARD_REKEY not set');
    process.exit(1);
  }

  let treasuryAddr, signingKey;
  try {
    const ogAccount = algosdk.mnemonicToSecretKey(rewardMnemonic);
    const rekeyAccount = algosdk.mnemonicToSecretKey(rewardRekey);
    treasuryAddr = ogAccount.addr.toString();
    signingKey = rekeyAccount.sk;
  } catch (e) {
    console.error(`FATAL: Invalid mnemonic: ${e.message}`);
    process.exit(1);
  }
  console.log(`\n  Treasury address: ${treasuryAddr}`);

  // 6. Dry run — stop here
  if (!execute) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('  DRY RUN — no transactions sent.');
    console.log('  Add --execute to send airdrops.');
    console.log(`${'='.repeat(60)}`);
    return;
  }

  // 7. Balance check
  const algodClient = new algosdk.Algodv2('', ALGOD_SERVER, '');

  let availableBalance;
  try {
    const acctInfo = await algodClient.accountAssetInformation(treasuryAddr, FRY_ASA_ID).do();
    availableBalance = acctInfo.assetHolding ? Number(acctInfo.assetHolding.amount) : 0;
  } catch (e) {
    console.error(`FATAL: Could not query treasury balance: ${e.message}`);
    process.exit(1);
  }

  console.log(`\n  Treasury FRY balance: ${(availableBalance / 1e6).toFixed(6)} FRY`);
  console.log(`  Required:            ${(totalMicro / 1e6).toFixed(6)} FRY`);

  if (availableBalance < totalMicro) {
    console.error(`\nFATAL: Insufficient FRY balance. Need ${totalMicro}, have ${availableBalance}.`);
    process.exit(1);
  }

  // 8. Double confirmation (skip with --yes for non-interactive use after dry-run review)
  const skipConfirm = process.argv.includes('--yes');
  if (!skipConfirm) {
    console.log('');
    const answer1 = await askQuestion(
      `Send ${(totalMicro / 1e6).toFixed(6)} FRY to ${recipients.length} wallet(s)? Type "yes" to continue: `
    );
    if (answer1.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      return;
    }

    const answer2 = await askQuestion('Type "CONFIRM AIRDROP" to execute: ');
    if (answer2 !== 'CONFIRM AIRDROP') {
      console.log('Aborted.');
      return;
    }
  } else {
    console.log('\n  --yes flag: skipping interactive confirmation (dry run already reviewed)');
  }

  // 9. Load or create log
  let airdropLog = { startedAt: new Date().toISOString(), sent: {}, totalSent: 0, totalFailed: 0 };
  if (fs.existsSync(LOG_PATH)) {
    airdropLog = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  }

  // 10. Execute transfers
  console.log('\n--- Sending airdrops ---');
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const key = `${r.wallet}|${r.poolAppId}`;
    const label = `[${i + 1}/${recipients.length}] ${r.wallet.slice(0, 8)}...`;

    // Idempotency
    if (airdropLog.sent[key]) {
      console.log(`  ${label} [skip] already sent (${airdropLog.sent[key].txId})`);
      skipped++;
      continue;
    }

    try {
      const params = await algodClient.getTransactionParams().do();
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: treasuryAddr,
        receiver: r.wallet,
        amount: r.delta,
        assetIndex: r.rewardTokenId,
        suggestedParams: params,
        note: new TextEncoder().encode(`V1 legacy reward airdrop - pool ${r.poolAppId}`),
      });
      const signedTxn = txn.signTxn(signingKey);
      const { txid } = await algodClient.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(algodClient, txid, 4);

      airdropLog.sent[key] = {
        txId: txid,
        wallet: r.wallet,
        amount: r.delta,
        amountFry: Math.round(r.delta / 1e6 * 1e6) / 1e6,
        poolAppId: r.poolAppId,
        poolName: r.poolName,
        at: new Date().toISOString(),
      };
      fs.writeFileSync(LOG_PATH, JSON.stringify(airdropLog, null, 2));

      successful++;
      console.log(`  ${label} [sent] ${(r.delta / 1e6).toFixed(6)} FRY — txId: ${txid}`);

      if (i < recipients.length - 1) await sleep(500);
    } catch (err) {
      failed++;
      const reason = err.message?.includes('asset') ? '(receiver may not be opted into FRY)' : '';
      console.error(`  ${label} [FAIL] ${err.message} ${reason}`);

      // Log failures too
      airdropLog.sent[key] = {
        wallet: r.wallet,
        amount: r.delta,
        poolAppId: r.poolAppId,
        status: 'failed',
        error: err.message,
        at: new Date().toISOString(),
      };
      fs.writeFileSync(LOG_PATH, JSON.stringify(airdropLog, null, 2));
    }
  }

  // 11. Update log totals
  airdropLog.totalSent = successful;
  airdropLog.totalFailed = failed;
  airdropLog.totalSkipped = skipped;
  airdropLog.completedAt = new Date().toISOString();
  airdropLog.totalFryMicro = recipients.reduce((sum, r) => {
    const k = `${r.wallet}|${r.poolAppId}`;
    return sum + (airdropLog.sent[k]?.status !== 'failed' ? r.delta : 0);
  }, 0);
  fs.writeFileSync(LOG_PATH, JSON.stringify(airdropLog, null, 2));

  // 12. Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  AIRDROP SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed:     ${failed}`);
  console.log(`  Skipped:    ${skipped}`);
  console.log(`  Log:        ${LOG_PATH}`);
  console.log(`${'='.repeat(60)}`);

  if (failed > 0) {
    console.log('\n  Failed transfers (may need ASA opt-in):');
    for (const r of recipients) {
      const k = `${r.wallet}|${r.poolAppId}`;
      if (airdropLog.sent[k]?.status === 'failed') {
        console.log(`    ${r.wallet} — ${(r.delta / 1e6).toFixed(6)} FRY — ${airdropLog.sent[k].error}`);
      }
    }
    console.log('\n  Re-run with --execute to retry failed transfers.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
