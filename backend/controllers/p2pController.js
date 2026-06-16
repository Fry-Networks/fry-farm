const logger = require('../config/logger');
const P2PMarket = require('../models/p2pMarketSchema');
const P2POffer = require('../models/p2pOfferSchema');
const P2PTrade = require('../models/p2pTradeSchema');
const {
  verifyMarketDeployment,
  verifyOfferExists,
  verifyOfferFilled,
  verifyOfferCancelled,
  STATUS_OPEN,
} = require('../services/p2pVerificationService');

// ── Public read endpoints ────────────────────────────────────

const getMarkets = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const markets = await P2PMarket.find({ chainId, isActive: true, isPrivate: { $ne: true } }).sort({ createdAt: -1 });

    // Enrich with open offer counts
    const offerCounts = await P2POffer.aggregate([
      { $match: { chainId, status: 'open' } },
      { $group: { _id: '$marketAppId', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(offerCounts.map(c => [c._id, c.count]));
    const enriched = markets.map(m => ({
      ...m.toObject(),
      openOfferCount: countMap[m.appId] || 0,
    }));

    res.status(200).json({
      success: true,
      message: 'Markets fetched successfully.',
      data: enriched,
    });
  } catch (error) {
    logger.error('P2P getMarkets error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching markets.',
      error: error.message,
    });
  }
};

const getMarketDetail = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const appId = Number(req.params.appId);

    let market = await P2PMarket.findOne({ chainId, appId });

    // Cross-chain fallback: if not found on the requested chain, try any chain.
    // Enables shared market links to work regardless of the user's current chain.
    if (!market) {
      market = await P2PMarket.findOne({ appId });
    }

    if (!market) {
      return res.status(404).json({
        success: false,
        message: 'Market not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Market fetched successfully.',
      data: market,
    });
  } catch (error) {
    logger.error('P2P getMarketDetail error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching market detail.',
      error: error.message,
    });
  }
};

const getOffers = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const {
      marketAppId,
      status = 'open',
      makerWallet,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
    } = req.query;

    const query = { chainId };
    if (marketAppId) query.marketAppId = Number(marketAppId);
    if (status) query.status = status;
    if (makerWallet) query.makerWallet = makerWallet;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const allowedSorts = ['createdAt', 'offerAmount', 'requestAmount'];
    const sortField = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';

    const [offers, total] = await Promise.all([
      P2POffer.find(query).sort({ [sortField]: -1 }).skip(skip).limit(limitNum),
      P2POffer.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: 'Offers fetched successfully.',
      data: offers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('P2P getOffers error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching offers.',
      error: error.message,
    });
  }
};

const getOffer = async (req, res) => {
  try {
    const { chainId, marketAppId, offerId } = req.params;

    const offer = await P2POffer.findOne({
      chainId,
      marketAppId: Number(marketAppId),
      offerId: Number(offerId),
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Offer fetched successfully.',
      data: offer,
    });
  } catch (error) {
    logger.error('P2P getOffer error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching offer.',
      error: error.message,
    });
  }
};

// ── Authenticated read endpoints ─────────────────────────────

const getMyOffers = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const wallet = req.user.wallet;
    const { status, marketAppId, page = 1, limit = 50 } = req.query;

    const query = { makerWallet: wallet, chainId };
    if (status) query.status = status;
    if (marketAppId) query.marketAppId = Number(marketAppId);

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [offers, total] = await Promise.all([
      P2POffer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      P2POffer.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: 'Your offers fetched successfully.',
      data: offers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('P2P getMyOffers error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching your offers.',
      error: error.message,
    });
  }
};

const getHistory = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const wallet = req.user.wallet;
    const { marketAppId, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      chainId,
      $or: [{ makerWallet: wallet }, { takerWallet: wallet }],
    };
    if (marketAppId) query.marketAppId = Number(marketAppId);

    const [trades, total] = await Promise.all([
      P2PTrade.find(query).sort({ settledAt: -1 }).skip(skip).limit(limitNum),
      P2PTrade.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: 'Trade history fetched successfully.',
      data: trades,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('P2P getHistory error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching trade history.',
      error: error.message,
    });
  }
};

