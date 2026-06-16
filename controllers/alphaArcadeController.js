const logger = require("../config/logger");
const AlphaArcadePool = require("../models/alphaArcadePoolSchema");
const AlphaArcadePosition = require("../models/alphaArcadePositionSchema");
const alphaArcadeService = require("../services/alphaArcadeService");
const FeeConfig = require("../models/feeConfigSchema");
const GasFee = require("../models/gasFeeSchema");
const Staking = require("../models/stakingSchema");
const Farming = require("../models/farmingSchema");

// Compute APR from spread fees and Alpha Arcade LP reward data.
// Returns { aprDisplay, aprMeta } — separated for clean frontend rendering.
function computeApr(pool, market, liquidityData, rewardMarketData) {
  const spreadBps = pool.spreadBps || 50;
  const resolutionTime = pool.marketResolutionTime || 0;
  const now = Math.floor(Date.now() / 1000);
  const daysToResolution = resolutionTime > now ? (resolutionTime - now) / 86400 : 0;

  // Total market liquidity (all LPs, not just fry.farm)
  let totalLiquidityUsdc = 0;
  let dataSource = 'none';
  if (liquidityData?.totalDepthUsdc > 0) {
    totalLiquidityUsdc = liquidityData.totalDepthUsdc;
    dataSource = 'orderbook-based';
  } else if (liquidityData?.totalSupplyUsdc > 0) {
    totalLiquidityUsdc = liquidityData.totalSupplyUsdc;
    dataSource = 'supply-based';
  }

  // Spread APR — null if no volume or no liquidity data
  const twentyFourHrVolume = market?.twentyFourHrVolume || 0;
  let spreadApr = null;
  if (twentyFourHrVolume > 0 && totalLiquidityUsdc > 0) {
    spreadApr = (twentyFourHrVolume / totalLiquidityUsdc) * (spreadBps / 10000) * 365 * 100;
    spreadApr = Math.round(spreadApr * 100) / 100;
  }

  // Reward APR — null if not a reward market or no payout data
  const rm = rewardMarketData || {};
  const isRewardMarket = !!(rm.rewardsSpreadDistance > 0);
  const lastRewardAmount = rm.lastRewardAmount || 0; // micro USDC
  let rewardApr = null;
  if (isRewardMarket && lastRewardAmount > 0 && totalLiquidityUsdc > 0) {
    const lastRewardUsdc = lastRewardAmount / 1_000_000;
    rewardApr = (lastRewardUsdc * 24 * 365) / totalLiquidityUsdc * 100;
    rewardApr = Math.round(rewardApr * 100) / 100;
  }

  // Combined — null if both null, capped at 1000%
  let combinedApr = null;
  if (spreadApr !== null || rewardApr !== null) {
    combinedApr = (spreadApr || 0) + (rewardApr || 0);
    combinedApr = Math.round(combinedApr * 100) / 100;
    if (combinedApr > 1000) combinedApr = 1000;
  }

  return {
    aprDisplay: { spreadApr, rewardApr, combinedApr, dataSource, isRewardMarket },
    aprMeta: {
      spreadBps,
      totalLiquidityUsdc: Math.round(totalLiquidityUsdc * 100) / 100,
      fryFarmTvlUsdc: (pool.totalUsdcDeposited || 0) / 1_000_000,
      daysToResolution: Math.round(daysToResolution * 10) / 10,
      lastRewardAmount,
      lastRewardTs: rm.lastRewardTs || 0,
      rewardLpCount: rm.lpRewardCompetitionWalletCount || 0,
      rewardsSpreadDistance: rm.rewardsSpreadDistance || 0,
      rewardsMinContracts: rm.rewardsMinContracts || 0,
      fees: rm.fees || 0, // display only — NOT used in APR calculation
    },
  };
}

// GET /markets — list all live markets from Alpha Arcade API
const getMarkets = async (req, res) => {
  try {
    const markets = await alphaArcadeService.getMarkets();
    res.status(200).json({
      success: true,
      message: "Markets fetched successfully.",
      data: markets,
    });
  } catch (error) {
    logger.error("Error fetching Alpha Arcade markets:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching markets.",
      error: error.message,
    });
  }
};

// GET /markets/rewards — list reward markets
const getRewardMarkets = async (req, res) => {
  try {
    const markets = await alphaArcadeService.getRewardMarkets();
    res.status(200).json({
      success: true,
      message: "Reward markets fetched successfully.",
      data: markets,
    });
  } catch (error) {
    logger.error("Error fetching Alpha Arcade reward markets:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching reward markets.",
      error: error.message,
    });
  }
};

