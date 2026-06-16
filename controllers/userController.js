const logger = require("../config/logger");
const User = require("../models/userSchema");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const { fromBuffer: fileTypeFromBuffer } = require("file-type");

// Ensure uploads directory exists
fs.mkdirSync(path.join(__dirname, "../uploads/avatars"), { recursive: true });

// Create or Update User based on walletId, saving images to local disk
const createOrUpdateUser = async (req, res) => {
  const { walletId, name, bio } = req.body;

  if (!walletId) {
    return res.status(400).json({ success: false, message: "walletId is required." });
  }

  try {
    let profilePictureUrl;
    let bannerUrl;

    const files = req.files || {};
    const profileFile = Array.isArray(files.profilePicture) ? files.profilePicture[0] : undefined;
    const bannerFile = Array.isArray(files.banner) ? files.banner[0] : undefined;

    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (profileFile) {
      const detected = await fileTypeFromBuffer(profileFile.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
        return res.status(400).json({ success: false, message: "Invalid image file type for profile picture." });
      }
      const filename = `${walletId}_profile_${Date.now()}.${detected.ext}`;
      fs.writeFileSync(path.join(__dirname, "../uploads/avatars", filename), profileFile.buffer);
      profilePictureUrl = `/uploads/avatars/${filename}`;
    }

    if (bannerFile) {
      const detected = await fileTypeFromBuffer(bannerFile.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
        return res.status(400).json({ success: false, message: "Invalid image file type for banner." });
      }
      const filename = `${walletId}_banner_${Date.now()}.${detected.ext}`;
      fs.writeFileSync(path.join(__dirname, "../uploads/avatars", filename), bannerFile.buffer);
      bannerUrl = `/uploads/avatars/${filename}`;
    }

    // Decide create vs update
    const existing = await User.findOne({ walletId });

    // Build update doc only with provided fields
    const updateDoc = {};
    if (typeof name === "string" && name.trim()) updateDoc.name = name.trim();
    if (typeof bio !== "undefined") updateDoc.bio = bio;
    if (profilePictureUrl) updateDoc.profilePicture = profilePictureUrl;
    if (bannerUrl) updateDoc.banner = bannerUrl;

    if (existing) {
      const updated = await User.findOneAndUpdate(
        { walletId },
        { $set: updateDoc },
        { new: true, runValidators: true }
      );
      return res.status(200).json({
        success: true,
        message: "User updated successfully.",
        data: updated,
      });
    } else {
      if (!updateDoc.name) {
        return res.status(400).json({
          success: false,
          message: "name is required when creating a new user.",
        });
      }
      const chainId = req.headers['x-chain-id'] || 'algorand-mainnet';
      const created = await User.create({
        walletId,
        chainId,
        name: updateDoc.name,
        bio: typeof updateDoc.bio !== "undefined" ? updateDoc.bio : undefined,
        profilePicture: updateDoc.profilePicture,
        banner: updateDoc.banner,
      });
      return res.status(201).json({
        success: true,
        message: "User created successfully.",
        data: created,
      });
    }
  } catch (error) {
    logger.error("Error creating or updating user:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while creating or updating the user.",
      error: error.message,
    });
  }
};

// Get User by walletId
const getUserByWalletId = async (req, res) => {
  const { walletId } = req.params;

  if (!walletId) {
    return res.status(400).json({ success: false, message: "walletId is required." });
  }

  try {
    const user = await User.findOne({ walletId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: `No user found with walletId: ${walletId}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully.",
      data: user,
    });
  } catch (error) {
    logger.error("Error fetching user:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the user.",
      error: error.message,
    });
  }
};

module.exports = {
  createOrUpdateUser,
  getUserByWalletId,
};