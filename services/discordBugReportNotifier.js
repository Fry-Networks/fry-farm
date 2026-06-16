const logger = require('../config/logger');

const WEBHOOK_URL = process.env.DISCORD_BUG_REPORT_WEBHOOK_URL;

const CATEGORY_LABELS = {
  'ui': 'UI',
  'staking': 'Staking',
  'farming': 'Farming',
  'nft-staking': 'NFT Staking',
  'swap': 'Swap',
  'prediction': 'Prediction',
  'device-staking': 'Device Staking',
  'other': 'Other',
};

/**
 * Send a bug report embed to Discord.
 */
async function sendBugReport(report) {
  if (!WEBHOOK_URL) return;

  const fields = [
    { name: 'Chain', value: report.chain === 'algorand' ? 'Algorand' : 'Voi', inline: true },
    { name: 'Category', value: CATEGORY_LABELS[report.category] || report.category, inline: true },
    { name: 'Wallet Address', value: report.walletAddress, inline: false },
  ];

  if (report.discordUsername) {
    fields.push({ name: 'Discord', value: report.discordUsername, inline: true });
  }

  fields.push({ name: 'Description', value: report.description.slice(0, 1024), inline: false });

  // Attachment links
  const attachments = [];
  if (report.consoleLog) attachments.push(`[Console Log](https://fry.farm${report.consoleLog})`);
  if (report.harFile) attachments.push(`[HAR File](https://fry.farm${report.harFile})`);
  if (report.screenshot) attachments.push(`[Screenshot](https://fry.farm${report.screenshot})`);
  fields.push({ name: 'Attachments', value: attachments.length > 0 ? attachments.join(' | ') : 'None', inline: false });

  const embed = {
    embeds: [{
      title: `Bug Report: ${report.title.slice(0, 200)}`,
      color: 0xFF4444,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };

  // Add screenshot as embed image if present
  if (report.screenshot) {
    embed.embeds[0].image = { url: `https://fry.farm${report.screenshot}` };
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });
  } catch (err) {
    logger.error('Discord bug report webhook error:', err.message);
  }
}

module.exports = { sendBugReport };