// GET /markets/:marketAppId — single market detail
const getMarketDetail = async (req, res) => {
  const { marketAppId } = req.params;
  try {
    const market = await alphaArcadeService.getMarket(marketAppId);
    if (!market) {
      return res.status(404).json({
        success: false,
        message: `Market ${marketAppId} not found.`,
      });
    }
    res.status(200).json({
      success: true,
      message: "Market detail fetched successfully.",
      data: market,
    });
  } catch (error) {
    logger.error(`Error fetching Alpha Arcade market ${marketAppId}:`, error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching market detail.",
      error: error.message,
    });
  }
};

// GET /orderbook/:marketAppId — full orderbook
const getOrderbook = async (req, res) => {
  const { marketAppId } = req.params;
  try {
    const orderbook = await alphaArcadeService.getOrderbook(marketAppId);
    res.status(200).json({
      success: true,
      message: "Orderbook fetched successfully.",
      data: orderbook,
    });
  } catch (error) {
    logger.error(`Error fetching Alpha Arcade orderbook ${marketAppId}:`, error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching orderbook.",
      error: error.message,
    });
  }
};

// GET /pools — list all pools
const getAllPools = async (req, res) => {
  try {
    const [pools, markets, rewardMarkets] = await Promise.all([
      AlphaArcadePool.find({}).sort({ createdAt: -1 }),
      alphaArcadeService.getMarkets().catch(() => []),
      alphaArcadeService.getRewardMarkets().catch(() => []),
    ]);
    const marketMap = new Map();
    for (const m of markets) {
      marketMap.set(m.marketAppId, m);
    }
    const rewardMarketMap = new Map();
    for (const rm of rewardMarkets) {
      rewardMarketMap.set(rm.marketAppId, rm);
    }

    // Fetch liquidity data for each pool in parallel (Redis-cached, 5-min TTL)
    const liquidityResults = await Promise.all(
      pools.map(async (p) => {
        const depth = await alphaArcadeService.getOrderbookDepth(p.marketAppId);
        if (depth.totalDepthUsdc > 0) return { marketAppId: p.marketAppId, ...depth };
        const supply = await alphaArcadeService.getMarketTokenSupply(p.marketAppId);
        return { marketAppId: p.marketAppId, ...supply };
      })
    );
    const liquidityMap = new Map();
    for (const l of liquidityResults) liquidityMap.set(l.marketAppId, l);

    const poolsWithApr = pools.map(p => {
      const obj = p.toObject();
      const rewardData = rewardMarketMap.get(p.marketAppId) || null;
      const apr = computeApr(p, marketMap.get(p.marketAppId), liquidityMap.get(p.marketAppId), rewardData);
      obj.aprDisplay = apr.aprDisplay;
      obj.aprMeta = apr.aprMeta;
      obj.isRewardMarket = apr.aprDisplay.isRewardMarket;
      return obj;
    });
    res.status(200).json({
      success: true,
      message: poolsWithApr.length === 0
        ? "No Alpha Arcade pools found."
        : "Alpha Arcade pools fetched successfully.",
      data: poolsWithApr,
    });
  } catch (error) {
    logger.error("Error fetching Alpha Arcade pools:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching pools.",
      error: error.message,
    });
  }
};

// GET /pool/:poolId — single pool
const getPoolById = async (req, res) => {
  const { poolId } = req.params;
  try {
    const pool = await AlphaArcadePool.findById(poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `Pool ${poolId} not found.`,
      });
    }
    const [market, rewardMarkets] = await Promise.all([
      alphaArcadeService.getMarket(pool.marketAppId).catch(() => null),
      alphaArcadeService.getRewardMarkets().catch(() => []),
    ]);
    const rewardData = rewardMarkets.find(rm => rm.marketAppId === pool.marketAppId) || null;
    const depth = await alphaArcadeService.getOrderbookDepth(pool.marketAppId);
    const liquidityData = depth.totalDepthUsdc > 0
      ? depth
      : await alphaArcadeService.getMarketTokenSupply(pool.marketAppId);
    const poolObj = pool.toObject();
    const apr = computeApr(pool, market, liquidityData, rewardData);
    poolObj.aprDisplay = apr.aprDisplay;
    poolObj.aprMeta = apr.aprMeta;
    poolObj.isRewardMarket = apr.aprDisplay.isRewardMarket;
    res.status(200).json({
      success: true,
      message: "Pool fetched successfully.",
      data: poolObj,
    });
  } catch (error) {
    logger.error(`Error fetching Alpha Arcade pool ${poolId}:`, error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching pool.",
      error: error.message,
    });
  }
};

