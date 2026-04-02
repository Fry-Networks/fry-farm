const logger = require("../config/logger");
const AlphaArcadePool = require("../models/alphaArcadePoolSchema");
const AlphaArcadePosition = require("../models/alphaArcadePositionSchema");
const alphaArcadeService = require("../services/alphaArcadeService");
const FeeConfig = require("../models/feeConfigSchema");
const Staking = require("../models/stakingSchema");
const Farming = require("../models/farmingSchema");

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
    const pools = await AlphaArcadePool.find({}).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      message: pools.length === 0
        ? "No Alpha Arcade pools found."
        : "Alpha Arcade pools fetched successfully.",
      data: pools,
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
    res.status(200).json({
      success: true,
      message: "Pool fetched successfully.",
      data: pool,
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

    // Calculate withdrawal fee
    const feeConfig = await FeeConfig.getFeeConfig();
    const feeBps = feeConfig.alphaArcadeWithdrawFeePercent * 100;
    const feeMicro = Math.floor(position.usdcDeposited * feeBps / 10000);

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
        amount: position.usdcDeposited,
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
    const activePools = await AlphaArcadePool.countDocuments({ isActive: true });
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
  recordDeposit,
  recordWithdraw,
  getPositionsByWallet,
  getPositionByWalletAndPool,
  adminCheckResolutions,
  getStats,
  getPlatformStats,
};
