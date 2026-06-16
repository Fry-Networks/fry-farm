#!/usr/bin/env node
/**
 * Seed admin wallet and alertWebhookUrl into RewardsConfig.
 *
 * Usage:  node scripts/seedRewardsAdmin.js
 * (run inside Docker container so MONGODB_URI and DISCORD_BUG_WEBHOOK_URL are available)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const RewardsConfig = require('../models/rewardsConfigSchema');

const ADMIN_WALLET = 'E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const config = await RewardsConfig.getConfig();

  // Add admin wallet if not already present
  if (!config.adminWallets.includes(ADMIN_WALLET)) {
    config.adminWallets.push(ADMIN_WALLET);
    console.log('Added admin wallet:', ADMIN_WALLET);
  } else {
    console.log('Admin wallet already present');
  }

  // Set alertWebhookUrl from env if not already configured
  const webhookUrl = process.env.DISCORD_BUG_WEBHOOK_URL;
  if (webhookUrl && !config.alertWebhookUrl) {
    config.alertWebhookUrl = webhookUrl;
    console.log('Set alertWebhookUrl from env');
  } else if (config.alertWebhookUrl) {
    console.log('alertWebhookUrl already set');
  }

  await config.save();
  console.log('RewardsConfig saved');

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