// POST /pool/create — admin override pool creation
const createPool = async (req, res) => {
  try {
    const poolData = { ...req.body };
    if (!poolData.creatorId) poolData.creatorId = 'system';
    const pool = await AlphaArcadePool.create(poolData);
    res.status(201).json({
      success: true,
      message: "Alpha Arcade pool created successfully.",
      data: pool,
    });
  } catch (error) {
    logger.error("Error creating Alpha Arcade pool:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while creating pool.",
      error: error.message,
    });
  }
};

// PUT /pool/update/:poolId — admin pool update
const updatePool = async (req, res) => {
  const { poolId } = req.params;
  const updatedData = req.body;

  try {
    const pool = await AlphaArcadePool.findById(poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `Pool ${poolId} not found.`,
      });
    }

    const updated = await AlphaArcadePool.findByIdAndUpdate(
      poolId,
      { $set: updatedData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: `Pool ${poolId} updated successfully.`,
      data: updated,
    });
  } catch (error) {
    logger.error(`Error updating Alpha Arcade pool ${poolId}:`, error);
    res.status(500).json({
      success: false,
      message: "An error occurred while updating pool.",
      error: error.message,
    });
  }
};

// POST /build-deposit — build unsigned deposit transactions
const buildDeposit = async (req, res) => {
  const { wallet, marketAppId, usdcAmount, spread } = req.body;

  try {
    // Auto-create pool if needed
    const pool = await alphaArcadeService.getOrCreatePool(marketAppId);

    if (!pool.isActive) {
      return res.status(400).json({
        success: false,
        message: "This market pool is no longer active.",
      });
    }

    // Block deposits to markets resolving within 6 hours
    const resTime = pool.marketResolutionTime;
    if (resTime > 0 && resTime * 1000 - Date.now() < 6 * 3600000) {
      return res.status(400).json({
        success: false,
        message: 'This market resolves within 6 hours. Deposits are disabled for safety.',
      });
    }

    const spreadBps = spread || pool.spreadBps;

    // Calculate deposit fee
    const feeConfig = await FeeConfig.getFeeConfig();
    const feeBps = feeConfig.alphaArcadeDepositFeePercent * 100;
    const numericUsdcAmount = Number(usdcAmount);
    const feeMicro = Math.floor(numericUsdcAmount * feeBps / 10000);
    const netAmount = numericUsdcAmount - feeMicro;

    if (netAmount < 1_000_000) {
      return res.status(400).json({
        success: false,
        message: `After the ${feeConfig.alphaArcadeDepositFeePercent}% platform fee, net deposit would be below 1 USDC minimum. Please deposit at least ${((1_000_000 / (1 - feeBps / 10000)) / 1_000_000).toFixed(2)} USDC.`,
      });
    }

    const result = await alphaArcadeService.buildDepositTxns({
      wallet,
      marketAppId: Number(marketAppId),
      usdcAmount: netAmount,
      spreadBps: spreadBps,
      yesAsaId: pool.yesAsaId,
      noAsaId: pool.noAsaId,
      feeWallet: feeConfig.feeRecipient,
      feeMicro,
    });

    res.status(200).json({
      success: true,
      message: "Deposit transactions built successfully.",
      data: {
        ...result,
        poolId: pool._id.toString(),
        marketAppId: pool.marketAppId,
        fee: feeMicro,
        netAmount,
        feePercent: feeConfig.alphaArcadeDepositFeePercent,
      },
    });
  } catch (error) {
    logger.error("Error building Alpha Arcade deposit:", error);
    const isNotFound = error.message && error.message.includes('not found');
    const status = isNotFound ? 400 : 500;
    const message = isNotFound
      ? "The requested market could not be found."
      : "An error occurred while building deposit transactions.";
    res.status(status).json({
      success: false,
      message,
      error: error.message,
    });
  }
};

