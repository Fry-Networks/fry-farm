const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const { fromBuffer: fileTypeFromBuffer } = require('file-type');
const logger = require('../config/logger');
const BugReport = require('../models/bugReportSchema');
const User = require('../models/userSchema');
const { sendBugReport } = require('../services/discordBugReportNotifier');

const UPLOAD_DIR = path.join(__dirname, '../uploads/bug-reports');
const CHUNKS_DIR = path.join(UPLOAD_DIR, 'chunks');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_LOG_EXTS = ['.txt', '.log'];
const ALLOWED_HAR_EXTS = ['.har', '.json'];
const ALLOWED_FIELDS = ['harFile', 'consoleLog', 'screenshot'];

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;  // 5MB
const MAX_LOG_SIZE = 2 * 1024 * 1024;         // 2MB
const MAX_HAR_SIZE = 1 * 1024 * 1024 * 1024;  // 1GB

const UPLOAD_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

const bugReportSchema = Joi.object({
  chain: Joi.string().valid('algorand', 'voi').required(),
  walletAddress: Joi.string().required(),
  title: Joi.string().max(100).required(),
  description: Joi.string().max(2000).required(),
  category: Joi.string().valid('ui', 'staking', 'farming', 'nft-staking', 'swap', 'prediction', 'device-staking', 'other').required(),
  harFilePreUploaded: Joi.string().max(255).optional(),
  consoleLogPreUploaded: Joi.string().max(255).optional(),
  screenshotPreUploaded: Joi.string().max(255).optional(),
});

/** Remove all uploaded files from this request (cleanup on validation failure or error) */
function cleanupRequestFiles(files) {
  if (!files) return;
  for (const fieldFiles of Object.values(files)) {
    for (const file of fieldFiles) {
      try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
    }
  }
}

/** Recursively remove a directory */
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

// ── Chunk upload handler ──

