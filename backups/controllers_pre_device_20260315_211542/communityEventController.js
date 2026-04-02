const logger = require("../config/logger");
const Event = require("../models/eventSchema");
const Challenge = require("../models/challengeSchema");
const EventPoints = require("../models/eventPointsSchema");
const FeeConfig = require("../models/feeConfigSchema");
const { buildFundingTxns, buildRefundTxn } = require("../services/communityEventService");
const { getAlgodClient } = require("../services/algodService");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { fromBuffer: fileTypeFromBuffer } = require("file-type");

fs.mkdirSync(path.join(__dirname, "../uploads/banners"), { recursive: true });

const bannerUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("banner");

// ─── Public ───

const getCommunityEvents = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { eventType: 'community', isHidden: false };

    if (status === 'active') {
      filter.status = 'active';
    } else if (status === 'upcoming') {
      filter.status = { $in: ['draft', 'scheduled'] };
    } else if (status === 'ended') {
      filter.status = 'ended';
    } else {
      // Default: show scheduled and active
      filter.status = { $in: ['scheduled', 'active'] };
    }

    const events = await Event.find(filter).sort({ startDate: -1 }).lean();

    // Attach challenges
    const eventIds = events.map(e => e._id);
    const challenges = await Challenge.find({ eventId: { $in: eventIds } }).lean();
    const challengesByEvent = {};
    for (const c of challenges) {
      const eid = c.eventId.toString();
      if (!challengesByEvent[eid]) challengesByEvent[eid] = [];
      challengesByEvent[eid].push(c);
    }

    const data = events.map(e => ({
      ...e,
      challenges: challengesByEvent[e._id.toString()] || [],
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error("Error fetching community events:", error);
    res.status(500).json({ success: false, message: "Error fetching community events" });
  }
};

// ─── Authenticated ───

const createCommunityEvent = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const {
      name, description, startDate, endDate,
      rewardAsaId, rewardAmount,
      airdropDistribution, airdropTiers, minPointsToQualify,
      bannerImage, challenges,
    } = req.body;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      return res.status(400).json({ success: false, message: "startDate must be before endDate" });
    }

    // Validate reward ASA exists on-chain
    const algodClient = getAlgodClient();
    let asaInfo;
    try {
      asaInfo = await algodClient.getAssetByID(rewardAsaId).do();
    } catch (err) {
      return res.status(400).json({ success: false, message: `ASA ${rewardAsaId} not found on Algorand` });
    }

    const asaName = asaInfo.params?.name || `ASA #${rewardAsaId}`;
    const asaDecimals = asaInfo.params?.decimals ?? 0;

    // Calculate fee for informational purposes
    const feeConfig = await FeeConfig.getFeeConfig();
    const feePercent = feeConfig.communityEventFeePercent || 2.0;
    const feeAmount = Math.floor(rewardAmount * feePercent * 100 / 10000);
    const netRewardPool = rewardAmount - feeAmount;

    if (netRewardPool <= 0) {
      return res.status(400).json({ success: false, message: "Reward amount too small after fee deduction" });
    }

    // Create event
    const event = await Event.create({
      name,
      description: description || '',
      status: 'draft',
      eventType: 'community',
      creatorWallet: wallet,
      createdBy: wallet,
      startDate: start,
      endDate: end,
      rewardAsaId,
      rewardAsaName: asaName,
      rewardAsaDecimals: asaDecimals,
      rewardPool: netRewardPool,
      airdropDistribution: airdropDistribution || 'proportional',
      airdropTiers: airdropTiers || [],
      minPointsToQualify: minPointsToQualify || 0,
      bannerImage: bannerImage || '',
      fundingStatus: 'unfunded',
      fundingFeeAmount: feeAmount,
    });

    // Create challenges
    if (challenges && challenges.length > 0) {
      for (const ch of challenges) {
        await Challenge.create({
          eventId: event._id,
          type: ch.type,
          name: ch.name,
          description: ch.description || '',
          pointsMultiplier: ch.pointsMultiplier || 1,
          config: ch.config || {},
        });
      }
    }

    res.status(201).json({
      success: true,
      message: "Community event created. Fund the escrow to activate.",
      data: {
        event,
        feeInfo: {
          grossAmount: rewardAmount,
          feeAmount,
          feePercent,
          netRewardPool,
          rewardAsaId,
          rewardAsaName: asaName,
        },
      },
    });
  } catch (error) {
    logger.error("Error creating community event:", error);
    res.status(500).json({ success: false, message: error.message || "Error creating community event" });
  }
};

