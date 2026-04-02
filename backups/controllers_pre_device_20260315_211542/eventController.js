const logger = require("../config/logger");
const Event = require("../models/eventSchema");
const Challenge = require("../models/challengeSchema");
const EventPoints = require("../models/eventPointsSchema");
const { calculatePointsForEvent } = require("../services/eventPointsService");
const { distributeAirdrop } = require("../services/airdropService");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { fromBuffer: fileTypeFromBuffer } = require("file-type");

// Ensure banner uploads directory exists
fs.mkdirSync(path.join(__dirname, "../uploads/banners"), { recursive: true });

const bannerUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("banner");

// ─── Public ───

const getActiveEvents = async (req, res) => {
  try {
    const now = new Date();
    // Auto-activate scheduled events whose start date has passed (official only)
    await Event.updateMany(
      { status: 'scheduled', startDate: { $lte: now }, eventType: { $ne: 'community' } },
      { $set: { status: 'active' } }
    );
    const events = await Event.find({ status: 'active', eventType: { $ne: 'community' } }).sort({ startDate: -1 }).lean();
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
    logger.error("Error fetching active events:", error);
    res.status(500).json({ success: false, message: "Error fetching active events" });
  }
};

const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find({ eventType: { $ne: 'community' } }).sort({ startDate: -1 }).lean();
    res.status(200).json({ success: true, data: events });
  } catch (error) {
    logger.error("Error fetching all events:", error);
    res.status(500).json({ success: false, message: "Error fetching events" });
  }
};

const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    const challenges = await Challenge.find({ eventId: event._id }).lean();
    res.status(200).json({ success: true, data: { ...event, challenges } });
  } catch (error) {
    logger.error("Error fetching event:", error);
    res.status(500).json({ success: false, message: "Error fetching event" });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const eventId = req.params.id;

    const [entries, total] = await Promise.all([
      EventPoints.find({ eventId })
        .sort({ totalPoints: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      EventPoints.countDocuments({ eventId }),
    ]);

    res.status(200).json({ success: true, data: { entries, total, eventId } });
  } catch (error) {
    logger.error("Error fetching leaderboard:", error);
    res.status(500).json({ success: false, message: "Error fetching leaderboard" });
  }
};

const getUserEventPoints = async (req, res) => {
  try {
    const { id: eventId, wallet } = req.params;
    const points = await EventPoints.findOne({ eventId, wallet }).lean();
    if (!points) {
      return res.status(200).json({
        success: true,
        data: { eventId, wallet, totalPoints: 0, rank: null, challengePoints: [] },
      });
    }
    res.status(200).json({ success: true, data: points });
  } catch (error) {
    logger.error("Error fetching user event points:", error);
    res.status(500).json({ success: false, message: "Error fetching user points" });
  }
};

// ─── Admin ───

const createEvent = async (req, res) => {
  try {
    const { name, description, startDate, endDate, airdropPoolFry, airdropDistribution,
      airdropTiers, minPointsToQualify, autoSchedule, bannerImage, status } = req.body;

    const eventStatus = (status === 'scheduled') ? 'scheduled' : 'draft';

    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    if (eventStatus === 'scheduled') {
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: "startDate and endDate are required for scheduled events" });
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start >= end) {
        return res.status(400).json({ success: false, message: "startDate must be before endDate" });
      }
    }

    const eventData = {
      name, description, airdropPoolFry, airdropDistribution, airdropTiers,
      minPointsToQualify, autoSchedule, bannerImage,
      createdBy: req.user.wallet, status: eventStatus,
    };
    if (startDate) eventData.startDate = new Date(startDate);
    if (endDate) eventData.endDate = new Date(endDate);

    const event = await Event.create(eventData);
    res.status(201).json({ success: true, message: "Event created", data: event });
  } catch (error) {
    logger.error("Error creating event:", error);
    res.status(500).json({ success: false, message: "Error creating event" });
  }
};

const updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.status === 'ended') {
      return res.status(400).json({ success: false, message: "Cannot modify an ended event" });
    }

    const { status, ...updates } = req.body;

    // Allow draft↔scheduled status transitions
    if (status && ['draft', 'scheduled'].includes(status) && ['draft', 'scheduled'].includes(event.status)) {
      if (status === 'scheduled') {
        const sd = updates.startDate || event.startDate;
        const ed = updates.endDate || event.endDate;
        if (!sd || !ed) {
          return res.status(400).json({ success: false, message: "startDate and endDate are required for scheduled events" });
        }
        if (new Date(sd) >= new Date(ed)) {
          return res.status(400).json({ success: false, message: "startDate must be before endDate" });
        }
      }
      updates.status = status;
    }

    const updated = await Event.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.status(200).json({ success: true, message: "Event updated", data: updated });
  } catch (error) {
    logger.error("Error updating event:", error);
    res.status(500).json({ success: false, message: "Error updating event" });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!['draft', 'cancelled'].includes(event.status)) {
      return res.status(400).json({ success: false, message: "Can only delete draft or cancelled events" });
    }

    await Promise.all([
      Challenge.deleteMany({ eventId: event._id }),
      EventPoints.deleteMany({ eventId: event._id }),
      Event.findByIdAndDelete(event._id),
    ]);
    res.status(200).json({ success: true, message: "Event deleted" });
  } catch (error) {
    logger.error("Error deleting event:", error);
    res.status(500).json({ success: false, message: "Error deleting event" });
  }
};

const activateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!['draft', 'scheduled'].includes(event.status)) {
      return res.status(400).json({ success: false, message: "Can only activate draft or scheduled events" });
    }
    if (!event.startDate || !event.endDate) {
      return res.status(400).json({ success: false, message: "Event must have start and end dates before activation" });
    }

    event.status = 'active';
    await event.save();
    res.status(200).json({ success: true, message: "Event activated", data: event });
  } catch (error) {
    logger.error("Error activating event:", error);
    res.status(500).json({ success: false, message: "Error activating event" });
  }
};

const endEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.status !== 'active') {
      return res.status(400).json({ success: false, message: "Can only end active events" });
    }

    // Final point calculation
    await calculatePointsForEvent(event._id);

    event.status = 'ended';
    await event.save();

    // Trigger airdrop async
    distributeAirdrop(event._id).catch(err => {
      logger.error(`Airdrop error for event ${event.name}:`, err);
    });

    res.status(200).json({ success: true, message: "Event ended, airdrop triggered", data: event });
  } catch (error) {
    logger.error("Error ending event:", error);
    res.status(500).json({ success: false, message: "Error ending event" });
  }
};

const cancelEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (event.status === 'ended') {
      return res.status(400).json({ success: false, message: "Cannot cancel an ended event" });
    }

    event.status = 'cancelled';
    await event.save();
    res.status(200).json({ success: true, message: "Event cancelled", data: event });
  } catch (error) {
    logger.error("Error cancelling event:", error);
    res.status(500).json({ success: false, message: "Error cancelling event" });
  }
};

const addChallenge = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    const { type, name, description, pointsMultiplier, enabled, config } = req.body;
    if (!type || !name) {
      return res.status(400).json({ success: false, message: "type and name are required" });
    }

    const challenge = await Challenge.create({
      eventId: event._id, type, name, description,
      pointsMultiplier, enabled, config,
    });
    res.status(201).json({ success: true, message: "Challenge added", data: challenge });
  } catch (error) {
    logger.error("Error adding challenge:", error);
    res.status(500).json({ success: false, message: "Error adding challenge" });
  }
};

const updateChallenge = async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: "Challenge not found" });

    const updates = req.body;
    const updated = await Challenge.findByIdAndUpdate(challenge._id, updates, { new: true });
    res.status(200).json({ success: true, message: "Challenge updated", data: updated });
  } catch (error) {
    logger.error("Error updating challenge:", error);
    res.status(500).json({ success: false, message: "Error updating challenge" });
  }
};

const removeChallenge = async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: "Challenge not found" });

    const event = await Event.findById(challenge.eventId);
    if (event && event.status === 'active') {
      return res.status(400).json({ success: false, message: "Cannot remove challenge from active event" });
    }

    await Challenge.findByIdAndDelete(challenge._id);
    res.status(200).json({ success: true, message: "Challenge removed" });
  } catch (error) {
    logger.error("Error removing challenge:", error);
    res.status(500).json({ success: false, message: "Error removing challenge" });
  }
};

const triggerPointCalculation = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });

    await calculatePointsForEvent(event._id);
    res.status(200).json({ success: true, message: "Point calculation triggered" });
  } catch (error) {
    logger.error("Error triggering point calculation:", error);
    res.status(500).json({ success: false, message: "Error calculating points" });
  }
};

const triggerAirdrop = async (req, res) => {
  try {
    const result = await distributeAirdrop(req.params.id);
    res.status(200).json({ success: true, message: "Airdrop triggered", data: result });
  } catch (error) {
    logger.error("Error triggering airdrop:", error);
    res.status(500).json({ success: false, message: error.message || "Error triggering airdrop" });
  }
};

const uploadBanner = async (req, res) => {
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

      const event = await Event.findById(req.params.id);
      if (!event) return res.status(404).json({ success: false, message: "Event not found" });

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
      logger.error("Error uploading banner:", error);
      res.status(500).json({ success: false, message: "Error uploading banner" });
    }
  });
};

module.exports = {
  getActiveEvents, getAllEvents, getEventById, getLeaderboard, getUserEventPoints,
  createEvent, updateEvent, deleteEvent, activateEvent, endEvent, cancelEvent,
  addChallenge, updateChallenge, removeChallenge,
  triggerPointCalculation, triggerAirdrop, uploadBanner,
};