const getReputation = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const { walletAddress } = req.params;

    const [asMaker, asTaker] = await Promise.all([
      P2PTrade.aggregate([
        { $match: { chainId, makerWallet: walletAddress } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalVolume: { $sum: { $toLong: '$offerAmount' } },
            firstTrade: { $min: '$settledAt' },
          },
        },
      ]),
      P2PTrade.aggregate([
        { $match: { chainId, takerWallet: walletAddress } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalVolume: { $sum: { $toLong: '$requestAmount' } },
            firstTrade: { $min: '$settledAt' },
          },
        },
      ]),
    ]);

    const makerStats = asMaker[0] || { count: 0, totalVolume: 0, firstTrade: null };
    const takerStats = asTaker[0] || { count: 0, totalVolume: 0, firstTrade: null };

    const totalTrades = makerStats.count + takerStats.count;
    const memberSince = makerStats.firstTrade && takerStats.firstTrade
      ? new Date(Math.min(makerStats.firstTrade, takerStats.firstTrade))
      : makerStats.firstTrade || takerStats.firstTrade || null;

    res.status(200).json({
      success: true,
      message: 'Reputation fetched successfully.',
      data: {
        walletAddress,
        totalTrades,
        asMaker: makerStats.count,
        asTaker: takerStats.count,
        totalVolume: String(makerStats.totalVolume + takerStats.totalVolume),
        memberSince,
      },
    });
  } catch (error) {
    logger.error('P2P getReputation error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching reputation.',
      error: error.message,
    });
  }
};

const getMarketStats = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const appId = Number(req.params.appId);

    const [openOffers, totalOffers, tradeAgg] = await Promise.all([
      P2POffer.countDocuments({ chainId, marketAppId: appId, status: 'open' }),
      P2POffer.countDocuments({ chainId, marketAppId: appId }),
      P2PTrade.aggregate([
        { $match: { chainId, marketAppId: appId } },
        {
          $group: {
            _id: null,
            totalTrades: { $sum: 1 },
            totalOfferVolume: { $sum: { $toLong: '$offerAmount' } },
            totalRequestVolume: { $sum: { $toLong: '$requestAmount' } },
            totalFees: { $sum: { $toLong: '$feeAmount' } },
            firstTrade: { $min: '$settledAt' },
            lastTrade: { $max: '$settledAt' },
          },
        },
      ]),
    ]);

    const stats = tradeAgg[0] || {
      totalTrades: 0, totalOfferVolume: 0, totalRequestVolume: 0,
      totalFees: 0, firstTrade: null, lastTrade: null,
    };

    res.status(200).json({
      success: true,
      message: 'Market stats fetched successfully.',
      data: {
        appId,
        openOffers,
        totalOffers,
        totalTrades: stats.totalTrades,
        totalOfferVolume: String(stats.totalOfferVolume),
        totalRequestVolume: String(stats.totalRequestVolume),
        totalFees: String(stats.totalFees),
        firstTrade: stats.firstTrade,
        lastTrade: stats.lastTrade,
      },
    });
  } catch (error) {
    logger.error('P2P getMarketStats error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching market stats.',
      error: error.message,
    });
  }
};

const getMarketTrades = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const appId = Number(req.params.appId);
    const { page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const query = { chainId, marketAppId: appId };

    const [trades, total] = await Promise.all([
      P2PTrade.find(query).sort({ settledAt: -1 }).skip(skip).limit(limitNum),
      P2PTrade.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: 'Market trades fetched successfully.',
      data: trades,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('P2P getMarketTrades error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching market trades.',
      error: error.message,
    });
  }
};

// ── Authenticated write endpoints ────────────────────────────