// POST /build-withdraw — build unsigned withdraw transactions
const buildWithdraw = async (req, res) => {
  const { wallet, poolId } = req.body;

  try {
    const pool = await AlphaArcadePool.findById(poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `Pool ${poolId} not found.`,
      });
    }

    // Get user's active position to find escrow app IDs
    const position = await AlphaArcadePosition.findOne({
      wallet,
      poolId,
      status: { $in: ['active', 'pending_withdrawal'] },
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        message: "No active position found for this wallet and pool.",
      });
    }

    const escrowAppIds = [...position.yesEscrowAppIds, ...position.noEscrowAppIds];

    // Compute the actual on-chain token amount (net of deposit fee)
    const netTokenAmount = position.usdcDeposited - (position.feesPaid?.depositFee || 0);

    // Calculate withdrawal fee from net amount
    const feeConfig = await FeeConfig.getFeeConfig();
    const feeBps = feeConfig.alphaArcadeWithdrawFeePercent * 100;
    const feeMicro = Math.floor(netTokenAmount * feeBps / 10000);

    let result;

    if (escrowAppIds.length > 0) {
      // Path A: Has escrows — cancel orders (existing flow)
      result = await alphaArcadeService.buildWithdrawTxns({
        wallet,
        marketAppId: pool.marketAppId,
        matcherAppId: pool.matcherAppId,
        escrowAppIds,
        feeWallet: feeConfig.feeRecipient,
        feeMicro,
      });
    } else {
      // Path B: No escrows — merge YES+NO shares back to USDC
      result = await alphaArcadeService.buildMergeSharesTxns({
        wallet,
        marketAppId: pool.marketAppId,
        amount: netTokenAmount,
        feeWallet: feeConfig.feeRecipient,
        feeMicro,
      });
    }

    res.status(200).json({
      success: true,
      message: "Withdraw transactions built successfully.",
      data: {
        ...result,
        poolId: pool._id.toString(),
        positionId: position._id.toString(),
        fee: feeMicro,
        feePercent: feeConfig.alphaArcadeWithdrawFeePercent,
      },
    });
  } catch (error) {
    logger.error("Error building Alpha Arcade withdraw:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while building withdraw transactions.",
      error: error.message,
    });
  }
};

// POST /record-deposit — record a confirmed deposit
const recordDeposit = async (req, res) => {
  const {
    wallet, marketAppId, poolId, usdcDeposited,
    yesEscrowAppIds, noEscrowAppIds, spreadUsed, entryMidPrice, txId,
    depositFee,
  } = req.body;

  try {
    const pool = await AlphaArcadePool.findById(poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `Pool ${poolId} not found.`,
      });
    }

    const position = await AlphaArcadePosition.create({
      wallet,
      poolId,
      marketAppId: Number(marketAppId),
      usdcDeposited: Number(usdcDeposited),
      yesEscrowAppIds: yesEscrowAppIds || [],
      noEscrowAppIds: noEscrowAppIds || [],
      spreadUsed: Number(spreadUsed || 0),
      entryMidPrice: Number(entryMidPrice || 0),
      status: 'active',
      feesPaid: { depositFee: Number(depositFee || 0) },
    });

    // Log deposit fee to GasFee collection
    if (Number(depositFee || 0) > 0) {
      GasFee.create({
        appId: Number(marketAppId),
        userId: wallet,
        gasAmount: Number(depositFee),
        gasType: 'alphaArcadeDeposit',
        feeType: 'percentage',
        baseAmount: Number(usdcDeposited),
        baseToken: 'USDC',
      }).catch(err => logger.error('Failed to log Alpha Arcade deposit fee:', err.message));
    }

    // Update pool totals
    await AlphaArcadePool.findByIdAndUpdate(poolId, {
      $inc: { totalProviders: 1, totalUsdcDeposited: Number(usdcDeposited) },
    });

    res.status(201).json({
      success: true,
      message: "Deposit recorded successfully.",
      data: position,
    });
  } catch (error) {
    logger.error("Error recording Alpha Arcade deposit:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while recording deposit.",
      error: error.message,
    });
  }
};

