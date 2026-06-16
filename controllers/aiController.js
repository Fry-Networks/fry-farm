const logger = require("../config/logger");
const AiInteraction = require("../models/aiInteractionSchema");
const { verifyFryPaymentWithRetry } = require("../services/paymentVerificationService");
const claudeService = require("../services/claudeService");
const { getFryUsdPrice, getAsaUsdPrice, getVoiUsdPrice } = require("../services/priceService");
const Staking = require("../models/stakingSchema");
const StakingToken = require("../models/stakingTokenSchema");
const Farming = require("../models/farmingSchema");

// USD cost targets per analysis type
const AI_COSTS_USD = {
  pool: 0.01,
  portfolio: 0.02,
  swap: 0.005,
};

// Minimum FRY per analysis (floor)
const MIN_FRY = { pool: 1, portfolio: 2, swap: 1 };

/** Calculate FRY cost from USD target + live FRY price */
async function calculateFryCost(type) {
  const fryPrice = await getFryUsdPrice().catch(() => 0);
  const usdCost = AI_COSTS_USD[type];
  const minFry = MIN_FRY[type];
  if (!fryPrice || fryPrice <= 0) return minFry;
  return Math.max(minFry, Math.ceil(usdCost / fryPrice));
}

/** Calculate expected payment amount and asset ID based on chain */
async function calculateExpectedPayment(type, chainId) {
  const costFry = await calculateFryCost(type);

  if (chainId === 'voi-mainnet') {
    const fryPrice = await getFryUsdPrice().catch(() => 0);
    const voiPrice = await getVoiUsdPrice().catch(() => 0);
    if (!fryPrice || fryPrice <= 0 || !voiPrice || voiPrice <= 0) {
      throw new Error('Could not determine payment amount (price feed unavailable)');
    }
    const costUsd = costFry * fryPrice;
    const voiMicroAmount = Math.ceil((costUsd / voiPrice) * 1_000_000);
    return { costFry, expectedMicro: voiMicroAmount, assetId: 0 };
  }

  return { costFry, expectedMicro: costFry * 1_000_000, assetId: null };
}

const getPrices = async (req, res) => {
  try {
    const [poolCost, portfolioCost, swapCost, fryPrice] = await Promise.all([
      calculateFryCost("pool"),
      calculateFryCost("portfolio"),
      calculateFryCost("swap"),
      getFryUsdPrice().catch(() => 0),
    ]);
    res.status(200).json({
      success: true,
      data: {
        poolAnalysis: poolCost,
        portfolioAnalysis: portfolioCost,
        swapAnalysis: swapCost,
        currency: "FRY",
        fryPriceUsd: fryPrice,
      },
    });
  } catch (err) {
    logger.error("aiController.getPrices error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch prices" });
  }
};

const analyzePool = async (req, res) => {
  const { txId, poolId } = req.body;
  const wallet = req.user.wallet;

  if (!txId || !poolId) {
    return res.status(400).json({ success: false, message: "txId and poolId are required" });
  }

  try {
    // Calculate dynamic cost
    const { costFry, expectedMicro, assetId } = await calculateExpectedPayment("pool", req.chainId);

    // Verify payment
    const payment = await verifyFryPaymentWithRetry(txId, expectedMicro, wallet, req.chainId, assetId);
    if (!payment.verified) {
      return res.status(402).json({ success: false, message: payment.error });
    }

    // Create pending interaction
    const fryPrice = await getFryUsdPrice().catch(() => 0);
    const interaction = await AiInteraction.create({
      walletAddress: wallet,
      interactionType: "pool_analysis",
      paymentTxId: txId,
      paymentAmount: expectedMicro,
      fryPriceAtTime: fryPrice,
      poolId,
      status: "pending",
    });

    // Fetch pool data
    const pool = await Staking.findById(poolId).lean();
    if (!pool) {
      await AiInteraction.findByIdAndUpdate(interaction._id, {
        status: "failed",
        errorMessage: "Pool not found",
      });
      return res.status(404).json({ success: false, message: "Pool not found" });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const lockSec = pool.lockPeriod || 0;
    const lockLabel = lockSec >= 86400 ? `${Math.round(lockSec / 86400)} days` : lockSec > 0 ? `${Math.round(lockSec / 3600)} hours` : "None";
    const rewardsRaw = pool.rewardTokenAmount - (pool.rewardsDistributed || 0);

    // Apply cross-token APR correction (matches frontend stakeTable.tsx logic)
    let displayApr = pool.aprRate || 0;
    const stakeTokenId = pool.stakeToken.id;
    const rewardTokenId = pool.rewardToken.id;
    if (stakeTokenId !== rewardTokenId) {
      const [stakePrice, rewardPrice] = await Promise.all([
        getAsaUsdPrice(Number(stakeTokenId)).catch(() => 0),
        getAsaUsdPrice(Number(rewardTokenId)).catch(() => 0),
      ]);
      if (stakePrice > 0 && rewardPrice > 0) {
        displayApr = displayApr * (rewardPrice / stakePrice);
      }
    }

    const poolData = {
      name: `${pool.stakeToken.name} → ${pool.rewardToken.name}`,
      apr: `${displayApr.toFixed(2)}%`,
      tvl: `${(pool.totalAmountStaked || 0).toLocaleString()} ${pool.stakeToken.name}`,
      lockPeriod: lockLabel,
      rewardsRemaining: `${(rewardsRaw / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pool.rewardToken.name}`,
      endDate: new Date(pool.stakingEndTime * 1000).toISOString(),
      isGated: pool.isGated,
    };

    // Call Claude
    const result = await claudeService.analyzePool(poolData);

    // Update interaction
    await AiInteraction.findByIdAndUpdate(interaction._id, {
      prompt: JSON.stringify(poolData),
      response: result.analysis,
      tokensUsed: result.tokensUsed,
      apiCost: result.apiCost,
      status: "completed",
    });

    res.status(200).json({
      success: true,
      data: {
        analysis: result.analysis,
        cost: costFry,
        interactionId: interaction._id,
      },
    });
  } catch (err) {
    logger.error("aiController.analyzePool error:", err.message);
    // Try to mark interaction as failed if it was created
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Transaction already used" });
    }
    res.status(500).json({ success: false, message: "Analysis failed" });
  }
};