const createMarket = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const wallet = req.user.wallet;

    // Check feature flag
    if (!req.chainConfig?.features?.p2pSwap) {
      return res.status(400).json({
        success: false,
        message: 'P2P swap is not enabled on this chain.',
      });
    }

    const { appId, deployTxId, offerAssetId, requestAssetId, feeBps,
            offerAssetName, offerAssetSymbol, requestAssetName, requestAssetSymbol } = req.body;

    // Check for existing market
    const existing = await P2PMarket.findOne({ chainId, appId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Market with this appId is already registered.',
      });
    }

    // Verify on-chain: app exists and creator matches sender
    const verification = await verifyMarketDeployment(chainId, appId, wallet);
    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: 'On-chain verification failed.',
        error: verification.error,
      });
    }

    const market = await P2PMarket.create({
      chainId,
      appId,
      appAddress: verification.appAddress,
      offerAssetId,
      offerAssetName: offerAssetName || '',
      offerAssetSymbol: offerAssetSymbol || '',
      requestAssetId,
      requestAssetName: requestAssetName || '',
      requestAssetSymbol: requestAssetSymbol || '',
      creator: wallet,
      feeRecipient: req.chainConfig.feeRecipient,
      feeBps,
      isActive: true,
      isPrivate: req.body.isPrivate || false,
      gatedWallet: req.body.gatedWallet || '',
      deployTxId: deployTxId || undefined,
    });

    logger.info(`P2P market created: appId=${appId} chain=${chainId} by ${wallet.slice(0, 8)}...`);

    res.status(201).json({
      success: true,
      message: 'Market registered successfully.',
      data: market,
    });
  } catch (error) {
    logger.error('P2P createMarket error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while registering market.',
      error: error.message,
    });
  }
};

const createOffer = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const wallet = req.user.wallet;

    const { marketAppId, offerId, escrowTxId, offerAmount, requestAmount,
            offerType, counterparty, expiresAt } = req.body;

    // Verify market exists and is active
    const market = await P2PMarket.findOne({ chainId, appId: marketAppId, isActive: true });
    if (!market) {
      return res.status(404).json({
        success: false,
        message: 'Market not found or inactive.',
      });
    }

    // Check for duplicate offer
    const existing = await P2POffer.findOne({ chainId, marketAppId, offerId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Offer with this ID already exists.',
      });
    }

    // Verify on-chain: offer box exists with status=open and maker matches
    const verification = await verifyOfferExists(chainId, marketAppId, offerId);
    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: 'On-chain offer verification failed.',
        error: verification.error,
      });
    }

    const onChain = verification.data;
    if (onChain.status !== STATUS_OPEN) {
      return res.status(400).json({
        success: false,
        message: `On-chain offer status is ${onChain.status}, expected 0 (open).`,
      });
    }

    if (onChain.maker !== wallet) {
      return res.status(403).json({
        success: false,
        message: 'On-chain offer maker does not match your wallet.',
      });
    }

    const offer = await P2POffer.create({
      chainId,
      marketAppId,
      offerId,
      makerWallet: wallet,
      offerAmount: String(offerAmount),
      requestAmount: String(requestAmount),
      offerType: offerType || 'public',
      counterparty: counterparty || '',
      expiresAt: expiresAt || null,
      escrowTxId,
      feeTxId: req.feeVerification?.txId || '',
      platformFeeAmount: req.feeVerification?.amount ? String(req.feeVerification.amount) : '0',
    });

    logger.info(`P2P offer created: offerId=${offerId} market=${marketAppId} by ${wallet.slice(0, 8)}...`);

    res.status(201).json({
      success: true,
      message: 'Offer recorded successfully.',
      data: offer,
    });
  } catch (error) {
    logger.error('P2P createOffer error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while recording offer.',
      error: error.message,
    });
  }
};

