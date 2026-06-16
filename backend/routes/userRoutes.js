const express = require("express");
const multer = require("multer");
const { createOrUpdateUser, getUserByWalletId } = require("../controllers/userController");
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

router.post(
  "/create-or-update",
  requireAuth,
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  createOrUpdateUser
);

router.get("/:walletId", getUserByWalletId);

module.exports = router;