const buildFunding = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.eventType !== 'community') return res.status(400).json({ success: false, message: "Not a community event" });
    if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can fund" });
    if (event.fundingStatus !== 'unfunded') return res.status(400).json({ success: false, message: "Event already funded" });

    const feeConfig = await FeeConfig.getFeeConfig();
    const feePercent = feeConfig.communityEventFeePercent || 2.0;
    const grossAmount = event.rewardPool + event.fundingFeeAmount;

    const result = await buildFundingTxns({
      creatorWallet: wallet,
      asaId: event.rewardAsaId,
      grossAmount,
      feeRecipient: feeConfig.feeRecipient,
      feePercent,
    });

    res.status(200).json({
      success: true,
      message: "Sign and submit these transactions to fund the event",
      data: {
        eventId: event._id,
        unsignedTxns: result.unsignedTxns,
        feeTxn: result.feeTxn,
        feeAmount: result.feeAmount,
        netAmount: result.netAmount,
        escrowAddress: result.escrowAddress,
        rewardAsaId: event.rewardAsaId,
        rewardAsaName: event.rewardAsaName,
      },
    });
  } catch (error) {
    logger.error("Error building funding txns:", error);
    res.status(500).json({ success: false, message: error.message || "Error building funding transactions" });
  }
};

const confirmFunding = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const { txId, feeTxId } = req.body;

    // Atomic update to prevent double-funding
    const event = await Event.findOneAndUpdate(
      {
        _id: req.params.id,
        eventType: 'community',
        creatorWallet: wallet,
        fundingStatus: 'unfunded',
      },
      {
        $set: {
          fundingStatus: 'funded',
          fundingTxId: txId,
          fundingFeeTxId: feeTxId || '',
          fundedAt: new Date(),
          status: 'scheduled',
        },
      },
      { new: true }
    );

    if (!event) {
      return res.status(400).json({ success: false, message: "Event not found, not yours, or already funded" });
    }

    res.status(200).json({
      success: true,
      message: "Event funded and scheduled",
      data: event,
    });
  } catch (error) {
    logger.error("Error confirming funding:", error);
    res.status(500).json({ success: false, message: error.message || "Error confirming funding" });
  }
};

const updateCommunityEvent = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.eventType !== 'community') return res.status(400).json({ success: false, message: "Not a community event" });
    if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can update" });
    if (event.status !== 'draft' || event.fundingStatus !== 'unfunded') {
      return res.status(400).json({ success: false, message: "Can only update unfunded draft events" });
    }

    const { name, description, startDate, endDate, airdropDistribution, airdropTiers, minPointsToQualify } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (startDate !== undefined) updates.startDate = new Date(startDate);
    if (endDate !== undefined) updates.endDate = new Date(endDate);
    if (airdropDistribution !== undefined) updates.airdropDistribution = airdropDistribution;
    if (airdropTiers !== undefined) updates.airdropTiers = airdropTiers;
    if (minPointsToQualify !== undefined) updates.minPointsToQualify = minPointsToQualify;

    // Validate dates if either changed
    const sd = updates.startDate || event.startDate;
    const ed = updates.endDate || event.endDate;
    if (sd && ed && new Date(sd) >= new Date(ed)) {
      return res.status(400).json({ success: false, message: "startDate must be before endDate" });
    }

    const updated = await Event.findByIdAndUpdate(event._id, updates, { new: true });
    res.status(200).json({ success: true, message: "Event updated", data: updated });
  } catch (error) {
    logger.error("Error updating community event:", error);
    res.status(500).json({ success: false, message: "Error updating community event" });
  }
};

const cancelCommunityEvent = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.eventType !== 'community') return res.status(400).json({ success: false, message: "Not a community event" });
    if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can cancel" });
    if (event.status === 'ended') return res.status(400).json({ success: false, message: "Cannot cancel an ended event" });

    if (event.fundingStatus === 'funded') {
      try {
        const refundResult = await buildRefundTxn(event);
        event.fundingStatus = 'refunded';
        event.fundingTxId = refundResult.txId;
        logger.info(`Community event ${event.name} refunded: ${refundResult.txId}`);
      } catch (refundErr) {
        logger.error(`Refund failed for community event ${event.name}:`, refundErr);
        return res.status(500).json({ success: false, message: "Refund failed: " + refundErr.message });
      }
    }

    event.status = 'cancelled';
    await event.save();

    res.status(200).json({ success: true, message: "Community event cancelled", data: event });
  } catch (error) {
    logger.error("Error cancelling community event:", error);
    res.status(500).json({ success: false, message: "Error cancelling community event" });
  }
};

const getMyCommunityEvents = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const events = await Event.find({
      eventType: 'community',
      creatorWallet: wallet,
    }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: events });
  } catch (error) {
    logger.error("Error fetching user community events:", error);
    res.status(500).json({ success: false, message: "Error fetching your community events" });
  }
};

const uploadCommunityBanner = async (req, res) => {
  bannerUploadMiddleware(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: "File too large. Max 5MB." });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file provided" });
      }

      const wallet = req.user.wallet;
      const event = await Event.findById(req.params.id);
      if (!event) return res.status(404).json({ success: false, message: "Event not found" });
      if (event.eventType !== 'community') return res.status(400).json({ success: false, message: "Not a community event" });
      if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can upload banner" });

      const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const detected = await fileTypeFromBuffer(req.file.buffer);
      if (!detected || !ALLOWED.includes(detected.mime)) {
        return res.status(400).json({ success: false, message: "Invalid image type. Use JPEG, PNG, WebP, or GIF." });
      }

      // Delete old banner if it was an uploaded file
      if (event.bannerImage && event.bannerImage.startsWith('/uploads/banners/')) {
        const oldPath = path.join(__dirname, '..', event.bannerImage);
        fs.unlink(oldPath, () => {});
      }

      const filename = `event-${event._id}-${Date.now()}.${detected.ext}`;
      fs.writeFileSync(path.join(__dirname, '../uploads/banners', filename), req.file.buffer);
      const bannerImage = `/uploads/banners/${filename}`;

      event.bannerImage = bannerImage;
      await event.save();

      res.json({ success: true, data: { bannerImage } });
    } catch (error) {
      logger.error("Error uploading community event banner:", error);
      res.status(500).json({ success: false, message: "Error uploading banner" });
    }
  });
};

