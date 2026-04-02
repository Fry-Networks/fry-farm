const logger = require("../config/logger");
const Event = require("../models/eventSchema");
const Challenge = require("../models/challengeSchema");
const EventPoints = require("../models/eventPointsSchema");
const StakingToken = require("../models/stakingTokenSchema");
const StakingFarmingToken = require("../models/stakingFarmingTokenSchema");
const GasFee = require("../models/gasFeeSchema");
const DailyClaim = require("../models/dailyClaimSchema");
const ClaimReward = require("../models/claimRewardSchema");
const ClaimFarmRewards = require("../models/claimFarmRewardsSchema");
const Staking = require("../models/stakingSchema");
const Farming = require("../models/farmingSchema");
const { getAsaUsdPrice } = require("./priceService");

async function buildPoolTokenMap() {
  const map = {};
  const [stakingPools, farmingPools] = await Promise.all([
    Staking.find({}).lean(),
    Farming.find({}).lean(),
  ]);
  for (const pool of stakingPools) {
    map[pool._id.toString()] = {
      stakeTokenId: pool.stakeToken?.id ? Number(pool.stakeToken.id) : null,
      rewardTokenId: pool.rewardToken?.id ? Number(pool.rewardToken.id) : null,
    };
  }
  for (const pool of farmingPools) {
    map[pool._id.toString()] = {
      stakeTokenId: null,
      rewardTokenId: pool.rewardToken?.id ? Number(pool.rewardToken.id) : null,
    };
  }
  return map;
}