// POST /record-withdraw — record a confirmed withdrawal
const recordWithdraw = async (req, res) => {
  const {
    wallet, poolId, positionId, usdcRecovered,
    remainingYesTokens, remainingNoTokens, txId,
    withdrawFee,
  } = req.body;

  try {
    const position = await AlphaArcadePosition.findById(positionId);
    if (!position) {
      return res.status(404).json({
        success: false,
        message: `Position ${positionId} not found.`,
      });
    }

    if (position.wallet !== wallet) {
      return res.status(403).json({
        success: false,
        message: "Wallet does not match position owner.",
      });
    }

    position.status = 'withdrawn';
    position.withdrawnAt = new Date();
    position.usdcRecovered = Number(usdcRecovered || 0);
    position.remainingYesTokens = Number(remainingYesTokens || 0);
    position.remainingNoTokens = Number(remainingNoTokens || 0);
    position.feesPaid = position.feesPaid || {};
    position.feesPaid.withdrawFee = Number(withdrawFee || 0);
    await position.save();

    // Log withdraw fee to GasFee collection
    if (Number(withdrawFee || 0) > 0) {
      GasFee.create({
        appId: position.marketAppId,
        userId: wallet,
        gasAmount: Number(withdrawFee),
        gasType: 'alphaArcadeWithdraw',
        feeType: 'percentage',
        baseAmount: position.usdcDeposited,
        baseToken: 'USDC',
      }).catch(err => logger.error('Failed to log Alpha Arcade withdraw fee:', err.message));
    }

    // Decrement pool totals
    await AlphaArcadePool.findByIdAndUpdate(poolId || position.poolId, {
      $inc: {
        totalProviders: -1,
        totalUsdcDeposited: -position.usdcDeposited,
      },
    });

    res.status(200).json({
      success: true,
      message: "Withdrawal recorded successfully.",
      data: position,
    });
  } catch (error) {
    logger.error("Error recording Alpha Arcade withdrawal:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while recording withdrawal.",
      error: error.message,
    });
  }
};

// GET /positions/:wallet — all positions for a wallet
const getPositionsByWallet = async (req, res) => {
  const { wallet } = req.params;
  try {
    const positions = await AlphaArcadePosition.find({ wallet }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      message: positions.length === 0
        ? "No positions found for this wallet."
        : "Positions fetched successfully.",
      data: positions,
    });
  } catch (error) {
    logger.error(`Error fetching Alpha Arcade positions for ${wallet}:`, error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching positions.",
      error: error.message,
    });
  }
};

// GET /position/:wallet/:poolId — specific position
const getPositionByWalletAndPool = async (req, res) => {
  const { wallet, poolId } = req.params;
  try {
    const positions = await AlphaArcadePosition.find({ wallet, poolId }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      message: positions.length === 0
        ? "No position found for this wallet and pool."
        : "Position fetched successfully.",
      data: positions,
    });
  } catch (error) {
    logger.error(`Error fetching Alpha Arcade position for ${wallet}/${poolId}:`, error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching position.",
      error: error.message,
    });
  }
};

// POST /admin/check-resolutions — manually trigger resolution check
const adminCheckResolutions = async (req, res) => {
  try {
    const { checkResolutions } = require('../crons/alphaArcadeResolutionCron');
    const results = await checkResolutions();
    res.json({ success: true, message: 'Resolution check complete', data: results });
  } catch (error) {
    logger.error('Error running admin resolution check:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while running resolution check.',
      error: error.message,
    });
  }
};

