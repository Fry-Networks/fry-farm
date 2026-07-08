const logger = require("../config/logger");
const { encodeAddress } = require("algosdk");
const Event = require("../models/eventSchema");
const Challenge = require("../models/challengeSchema");
const EventPoints = require("../models/eventPointsSchema");
const StakingToken = require("../models/stakingTokenSchema");
const StakingFarmingToken = require("../models/stakingFarmingTokenSchema");
const GasFee = require("../models/gasFeeSchema");
const DailyClaim = require("../models/dailyClaimSchema");
const ClaimReward = require("../models/claimRewardSchema");
const ClaimFarmRewards = require("../models/claimFarmRewardsSchema");
const UserSwapHistory = require("../models/userSwapHistorySchema");
const NftStakedToken = require("../models/nftStakedTokenSchema");
const AlphaArcadePosition = require("../models/alphaArcadePositionSchema");
const Staking = require("../models/stakingSchema");
const Farming = require("../models/farmingSchema");
const { getAsaUsdPrice } = require("./priceService");
const { getIndexerUrl, getAlgodUrl, getAlgodToken } = require("./algodService");

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
    const entry = {
      stakeTokenId: null,
      rewardTokenId: pool.rewardToken?.id ? Number(pool.rewardToken.id) : null,
    };
    map[pool._id.toString()] = entry;
    if (pool.appId) {
      map[String(pool.appId)] = entry;
    }
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
    if (price <= 0) {
      logger.warn(`calcStakingVolume: price=0 for ASA ${asaId}, skipping ${rec.wallet}`);
      continue;
    }

    const usdValue = (rec.totalStaked / 1_000_000) * price;
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
    if (price <= 0) {
      logger.warn(`calcFarmingVolume: price=0 for ASA ${asaId}, skipping ${rec.wallet}`);
      continue;
    }

    const usdValue = rec.stakedAmount * price;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;

    const wallet = rec.wallet;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcTradingVolume(challenge, event) {
  const dateFilter = { timeOfSwap: { $gte: event.startDate, $lte: event.endDate } };
  const records = await UserSwapHistory.find(dateFilter).lean();

  const walletPoints = {};
  const priceCache = {};

  for (const rec of records) {
    const asaId = Number(rec.token1?.id);
    if (!asaId) continue;

    if (priceCache[asaId] === undefined) {
      priceCache[asaId] = await getAsaUsdPrice(asaId);
    }
    const price = priceCache[asaId];
    const usdValue = rec.amount * (price || 0);

    if (usdValue <= 0) {
      logger.warn(`calcTradingVolume: usdValue=0 for ASA ${asaId}, skipping ${rec.userId}`);
      continue;
    }
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
    if (price <= 0) {
      logger.warn(`calcStakingProfit: price=0 for ASA ${asaId}, skipping ${rec.walletId}`);
      continue;
    }

    const usdValue = (rec.rewardClaimed / 1_000_000) * price;
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
    if (price <= 0) {
      logger.warn(`calcFarmingProfit: price=0 for ASA ${asaId}, skipping ${rec.walletId}`);
      continue;
    }

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

async function calcNftStakingVolume(challenge, event) {
  const dateFilter = { stakedAt: { $gte: event.startDate, $lte: event.endDate } };
  const poolFilter = challenge.config?.specificPoolIds?.length
    ? { poolId: { $in: challenge.config.specificPoolIds } }
    : {};
  const records = await NftStakedToken.find({ ...dateFilter, ...poolFilter }).lean();

  const walletPoints = {};
  for (const rec of records) {
    const wallet = rec.wallet;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + 1 * challenge.pointsMultiplier;
  }
  return walletPoints;
}

async function calcPredictionLpVolume(challenge, event) {
  const dateFilter = { createdAt: { $gte: event.startDate, $lte: event.endDate } };
  const records = await AlphaArcadePosition.find(dateFilter).lean();

  const walletPoints = {};
  for (const rec of records) {
    const usdValue = (rec.usdcDeposited || 0) / 1_000_000;
    if (challenge.config?.minAmount && usdValue < challenge.config.minAmount) continue;
    const wallet = rec.wallet;
    walletPoints[wallet] = (walletPoints[wallet] || 0) + usdValue * challenge.pointsMultiplier;
  }
  return walletPoints;
}

const GENESIS_NFT_APP_ID = 3509410324;
const HOLDER_BOX_PREFIX = 0x62;
const HOLDER_BOX_NAME_LEN = 33;
const HOLDER_BOX_VALUE_LEN = 8;

const PUBLIC_ALGOD_FALLBACK = 'https://mainnet-api.algonode.cloud';

async function getGenesisNftHolders() {
  let algodUrl = getAlgodUrl('algorand-mainnet');
  const token = getAlgodToken('algorand-mainnet');
  let algodHeaders = token ? { 'X-Algo-API-Token': token } : {};
  const walletPoints = {};

  let boxesRes;
  try {
    boxesRes = await fetch(`${algodUrl}/v2/applications/${GENESIS_NFT_APP_ID}/boxes`, { headers: algodHeaders });
    if (!boxesRes.ok) throw new Error(`status ${boxesRes.status}`);
  } catch (err) {
    logger.warn(`getGenesisNftHolders: configured algod ${algodUrl} failed (${err.message}), falling back to ${PUBLIC_ALGOD_FALLBACK}`);
    algodUrl = PUBLIC_ALGOD_FALLBACK;
    algodHeaders = {};
    boxesRes = await fetch(`${algodUrl}/v2/applications/${GENESIS_NFT_APP_ID}/boxes`);
    if (!boxesRes.ok) {
      throw new Error(`Algod boxes fetch ${boxesRes.status}: ${await boxesRes.text().catch(() => '')}`);
    }
  }
  const boxesData = await boxesRes.json();

  for (const boxMeta of (boxesData.boxes || [])) {
    const name = typeof boxMeta === 'string' ? boxMeta : boxMeta.name;
    if (!name) continue;

    const nameBuf = Buffer.from(name, 'base64');
    if (nameBuf.length !== HOLDER_BOX_NAME_LEN || nameBuf[0] !== HOLDER_BOX_PREFIX) continue;

    const boxUrl = `${algodUrl}/v2/applications/${GENESIS_NFT_APP_ID}/box?name=b64:${encodeURIComponent(name)}`;
    const boxRes = await fetch(boxUrl, { headers: algodHeaders });
    if (!boxRes.ok) {
      logger.warn(`getGenesisNftHolders: skipping box ${name}, fetch failed: ${boxRes.status}`);
      continue;
    }
    const boxData = await boxRes.json();
    const valueBuf = Buffer.from(boxData.value, 'base64');
    if (valueBuf.length !== HOLDER_BOX_VALUE_LEN) {
      logger.warn(`getGenesisNftHolders: skipping box ${name}, value length ${valueBuf.length}`);
      continue;
    }

    const count = Number(valueBuf.readBigUInt64BE());
    const pubkey = nameBuf.slice(1);
    const wallet = encodeAddress(new Uint8Array(pubkey));
    walletPoints[wallet] = (walletPoints[wallet] || 0) + count;
  }

  return walletPoints;
}

async function calcGenesisNftMinting(challenge, event) {
  try {
    const holderCounts = await getGenesisNftHolders();
    const walletPoints = {};
    for (const [wallet, count] of Object.entries(holderCounts)) {
      walletPoints[wallet] = count * challenge.pointsMultiplier;
    }

    logger.info(`calcGenesisNftMinting: found ${Object.keys(walletPoints).length} holders`);
    return walletPoints;
  } catch (err) {
    logger.error('calcGenesisNftMinting: holder lookup failed:', err.message);
    return {};
  }
}

const CALCULATORS = {
  staking_volume: (c, e, m) => calcStakingVolume(c, e, m),
  farming_volume: (c, e, m) => calcFarmingVolume(c, e, m),
  trading_volume: (c, e) => calcTradingVolume(c, e),
  staking_profit: (c, e, m) => calcStakingProfit(c, e, m),
  farming_profit: (c, e, m) => calcFarmingProfit(c, e, m),
  daily_claim_streak: (c, e) => calcDailyClaimStreak(c, e),
  hold_duration: (c, e) => calcHoldDuration(c, e),
  nft_staking_volume: (c, e) => calcNftStakingVolume(c, e),
  prediction_lp_volume: (c, e) => calcPredictionLpVolume(c, e),
  genesis_nft_minting: (c, e) => calcGenesisNftMinting(c, e),
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

module.exports = { calculatePointsForEvent, calculateAllActiveEvents, calcGenesisNftMinting };