const uploadChunk = async (req, res) => {
  const { uploadId, chunkIndex, totalChunks, fieldName } = req.body;

  if (!uploadId || !UPLOAD_ID_RE.test(uploadId)) {
    return res.status(400).json({ success: false, message: 'Invalid uploadId' });
  }
  if (!ALLOWED_FIELDS.includes(fieldName)) {
    return res.status(400).json({ success: false, message: 'Invalid fieldName' });
  }
  const idx = parseInt(chunkIndex, 10);
  const total = parseInt(totalChunks, 10);
  if (isNaN(idx) || idx < 0 || idx > 999 || isNaN(total) || total < 1 || total > 1000) {
    return res.status(400).json({ success: false, message: 'Invalid chunk index or total' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No chunk data received' });
  }

  const chunkDir = path.join(CHUNKS_DIR, uploadId, fieldName);
  fs.mkdirSync(chunkDir, { recursive: true });

  const chunkPath = path.join(chunkDir, `${idx}.part`);
  fs.writeFileSync(chunkPath, req.file.buffer);

  return res.json({ success: true, received: idx, total });
};

// ── Finalize chunked upload ──

const EXT_MAP = { harFile: '.har', consoleLog: '.log', screenshot: '.bin' };

const finalizeChunkedUpload = async (req, res) => {
  const { uploadId, fieldName, originalName } = req.body;

  if (!uploadId || !UPLOAD_ID_RE.test(uploadId)) {
    return res.status(400).json({ success: false, message: 'Invalid uploadId' });
  }
  if (!ALLOWED_FIELDS.includes(fieldName)) {
    return res.status(400).json({ success: false, message: 'Invalid fieldName' });
  }

  const chunkDir = path.join(CHUNKS_DIR, uploadId, fieldName);
  if (!fs.existsSync(chunkDir)) {
    return res.status(400).json({ success: false, message: 'No chunks found for this upload' });
  }

  try {
    const parts = fs.readdirSync(chunkDir)
      .filter(f => f.endsWith('.part'))
      .sort((a, b) => parseInt(a) - parseInt(b));

    if (parts.length === 0) {
      return res.status(400).json({ success: false, message: 'No chunk parts found' });
    }

    // Determine extension from original filename or fallback
    const ext = originalName
      ? path.extname(originalName).toLowerCase() || EXT_MAP[fieldName]
      : EXT_MAP[fieldName];

    const finalFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, finalFilename);

    // Assemble chunks
    const writeStream = fs.createWriteStream(finalPath);
    for (const part of parts) {
      const partData = fs.readFileSync(path.join(chunkDir, part));
      writeStream.write(partData);
    }
    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Clean up chunk directory
    rmDirSync(chunkDir);
    // If the uploadId dir is now empty, remove it too
    const uploadIdDir = path.join(CHUNKS_DIR, uploadId);
    try {
      const remaining = fs.readdirSync(uploadIdDir);
      if (remaining.length === 0) fs.rmdirSync(uploadIdDir);
    } catch (_) { /* ignore */ }

    return res.json({ success: true, filename: finalFilename });
  } catch (err) {
    logger.error('Finalize chunked upload error:', err);
    return res.status(500).json({ success: false, message: 'Failed to assemble file' });
  }
};

// ── Create bug report (supports both direct upload and pre-uploaded files) ──

const createBugReport = async (req, res) => {
  const { error, value } = bugReportSchema.validate(req.body);
  if (error) {
    cleanupRequestFiles(req.files);
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  const wallet = req.user.wallet;
  const files = req.files || {};

  // Check for pre-uploaded (chunked) files
  const preUploaded = {};
  for (const field of ALLOWED_FIELDS) {
    const preKey = `${field}PreUploaded`;
    if (req.body[preKey]) {
      const filename = req.body[preKey];
      // Security: filename must not contain path separators
      if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        cleanupRequestFiles(req.files);
        return res.status(400).json({ success: false, message: `Invalid pre-uploaded filename for ${field}` });
      }
      const fullPath = path.join(UPLOAD_DIR, filename);
      if (!fs.existsSync(fullPath)) {
        cleanupRequestFiles(req.files);
        return res.status(400).json({ success: false, message: `Pre-uploaded file not found: ${field}` });
      }
      preUploaded[field] = { filename, path: fullPath, size: fs.statSync(fullPath).size };
    }
  }

  const screenshotFile = files.screenshot?.[0];
  const logFile = files.consoleLog?.[0];
  const harFile = files.harFile?.[0];

  // Use pre-uploaded or direct file for each field
  const screenshotInfo = preUploaded.screenshot || screenshotFile;
  const logInfo = preUploaded.consoleLog || logFile;
  const harInfo = preUploaded.harFile || harFile;

  // ── Validate files ──

  if (screenshotInfo && !preUploaded.screenshot) {
    if (screenshotFile.size > MAX_SCREENSHOT_SIZE) {
      cleanupRequestFiles(req.files);
      return res.status(400).json({ success: false, message: 'Screenshot must be under 5MB' });
    }
    const header = Buffer.alloc(4100);
    const fd = fs.openSync(screenshotFile.path, 'r');
    fs.readSync(fd, header, 0, 4100, 0);
    fs.closeSync(fd);
    const detected = await fileTypeFromBuffer(header);
    if (!detected || !ALLOWED_IMAGE_TYPES.includes(detected.mime)) {
      cleanupRequestFiles(req.files);
      return res.status(400).json({ success: false, message: 'Screenshot must be JPEG, PNG, or WebP' });
    }
  }

  if (logInfo && !preUploaded.consoleLog) {
    if (logFile.size > MAX_LOG_SIZE) {
      cleanupRequestFiles(req.files);
      return res.status(400).json({ success: false, message: 'Console log must be under 2MB' });
    }
    const ext = path.extname(logFile.originalname).toLowerCase();
    if (!ALLOWED_LOG_EXTS.includes(ext)) {
      cleanupRequestFiles(req.files);
      return res.status(400).json({ success: false, message: 'Console log must be .txt or .log' });
    }
  }

  if (harInfo && !preUploaded.harFile) {
    if (harFile.size > MAX_HAR_SIZE) {
      cleanupRequestFiles(req.files);
      return res.status(400).json({ success: false, message: 'HAR file must be under 1GB' });
    }
    const ext = path.extname(harFile.originalname).toLowerCase();
    if (!ALLOWED_HAR_EXTS.includes(ext)) {
      cleanupRequestFiles(req.files);
      return res.status(400).json({ success: false, message: 'HAR file must be .har or .json' });
    }
  }

  // Validate pre-uploaded file sizes
  if (preUploaded.harFile && preUploaded.harFile.size > MAX_HAR_SIZE) {
    cleanupRequestFiles(req.files);
    return res.status(400).json({ success: false, message: 'HAR file must be under 1GB' });
  }

  // ── All validations passed ──

  try {
    let discordUsername;
    try {
      const user = await User.findOne({ walletId: wallet });
      if (user?.discordUsername) discordUsername = user.discordUsername;
    } catch (_) { /* non-critical */ }

    const getFilePath = (field, directFile, pre) => {
      if (pre) return `/uploads/bug-reports/${pre.filename}`;
      if (directFile) return `/uploads/bug-reports/${directFile.filename}`;
      return undefined;
    };

    const report = await BugReport.create({
      walletId: wallet,
      walletAddress: value.walletAddress,
      chain: value.chain,
      discordUsername,
      title: value.title,
      description: value.description,
      category: value.category,
      screenshot: getFilePath('screenshot', screenshotFile, preUploaded.screenshot),
      consoleLog: getFilePath('consoleLog', logFile, preUploaded.consoleLog),
      harFile: getFilePath('harFile', harFile, preUploaded.harFile),
    });

    sendBugReport(report).catch((err) => {
      logger.error('Bug report webhook failed:', err.message);
    });

    return res.status(201).json({ success: true, id: report._id });
  } catch (err) {
    cleanupRequestFiles(req.files);
    logger.error('Error creating bug report:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit bug report' });
  }
};

const listBugReports = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      BugReport.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BugReport.countDocuments(),
    ]);

    return res.json({ success: true, data: reports, total, page, limit });
  } catch (err) {
    logger.error('Error listing bug reports:', err);
    return res.status(500).json({ success: false, message: 'Failed to list bug reports' });
  }
};

module.exports = { createBugReport, listBugReports, uploadChunk, finalizeChunkedUpload };