async function calcStakingVolume(challenge, event, poolTokenMap) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const poolFilter = challenge.config?.specificPoolIds?.length
    ? { poolId: { $in: challenge.config.specificPoolIds } }
    : {};
  const records = await StakingToken.find({ ...dateFilter, ...poolFilter }).lean();

  const walletPoints = {};
  const priceCache = {};

  for (const rec of records) {
    const poolInfo = poolTokenMap[rec.poolId];
    const asaId = poolInfo?.stakeTokenId;
    if (!asaId) continue;

    if (priceCache[asaId] === undefined) {
      priceCache[asaId] = await getAsaUsdPrice(asaId);
    }
    const price = priceCache[asaId];
    if (price <= 0) continue;

    const usdValue = rec.totalStaked * price;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;

    const wallet = rec.wallet;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcFarmingVolume(challenge, event, poolTokenMap) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const poolFilter = challenge.config?.specificPoolIds?.length
    ? { poolId: { $in: challenge.config.specificPoolIds } }
    : {};
  const records = await StakingFarmingToken.find({ ...dateFilter, ...poolFilter }).lean();

  const walletPoints = {};
  const priceCache = {};

  for (const rec of records) {
    const poolInfo = poolTokenMap[rec.poolId];
    const asaId = poolInfo?.rewardTokenId || poolInfo?.stakeTokenId;
    if (!asaId) continue;

    if (priceCache[asaId] === undefined) {
      priceCache[asaId] = await getAsaUsdPrice(asaId);
    }
    const price = priceCache[asaId];
    if (price <= 0) continue;

    const usdValue = rec.stakedAmount * price;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;

    const wallet = rec.wallet;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcTradingVolume(challenge, event) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const records = await GasFee.find({ ...dateFilter, gasType: 'swapFee' }).lean();

  const walletPoints = {};
  const priceCache = {};

  for (const rec of records) {
    let usdValue = rec.usdValue || 0;
    if (!usdValue && rec.baseAmount && rec.baseToken) {
      const asaId = Number(rec.baseToken);
      if (asaId) {
        if (priceCache[asaId] === undefined) {
          priceCache[asaId] = await getAsaUsdPrice(asaId);
        }
        usdValue = rec.baseAmount * (priceCache[asaId] || 0);
      }
    }
    if (usdValue <= 0) continue;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;

    const wallet = rec.userId;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcStakingProfit(challenge, event, poolTokenMap) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const poolFilter = challenge.config?.specificPoolIds?.length
    ? { poolId: { $in: challenge.config.specificPoolIds } }
    : {};
  const records = await ClaimReward.find({ ...dateFilter, ...poolFilter }).lean();

  const walletPoints = {};
  const priceCache = {};

  for (const rec of records) {
    const poolInfo = poolTokenMap[rec.poolId];
    const asaId = poolInfo?.rewardTokenId;
    if (!asaId) continue;

    if (priceCache[asaId] === undefined) {
      priceCache[asaId] = await getAsaUsdPrice(asaId);
    }
    const price = priceCache[asaId];
    if (price <= 0) continue;

    const usdValue = rec.rewardClaimed * price;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;

    const wallet = rec.walletId;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcFarmingProfit(challenge, event, poolTokenMap) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const poolFilter = challenge.config?.specificPoolIds?.length
    ? { poolId: { $in: challenge.config.specificPoolIds } }
    : {};
  const records = await ClaimFarmRewards.find({ ...dateFilter, ...poolFilter }).lean();

  const walletPoints = {};
  const priceCache = {};

  for (const rec of records) {
    const poolInfo = poolTokenMap[rec.poolId];
    const asaId = poolInfo?.rewardTokenId;
    if (!asaId) continue;

    if (priceCache[asaId] === undefined) {
      priceCache[asaId] = await getAsaUsdPrice(asaId);
    }
    const price = priceCache[asaId];
    if (price <= 0) continue;

    const usdValue = rec.rewardClaimed * price;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;

    const wallet = rec.walletId;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcDailyClaimStreak(challenge, event) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const records = await DailyClaim.find(dateFilter).sort({ walletAddress: 1, claimDate: 1 }).lean();

  const walletPoints = {};
  const streakBonusPerDay = challenge.config?.streakBonusPerDay || 10;

  const byWallet = {};
  for (const rec of records) {
    const w = rec.walletAddress;
    if (!byWallet[w]) byWallet[w] = [];
    byWallet[w].push(rec.claimDate);
  }

  for (const [wallet, dates] of Object.entries(byWallet)) {
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / (1000 * 60 * 60 * 24);
      if (diff >= 0.5 && diff <= 1.5) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 1;
      }
    }
    walletPoints[wallet] = maxStreak * streakBonusPerDay * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcHoldDuration(challenge, event) {
  const now = new Date();
  const effectiveEnd = event.endDate < now ? event.endDate : now;

  const stakingPositions = await StakingToken.find({
    createdAt: { $lte: effectiveEnd },
  }).lean();

  const farmingPositions = await StakingFarmingToken.find({
    createdAt: { $lte: effectiveEnd },
  }).lean();

  const walletPoints = {};

  const calcHours = (position, walletField) => {
    const posStart = new Date(position.createdAt);
    const holdStart = posStart > event.startDate ? posStart : event.startDate;
    const holdEnd = effectiveEnd;
    const hours = Math.max(0, (holdEnd - holdStart) / (1000 * 60 * 60));
    const wallet = position[walletField];
    walletPoints[wallet] = (walletPoints[wallet] || 0) + hours * challenge.pointsMultiplier;
  };

  for (const pos of stakingPositions) calcHours(pos, 'wallet');
  for (const pos of farmingPositions) calcHours(pos, 'wallet');

  return walletPoints;
}

const CALCULATORS = {
  staking_volume: (c, e, m) => calcStakingVolume(c, e, m),
  farming_volume: (c, e, m) => calcFarmingVolume(c, e, m),
  trading_volume: (c, e) => calcTradingVolume(c, e),
  staking_profit: (c, e, m) => calcStakingProfit(c, e, m),
  farming_profit: (c, e, m) => calcFarmingProfit(c, e, m),
  daily_claim_streak: (c, e) => calcDailyClaimStreak(c, e),
  hold_duration: (c, e) => calcHoldDuration(c, e),
};

async function calculatePointsForEvent(eventId) {
  const event = await Event.findById(eventId);
  if (!event || event.status !== 'active') return;

  const challenges = await Challenge.find({ eventId, enabled: true });
  if (!challenges.length) return;

  const poolTokenMap = await buildPoolTokenMap();

  // wallet -> { challengeId -> { points, type } }
  const walletChallengeMap = {};

  for (const challenge of challenges) {
    const calculator = CALCULATORS[challenge.type];
    if (!calculator) continue;

    const walletPoints = await calculator(challenge, event, poolTokenMap);

    for (const [wallet, points] of Object.entries(walletPoints)) {
      if (!walletChallengeMap[wallet]) walletChallengeMap[wallet] = {};
      walletChallengeMap[wallet][challenge._id.toString()] = {
        points,
        type: challenge.type,
      };
    }
  }

  const now = new Date();
  const bulkOps = [];

  for (const [wallet, challengeMap] of Object.entries(walletChallengeMap)) {
    const challengePoints = Object.entries(challengeMap).map(([challengeId, data]) => ({
      challengeId,
      challengeType: data.type,
      points: data.points,
      lastCalculated: now,
    }));
    const totalPoints = challengePoints.reduce((sum, cp) => sum + cp.points, 0);

    bulkOps.push({
      updateOne: {
        filter: { eventId, wallet },
        update: {
          $set: { challengePoints, totalPoints, updatedAt: now },
          $setOnInsert: { eventId, wallet, createdAt: now },
        },
        upsert: true,
      },
    });
  }

  if (bulkOps.length) {
    await EventPoints.bulkWrite(bulkOps);
  }

  // Assign ranks
  const allPoints = await EventPoints.find({ eventId }).sort({ totalPoints: -1 }).lean();
  const rankOps = allPoints.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { rank: i + 1 } },
    },
  }));
  if (rankOps.length) {
    await EventPoints.bulkWrite(rankOps);
  }

  await Event.findByIdAndUpdate(eventId, {
    totalParticipants: allPoints.length,
    lastPointsUpdate: now,
  });

  logger.info(`Event points calculated for ${event.name}: ${allPoints.length} participants`);
}

async function calculateAllActiveEvents() {
  const activeEvents = await Event.find({ status: 'active' });
  for (const event of activeEvents) {
    try {
      await calculatePointsForEvent(event._id);
    } catch (error) {
      logger.error(`Error calculating points for event ${event.name}:`, error);
    }
  }
}

module.exports = { calculatePointsForEvent, calculateAllActiveEvents };
