const express = require('express');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createBugReport, listBugReports, uploadChunk, finalizeChunkedUpload } = require('../controllers/bugReportController');

const router = express.Router();

// Full-file upload (diskStorage for large files already on disk)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, '/app/uploads/bug-reports/');
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 1 * 1024 * 1024 * 1024 }, // 1GB
});

// Chunk upload (memoryStorage — chunks are <=4MB, safe in RAM)
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const bugReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many bug reports. Please try again later.' },
});

const chunkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500, // ~1GB file = ~250 chunks at 4MB
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many chunk uploads. Please try again later.' },
});

// Chunked upload endpoints
router.post('/chunk', requireAuth, chunkLimiter, chunkUpload.single('chunk'), uploadChunk);
router.post('/finalize', requireAuth, bugReportLimiter, express.json(), finalizeChunkedUpload);

// Full-file upload (existing flow for small files)
router.post(
  '/',
  requireAuth,
  bugReportLimiter,
  upload.fields([
    { name: 'screenshot', maxCount: 1 },
    { name: 'consoleLog', maxCount: 1 },
    { name: 'harFile', maxCount: 1 },
  ]),
  createBugReport,
);

router.get('/', requireAuth, requireAdmin, listBugReports);

module.exports = router;
