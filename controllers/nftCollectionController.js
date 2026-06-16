const logger = require("../config/logger");
const NftCollection = require("../models/nftCollectionSchema");
const { syncCollectionByCreator, seedFromExistingPools } = require("../services/nftCollectionSyncService");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get all collections for the active chain
const getAllCollections = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const collections = await NftCollection.find({ chainId })
      .sort({ isVerified: -1, totalSupply: -1 });

    res.status(200).json({
      success: true,
      message: collections.length === 0
        ? "No NFT collections found."
        : "NFT collections fetched successfully.",
      data: collections,
    });
  } catch (error) {
    logger.error("Error fetching NFT collections:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching NFT collections.",
      error: error.message,
    });
  }
};

// Search collections by name
const searchCollections = async (req, res) => {
  try {
    const chainId = req.chainId || 'algorand-mainnet';
    const q = req.query.q || '';

    if (q.length < 2) {
      return res.status(400).json({ success: false, message: "Search query must be at least 2 characters." });
    }

    const collections = await NftCollection.find({
      chainId,
      name: { $regex: escapeRegex(q), $options: 'i' },
    }).sort({ totalSupply: -1 }).limit(20);

    res.status(200).json({ success: true, data: collections });
  } catch (error) {
    logger.error("Error searching NFT collections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: add a creator address and trigger sync
const addCollection = async (req, res) => {
  try {
    const { creatorAddress } = req.body;
    const chainId = req.chainId || 'algorand-mainnet';

    if (!creatorAddress || creatorAddress.length < 10) {
      return res.status(400).json({ success: false, message: "Valid creatorAddress is required." });
    }

    const result = await syncCollectionByCreator(creatorAddress, chainId);

    if (!result) {
      return res.status(404).json({ success: false, message: "No NFTs found for this creator." });
    }

    res.status(201).json({
      success: true,
      message: "Collection indexed successfully.",
      data: result,
    });
  } catch (error) {
    logger.error("Error adding NFT collection:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: seed from existing pools
const seedCollections = async (req, res) => {
  try {
    const stats = await seedFromExistingPools();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    logger.error("Error seeding NFT collections:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllCollections,
  searchCollections,
  addCollection,
  seedCollections,
};
