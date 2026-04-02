const logger = require('../config/logger');

const WEBHOOK_URL = process.env.DISCORD_BUG_WEBHOOK_URL;

const WARNING_COLORS = {
  '48hr': 0xFFFF00,   // yellow
  '24hr': 0xFF8C00,   // orange
  '6hr':  0xFF0000,   // red
};

/**
 * Send a resolution warning embed to Discord.
 */
async function sendResolutionWarning(position, pool, hoursRemaining, warningLevel) {
  if (!WEBHOOK_URL) return;

  const walletShort = position.wallet.slice(-8);
  const hrs = Math.max(0, hoursRemaining).toFixed(1);

  const embed = {
    embeds: [{
      title: `LP Resolution Warning: ${warningLevel}`,
      color: WARNING_COLORS[warningLevel] || 0xFFFF00,
      fields: [
        { name: 'Market', value: pool?.marketQuestion || `#${position.marketAppId}`, inline: false },
        { name: 'Market App ID', value: String(position.marketAppId), inline: true },
        { name: 'Wallet', value: `...${walletShort}`, inline: true },
        { name: 'Hours Remaining', value: hrs, inline: true },
        { name: 'USDC Deposited', value: `${(position.usdcDeposited / 1_000_000).toFixed(2)}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });
  } catch (err) {
    logger.error('Discord alpha arcade warning error:', err.message);
  }
}

/**
 * Send a position-resolved notification embed.
 */
async function sendPositionResolved(position, pool) {
  if (!WEBHOOK_URL) return;

  const walletShort = position.wallet.slice(-8);

  const embed = {
    embeds: [{
      title: 'LP Position Resolved',
      color: 0x3498DB, // blue
      fields: [
        { name: 'Market', value: pool?.marketQuestion || `#${position.marketAppId}`, inline: false },
        { name: 'Market App ID', value: String(position.marketAppId), inline: true },
        { name: 'Wallet', value: `...${walletShort}`, inline: true },
        { name: 'USDC Deposited', value: `${(position.usdcDeposited / 1_000_000).toFixed(2)}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });
  } catch (err) {
    logger.error('Discord alpha arcade resolved error:', err.message);
  }
}

/**
 * Send a cron run summary (only if actions were taken).
 */
async function sendCronSummary(stats) {
  if (!WEBHOOK_URL) return;
  if (stats.warnings === 0 && stats.resolved === 0) return;

  const embed = {
    embeds: [{
      title: 'Alpha Arcade Resolution Cron Summary',
      color: 0x9B59B6, // purple
      fields: [
        { name: 'Positions Checked', value: String(stats.checked), inline: true },
        { name: 'Warnings Sent', value: String(stats.warnings), inline: true },
        { name: 'Resolved', value: String(stats.resolved), inline: true },
        { name: 'Errors', value: String(stats.errors), inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });
  } catch (err) {
    logger.error('Discord alpha arcade summary error:', err.message);
  }
}

module.exports = { sendResolutionWarning, sendPositionResolved, sendCronSummary };