const acceptOffer = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const wallet = req.user.wallet;
    const onChainOfferId = Number(req.params.offerId);

    const { marketAppId, settlementTxId, requestAmount: bodyRequestAmount } = req.body;

    // 1. Read offer (non-mutating) for pre-validation
    const offer = await P2POffer.findOne({
      chainId,
      marketAppId,
      offerId: onChainOfferId,
      status: 'open',
    });

    if (!offer) {
      return res.status(409).json({
        success: false,
        message: 'Offer not found, already filled, or cancelled.',
      });
    }

    // 2. Business rule checks before any DB mutation
    if (offer.makerWallet === wallet) {
      return res.status(400).json({
        success: false,
        message: 'Maker cannot accept their own offer.',
      });
    }

    if (offer.counterparty && offer.counterparty !== wallet) {
      return res.status(403).json({
        success: false,
        message: 'This is a private offer not addressed to your wallet.',
      });
    }

    if (bodyRequestAmount && Number(offer.requestAmount) !== bodyRequestAmount) {
      return res.status(400).json({
        success: false,
        message: 'Request amount mismatch.',
      });
    }

    // 2.5 Reject expired offers
    if (offer.expiresAt && new Date() > new Date(offer.expiresAt)) {
      return res.status(400).json({
        success: false,
        message: 'Offer has expired.',
      });
    }

    // 3. Verify on-chain: offer is filled
    const verification = await verifyOfferFilled(chainId, marketAppId, onChainOfferId);
    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: 'On-chain fill verification failed.',
        error: verification.error,
      });
    }

    // 4. Atomic claim — only one concurrent accept wins
    const updated = await P2POffer.findOneAndUpdate(
      {
        _id: offer._id,
        status: 'open',
      },
      {
        $set: {
          status: 'filled',
          takerWallet: wallet,
          settlementTxId,
          settledAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: 'Offer was claimed by another user.',
      });
    }

    // 5. Fetch market for asset info and write trade audit log
    const market = await P2PMarket.findOne({ chainId, appId: marketAppId });

    await P2PTrade.create({
      chainId,
      marketAppId,
      offerId: onChainOfferId,
      makerWallet: offer.makerWallet,
      takerWallet: wallet,
      offerAssetId: market?.offerAssetId,
      offerAmount: offer.offerAmount,
      requestAssetId: market?.requestAssetId,
      requestAmount: offer.requestAmount,
      feeAmount: req.feeVerification?.amount ? String(req.feeVerification.amount) : '0',
      feeRecipient: market?.feeRecipient || '',
      settlementTxId,
      settledAt: new Date(),
    });

    logger.info(
      `P2P offer accepted: offerId=${onChainOfferId} market=${marketAppId} taker=${wallet.slice(0, 8)}...`
    );

    res.status(200).json({
      success: true,
      message: 'Offer accepted successfully.',
      data: updated,
    });
  } catch (error) {
    logger.error('P2P acceptOffer error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while accepting offer.',
      error: error.message,
    });
  }
};

const cancelOffer = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const wallet = req.user.wallet;
    const onChainOfferId = Number(req.params.offerId);

    const { marketAppId, cancelTxId } = req.body;

    // 1. Read offer for pre-validation
    const offer = await P2POffer.findOne({
      chainId,
      marketAppId,
      offerId: onChainOfferId,
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found.',
      });
    }

    if (offer.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel offer with status "${offer.status}".`,
      });
    }

    if (offer.makerWallet !== wallet) {
      return res.status(403).json({
        success: false,
        message: 'Only the offer maker can cancel.',
      });
    }

    // 2. Verify on-chain: offer is cancelled
    const verification = await verifyOfferCancelled(chainId, marketAppId, onChainOfferId);
    if (!verification.verified) {
      return res.status(400).json({
        success: false,
        message: 'On-chain cancel verification failed.',
        error: verification.error,
      });
    }

    // 3. Atomic update — prevents race conditions
    const updated = await P2POffer.findOneAndUpdate(
      {
        _id: offer._id,
        status: 'open',
        makerWallet: wallet,
      },
      {
        $set: {
          status: 'cancelled',
          cancelTxId,
          cancelledAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: 'Offer was already filled or cancelled.',
      });
    }

    logger.info(
      `P2P offer cancelled: offerId=${onChainOfferId} market=${marketAppId} by ${wallet.slice(0, 8)}...`
    );

    res.status(200).json({
      success: true,
      message: 'Offer cancelled successfully.',
      data: updated,
    });
  } catch (error) {
    logger.error('P2P cancelOffer error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while cancelling offer.',
      error: error.message,
    });
  }
};

module.exports = {
  getMarkets,
  getMarketDetail,
  getMarketStats,
  getMarketTrades,
  getOffers,
  getOffer,
  getMyOffers,
  getHistory,
  getReputation,
  createMarket,
  createOffer,
  acceptOffer,
  cancelOffer,
};