// ─── Admin ───

const hideCommunityEvent = async (req, res) => {
  try {
    const { reason } = req.body;
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, eventType: 'community' },
      { isHidden: true, hiddenReason: reason || 'Removed by admin' },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: "Community event not found" });
    res.status(200).json({ success: true, message: "Event hidden", data: event });
  } catch (error) {
    logger.error("Error hiding community event:", error);
    res.status(500).json({ success: false, message: "Error hiding event" });
  }
};

const adminCancelCommunityEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.eventType !== 'community') return res.status(400).json({ success: false, message: "Not a community event" });
    if (event.status === 'ended') return res.status(400).json({ success: false, message: "Cannot cancel an ended event" });

    if (event.fundingStatus === 'funded') {
      try {
        const refundResult = await buildRefundTxn(event);
        event.fundingStatus = 'refunded';
        event.fundingTxId = refundResult.txId;
        logger.info(`Admin cancelled community event ${event.name}, refunded: ${refundResult.txId}`);
      } catch (refundErr) {
        logger.error(`Admin refund failed for community event ${event.name}:`, refundErr);
        return res.status(500).json({ success: false, message: "Refund failed: " + refundErr.message });
      }
    }

    event.status = 'cancelled';
    await event.save();

    res.status(200).json({ success: true, message: "Community event cancelled by admin", data: event });
  } catch (error) {
    logger.error("Error admin-cancelling community event:", error);
    res.status(500).json({ success: false, message: "Error cancelling event" });
  }
};

// ─── Challenge Management ───

const addCommunityChallenge = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.eventType !== 'community') return res.status(400).json({ success: false, message: "Not a community event" });
    if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can add challenges" });
    if (['active', 'ended'].includes(event.status)) {
      return res.status(400).json({ success: false, message: "Cannot add challenges to active or ended events" });
    }

    const { type, name, description, pointsMultiplier, config } = req.body;
    if (!type || !name) {
      return res.status(400).json({ success: false, message: "type and name are required" });
    }

    const challenge = await Challenge.create({
      eventId: event._id,
      type,
      name,
      description: description || '',
      pointsMultiplier: pointsMultiplier || 1,
      config: config || {},
    });

    res.status(201).json({ success: true, message: "Challenge added", data: challenge });
  } catch (error) {
    logger.error("Error adding community challenge:", error);
    res.status(500).json({ success: false, message: "Error adding challenge" });
  }
};

const updateCommunityChallenge = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const challenge = await Challenge.findById(req.params.challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: "Challenge not found" });

    const event = await Event.findById(challenge.eventId);
    if (!event || event.eventType !== 'community') {
      return res.status(400).json({ success: false, message: "Not a community event challenge" });
    }
    if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can update challenges" });

    const updates = req.body;
    const updated = await Challenge.findByIdAndUpdate(challenge._id, updates, { new: true });
    res.status(200).json({ success: true, message: "Challenge updated", data: updated });
  } catch (error) {
    logger.error("Error updating community challenge:", error);
    res.status(500).json({ success: false, message: "Error updating challenge" });
  }
};

const removeCommunityChallenge = async (req, res) => {
  try {
    const wallet = req.user.wallet;
    const challenge = await Challenge.findById(req.params.challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: "Challenge not found" });

    const event = await Event.findById(challenge.eventId);
    if (!event || event.eventType !== 'community') {
      return res.status(400).json({ success: false, message: "Not a community event challenge" });
    }
    if (event.creatorWallet !== wallet) return res.status(403).json({ success: false, message: "Only the event creator can remove challenges" });
    if (event.status === 'active') {
      return res.status(400).json({ success: false, message: "Cannot remove challenge from active event" });
    }

    await Challenge.findByIdAndDelete(challenge._id);
    res.status(200).json({ success: true, message: "Challenge removed" });
  } catch (error) {
    logger.error("Error removing community challenge:", error);
    res.status(500).json({ success: false, message: "Error removing challenge" });
  }
};

module.exports = {
  getCommunityEvents,
  createCommunityEvent,
  buildFunding,
  confirmFunding,
  updateCommunityEvent,
  cancelCommunityEvent,
  getMyCommunityEvents,
  uploadCommunityBanner,
  hideCommunityEvent,
  adminCancelCommunityEvent,
  addCommunityChallenge,
  updateCommunityChallenge,
  removeCommunityChallenge,
};