const analyzePortfolio = async (req, res) => {
  const { txId } = req.body;
  const wallet = req.user.wallet;

  if (!txId) {
    return res.status(400).json({ success: false, message: "txId is required" });
  }

  try {
    // Calculate dynamic cost
    const { costFry, expectedMicro, assetId } = await calculateExpectedPayment("portfolio", req.chainId);

    // Verify payment
    const payment = await verifyFryPaymentWithRetry(txId, expectedMicro, wallet, req.chainId, assetId);
    if (!payment.verified) {
      return res.status(402).json({ success: false, message: payment.error });
    }

    // Create pending interaction
    const fryPrice = await getFryUsdPrice().catch(() => 0);
    const interaction = await AiInteraction.create({
      walletAddress: wallet,
      interactionType: "portfolio_analysis",
      paymentTxId: txId,
      paymentAmount: expectedMicro,
      fryPriceAtTime: fryPrice,
      status: "pending",
    });

    // Fetch user positions
    const stakingPositions = await StakingToken.find({ wallet }).lean();
    const stakingPools = await Staking.find({
      _id: { $in: stakingPositions.map((p) => p.poolId) },
    }).lean();
    const poolMap = {};
    for (const p of stakingPools) poolMap[String(p._id)] = p;

    const positions = stakingPositions
      .filter((pos) => pos.totalStaked > 0)
      .map((pos) => {
        const pool = poolMap[pos.poolId];
        return {
          poolName: pool
            ? `${pool.stakeToken.name} → ${pool.rewardToken.name}`
            : `Pool ${pos.poolId}`,
          type: "staking",
          staked: (pos.totalStaked / 1_000_000).toFixed(2),
          reward: "N/A",
          apr: pos.apr,
          lockRemaining: pos.lockPeriod,
        };
      });

    if (positions.length === 0) {
      await AiInteraction.findByIdAndUpdate(interaction._id, {
        status: "failed",
        errorMessage: "No active positions found",
      });
      return res.status(404).json({ success: false, message: "No active positions found" });
    }

    // Call Claude
    const result = await claudeService.analyzePortfolio(positions);

    // Update interaction
    await AiInteraction.findByIdAndUpdate(interaction._id, {
      prompt: JSON.stringify(positions),
      response: result.analysis,
      tokensUsed: result.tokensUsed,
      apiCost: result.apiCost,
      status: "completed",
    });

    res.status(200).json({
      success: true,
      data: {
        analysis: result.analysis,
        cost: costFry,
        interactionId: interaction._id,
      },
    });
  } catch (err) {
    logger.error("aiController.analyzePortfolio error:", err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Transaction already used" });
    }
    res.status(500).json({ success: false, message: "Analysis failed" });
  }
};

const analyzeSwap = async (req, res) => {
  const { txId, fromToken, toToken, amount, priceImpact } = req.body;
  const wallet = req.user.wallet;

  if (!txId || !fromToken || !toToken || !amount) {
    return res
      .status(400)
      .json({ success: false, message: "txId, fromToken, toToken, and amount are required" });
  }

  try {
    // Calculate dynamic cost
    const { costFry, expectedMicro, assetId } = await calculateExpectedPayment("swap", req.chainId);

    // Verify payment
    const payment = await verifyFryPaymentWithRetry(txId, expectedMicro, wallet, req.chainId, assetId);
    if (!payment.verified) {
      return res.status(402).json({ success: false, message: payment.error });
    }

    // Create pending interaction
    const fryPrice = await getFryUsdPrice().catch(() => 0);
    const interaction = await AiInteraction.create({
      walletAddress: wallet,
      interactionType: "swap_analysis",
      paymentTxId: txId,
      paymentAmount: expectedMicro,
      fryPriceAtTime: fryPrice,
      status: "pending",
    });

    const swapData = {
      fromToken,
      toToken,
      amount,
      priceImpact: priceImpact || "unknown",
      route: req.body.route || null,
    };

    // Call Claude
    const result = await claudeService.analyzeSwap(swapData);

    // Update interaction
    await AiInteraction.findByIdAndUpdate(interaction._id, {
      prompt: JSON.stringify(swapData),
      response: result.analysis,
      tokensUsed: result.tokensUsed,
      apiCost: result.apiCost,
      status: "completed",
    });

    res.status(200).json({
      success: true,
      data: {
        analysis: result.analysis,
        cost: costFry,
        interactionId: interaction._id,
      },
    });
  } catch (err) {
    logger.error("aiController.analyzeSwap error:", err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Transaction already used" });
    }
    res.status(500).json({ success: false, message: "Analysis failed" });
  }
};

module.exports = { getPrices, analyzePool, analyzePortfolio, analyzeSwap };
