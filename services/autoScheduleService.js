const logger = require("../config/logger");
const Event = require("../models/eventSchema");
const Challenge = require("../models/challengeSchema");

const RECURRENCE_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 14 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

async function checkAndCreateScheduledEvents() {
  const now = new Date();
  const templates = await Event.find({
    'autoSchedule.enabled': true,
    'autoSchedule.nextRunDate': { $lte: now },
  });

  for (const template of templates) {
    try {
      const recurrence = template.autoSchedule.recurrence || 'weekly';
      const durationMs = template.endDate - template.startDate;
      const intervalMs = RECURRENCE_MS[recurrence] || RECURRENCE_MS.weekly;

      const newStartDate = new Date(template.autoSchedule.nextRunDate);
      const newEndDate = new Date(newStartDate.getTime() + durationMs);

      const newEvent = await Event.create({
        name: `${template.name} (${newStartDate.toISOString().slice(0, 10)})`,
        description: template.description,
        status: 'scheduled',
        startDate: newStartDate,
        endDate: newEndDate,
        airdropPoolFry: template.airdropPoolFry,
        airdropDistribution: template.airdropDistribution,
        airdropTiers: template.airdropTiers,
        minPointsToQualify: template.minPointsToQualify,
        createdBy: template.createdBy,
        bannerImage: template.bannerImage,
      });

      const challenges = await Challenge.find({ eventId: template._id }).lean();
      if (challenges.length) {
        const newChallenges = challenges.map(c => ({
          eventId: newEvent._id,
          type: c.type,
          name: c.name,
          description: c.description,
          pointsMultiplier: c.pointsMultiplier,
          enabled: c.enabled,
          config: c.config,
        }));
        await Challenge.insertMany(newChallenges);
      }

      await Event.findByIdAndUpdate(template._id, {
        'autoSchedule.nextRunDate': new Date(newStartDate.getTime() + intervalMs),
      });

      logger.info(`Auto-scheduled new event: ${newEvent.name}`);
    } catch (error) {
      logger.error(`Error auto-scheduling event from template ${template.name}:`, error);
    }
  }
}

module.exports = { checkAndCreateScheduledEvents };
