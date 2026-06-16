const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

const UPLOAD_DIR = '/app/uploads/bug-reports';
const CHUNKS_DIR = path.join(UPLOAD_DIR, 'chunks');
const MAX_AGE_DAYS = 30;
const CHUNK_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function rmDirSync(dir) {
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) rmDirSync(full);
      else fs.unlinkSync(full);
    }
    fs.rmdirSync(dir);
  } catch (_) { /* ignore */ }
}

function cleanOldBugReports() {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
      if (file === 'chunks') continue; // skip chunks directory
      const filePath = path.join(UPLOAD_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (err) {
        errors++;
        logger.error(`Bug report cleanup: failed to delete ${file}:`, err.message);
      }
    }
    if (deleted > 0 || errors > 0) {
      logger.info(`Bug report cleanup: deleted ${deleted} files, ${errors} errors`);
    }
  } catch (err) {
    logger.error('Bug report cleanup: failed to read upload dir:', err.message);
  }
}

function cleanStaleChunks() {
  const cutoff = Date.now() - CHUNK_MAX_AGE_MS;
  let deleted = 0;

  try {
    if (!fs.existsSync(CHUNKS_DIR)) return;
    const uploadIds = fs.readdirSync(CHUNKS_DIR);
    for (const uploadId of uploadIds) {
      const uploadIdDir = path.join(CHUNKS_DIR, uploadId);
      try {
        const stat = fs.statSync(uploadIdDir);
        if (stat.isDirectory() && stat.mtimeMs < cutoff) {
          rmDirSync(uploadIdDir);
          deleted++;
        }
      } catch (_) { /* ignore */ }
    }
    if (deleted > 0) {
      logger.info(`Chunk cleanup: deleted ${deleted} stale upload sessions`);
    }
  } catch (err) {
    logger.error('Chunk cleanup error:', err.message);
  }
}

// Daily at 3am: clean old completed uploads
cron.schedule('0 3 * * *', cleanOldBugReports);
// Hourly: clean stale incomplete chunks
cron.schedule('0 * * * *', cleanStaleChunks);
logger.info('Bug report cleanup cron: registered (daily 3am + hourly chunk cleanup)');

module.exports = { cleanOldBugReports, cleanStaleChunks };