// GET /stats — aggregate stats for the Prediction LP page
const getStats = async (req, res) => {
  try {
    const positionStats = await AlphaArcadePosition.aggregate([
      { $match: { status: 'active' } },
      { $group: {
        _id: null,
        totalUsdcDeposited: { $sum: '$usdcDeposited' },
        totalPositions: { $sum: 1 },
        uniqueWallets: { $addToSet: '$wallet' },
      }},
    ]);

    // Cross-check DB active pools against live market data so stats never
    // claim active pools when the authoritative upstream has none.
    const activePoolsDb = await AlphaArcadePool.find({ isActive: true }).select('marketAppId').lean();
    let liveMarkets = [];
    try {
      liveMarkets = await alphaArcadeService.getMarkets();
    } catch (e) {
      logger.warn('Alpha Arcade getStats: live market fetch failed, falling back to empty set:', e.message);
    }
    const liveMarketAppIds = new Set((liveMarkets || []).map(m => Number(m.marketAppId || m.id)));
    const activePools = activePoolsDb.filter(p => liveMarketAppIds.has(Number(p.marketAppId))).length;

    const stats = positionStats[0] || { totalUsdcDeposited: 0, totalPositions: 0, uniqueWallets: [] };
    res.json({
      success: true,
      data: {
        tvl: stats.totalUsdcDeposited,
        totalProviders: (stats.uniqueWallets || []).length,
        totalPositions: stats.totalPositions,
        activePools,
      },
    });
  } catch (err) {
    logger.error('Error fetching Alpha Arcade stats:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /admin/platform-stats — aggregate stats across all farm types for admin dashboard
const getPlatformStats = async (req, res) => {
  try {
    const [stakingPools, farmingPools, aaStats] = await Promise.all([
      Staking.aggregate([{ $group: { _id: null, totalStakers: { $sum: '$totalStakers' } } }]),
      Farming.aggregate([{ $group: { _id: null, totalFarmers: { $sum: '$totalFarmers' } } }]),
      AlphaArcadePosition.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, count: { $sum: 1 }, wallets: { $addToSet: '$wallet' }, tvl: { $sum: '$usdcDeposited' } } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        activeStaking: stakingPools[0]?.totalStakers || 0,
        activeFarming: farmingPools[0]?.totalFarmers || 0,
        activePredictions: aaStats[0]?.count || 0,
        predictionProviders: (aaStats[0]?.wallets || []).length,
        predictionTvl: aaStats[0]?.tvl || 0,
      },
    });
  } catch (err) {
    logger.error('Error fetching platform stats:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /build-claim — build unsigned claim transactions for resolved markets
const buildClaim = async (req, res) => {
  const { wallet, poolId } = req.body;

  try {
    const pool = await AlphaArcadePool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ success: false, message: `Pool ${poolId} not found.` });
    }
    if (!pool.isResolved || !pool.resolutionOutcome) {
      return res.status(400).json({ success: false, message: 'Market not yet resolved on-chain.' });
    }

    const position = await AlphaArcadePosition.findOne({
      wallet,
      poolId,
      status: 'resolved',
    });
    if (!position) {
      return res.status(404).json({ success: false, message: 'No resolved position found for this wallet and pool.' });
    }

    // Determine winning asset
    const winningAssetId = pool.resolutionOutcome === 'yes' ? pool.yesAsaId : pool.noAsaId;

    // Compute the actual on-chain token amount (net of deposit fee)
    const netTokenAmount = position.usdcDeposited - (position.feesPaid?.depositFee || 0);

    // Calculate claim fee from net amount (same rate as withdraw fee)
    const feeConfig = await FeeConfig.getFeeConfig();
    const feeBps = feeConfig.alphaArcadeWithdrawFeePercent * 100;
    const feeMicro = Math.floor(netTokenAmount * feeBps / 10000);

    const result = await alphaArcadeService.buildClaimTxns({
      wallet,
      marketAppId: pool.marketAppId,
      assetId: winningAssetId,
      amount: netTokenAmount,
      feeWallet: feeConfig.feeRecipient,
      feeMicro,
    });

    // Log claim fee to GasFee collection
    if (feeMicro > 0) {
      GasFee.create({
        appId: pool.marketAppId,
        userId: wallet,
        gasAmount: feeMicro,
        gasType: 'alphaArcadeClaim',
        feeType: 'percentage',
        baseAmount: netTokenAmount,
        baseToken: 'USDC',
      }).catch(err => logger.error('Failed to log Alpha Arcade claim fee:', err.message));
    }

    res.status(200).json({
      success: true,
      message: 'Claim transactions built successfully.',
      data: {
        ...result,
        poolId: pool._id.toString(),
        positionId: position._id.toString(),
        outcome: pool.resolutionOutcome,
        fee: feeMicro,
        feePercent: feeConfig.alphaArcadeWithdrawFeePercent,
      },
    });
  } catch (error) {
    logger.error('Error building Alpha Arcade claim:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while building claim transactions.',
      error: error.message,
    });
  }
};

// POST /record-claim — record a confirmed claim
const recordClaim = async (req, res) => {
  const { wallet, positionId, amountClaimed, txId } = req.body;

  try {
    const position = await AlphaArcadePosition.findById(positionId);
    if (!position) {
      return res.status(404).json({ success: false, message: `Position ${positionId} not found.` });
    }
    if (position.wallet !== wallet) {
      return res.status(403).json({ success: false, message: 'Wallet does not match position owner.' });
    }

    position.status = 'claimed';
    position.claimedAt = new Date();
    position.usdcRecovered = Number(amountClaimed || 0);
    await position.save();

    res.status(200).json({
      success: true,
      message: 'Claim recorded successfully.',
      data: position,
    });
  } catch (error) {
    logger.error('Error recording Alpha Arcade claim:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while recording claim.',
      error: error.message,
    });
  }
};

module.exports = {
  getMarkets,
  getRewardMarkets,
  getMarketDetail,
  getOrderbook,
  getAllPools,
  getPoolById,
  createPool,
  updatePool,
  buildDeposit,
  buildWithdraw,
  buildClaim,
  recordDeposit,
  recordWithdraw,
  recordClaim,
  getPositionsByWallet,
  getPositionByWalletAndPool,
  adminCheckResolutions,
  getStats,
  getPlatformStats,
};
