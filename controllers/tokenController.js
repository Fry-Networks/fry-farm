const logger = require("../config/logger");
const Token = require("../models/tokensSchema");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getAllTokens = async (req, res) => {
  try {
    const filter = req.chainId ? { chainId: req.chainId } : {};
    const tokens = await Token.find(filter);
    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No tokens found.",
      });
    }
    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    logger.error("Error fetching all tokens:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching tokens.",
      error: error.message,
    });
  }
};


const addToken = async (req, res) => {
    const { tokenId, tokenName,tokenSymbol, tokenImage } = req.body;
  
    // Simple validation (tokenId can be 0 for ALGO, so check explicitly for undefined/null)
    if ((tokenId === undefined || tokenId === null) || !tokenName || !tokenSymbol || !tokenImage) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: tokenId, tokenName, tokenSymbol, tokenImage.",
      });
    }
  
    try {
      const newToken = new Token({
        tokenId,
        tokenName,
        tokenSymbol,
        tokenImage,
      });
  
      await newToken.save(); // Save the new token to the database
      res.status(201).json({
        success: true,
        message: "Token added successfully.",
        data: newToken,
      });
    } catch (error) {
      logger.error("Error adding token:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while adding the token.",
        error: error.message,
      });
    }
  };
  

  const updateToken = async (req, res) => {
    const { id } = req.params;
    const { tokenId, tokenName, tokenSymbol, tokenImage } = req.body;

    if (!tokenId || !tokenName || !tokenSymbol || !tokenImage) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: tokenId, tokenName, tokenSymbol, tokenImage.",
      });
    }

    try {
      const updatedToken = await Token.findByIdAndUpdate(
        id,
        { tokenId, tokenName, tokenSymbol, tokenImage },
        { new: true, runValidators: true }
      );
  
      if (!updatedToken) {
        return res.status(404).json({
          success: false,
          message: `Token with ID ${id} not found.`,
        });
      }
  
      res.status(200).json({
        success: true,
        message: "Token updated successfully.",
        data: updatedToken,
      });
    } catch (error) {
      logger.error("Error updating token:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while updating the token.",
        error: error.message,
      });
    }
  };
  

const deleteToken = async (req, res) => {
    const { id } = req.params; 
  
    try {
      const deletedToken = await Token.findByIdAndDelete(id);
  
      if (!deletedToken) {
        return res.status(404).json({
          success: false,
          message: `Token with ID ${id} not found.`,
        });
      }
  
      res.status(200).json({
        success: true,
        message: `Token with ID ${id} deleted successfully.`,
        deletedId: id,
      });
    } catch (error) {
      logger.error("Error deleting token:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while deleting the token.",
        error: error.message,
      });
    }
  };
  

const searchTokenByName = async (req, res) => {
  try {
    const { tokenName } = req.params;
    
    if (!tokenName) {
      return res.status(400).json({
        success: false,
        message: "Token name is required.",
      });
    }

    // Case-insensitive search using regex
    const filter = req.chainId ? { chainId: req.chainId } : {};
    const tokens = await Token.find({
      ...filter,
      tokenName: { $regex: escapeRegex(tokenName), $options: 'i' }
    });

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No tokens found with name containing "${tokenName}".`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Found ${tokens.length} token(s) matching "${tokenName}".`,
      data: tokens,
    });
  } catch (error) {
    logger.error("Error searching tokens by name:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while searching tokens.",
      error: error.message,
    });
  }
};

// --- On-demand ASA image resolution (added for HAY pool fix) ---
const getTokenImage = async (req, res) => {
  const asaId = Number(req.params.asaId);
  if (isNaN(asaId) || asaId < 0) {
    return res.status(400).json({ success: false, message: "Invalid ASA ID" });
  }

  try {
    // 1. Check DB first
    const existing = await Token.findOne({ tokenId: asaId });
    if (existing && existing.tokenImage && existing.tokenImage.startsWith("http")) {
      return res.json({ success: true, imageUrl: existing.tokenImage });
    }

    let imageUrl = null;
    let tokenName = null;
    let tokenSymbol = null;

    // 2a. Pera API (5s timeout)
    try {
      const axios = require("axios");
      const peraResp = await axios.get(
        `https://mainnet.api.perawallet.app/v1/assets/${asaId}/`,
        { timeout: 5000 }
      );
      const logo = peraResp.data?.logo;
      if (logo && typeof logo === "string" && logo.startsWith("http")) {
        imageUrl = logo;
        tokenName = peraResp.data?.name || null;
        tokenSymbol = peraResp.data?.unit_name || null;
      }
    } catch { /* Pera failed, continue */ }

    // 2b. Tinyman — GET with arraybuffer, check content-type (5s timeout)
    if (!imageUrl) {
      try {
        const axios = require("axios");
        const tinyUrl = `https://asa-list.tinyman.org/assets/${asaId}/icon.png`;
        const tinyResp = await axios.get(tinyUrl, {
          timeout: 5000,
          responseType: "arraybuffer",
          maxContentLength: 100000,
        });
        const ct = (tinyResp.headers["content-type"] || "").toLowerCase();
        if (ct.startsWith("image/")) {
          imageUrl = tinyUrl;
        }
      } catch { /* Tinyman failed, continue */ }
    }

    // 3. Cache if found (upsert to tokens collection)
    if (imageUrl) {
      const upsertData = {
        tokenId: asaId,
        tokenImage: imageUrl,
        tokenName: tokenName || `Asset ${asaId}`,
        tokenSymbol: tokenSymbol || `ASA${asaId}`,
        lastUpdated: new Date(),
      };
      await Token.findOneAndUpdate(
        { tokenId: asaId },
        { $set: upsertData, $setOnInsert: { chainId: "algorand-mainnet" } },
        { upsert: true, new: true }
      );
    }

    // 4. Return (null means no image found — let frontend show fallback)
    return res.json({ success: true, imageUrl: imageUrl });
  } catch (error) {
    logger.error(`Error resolving token image for ASA ${asaId}:`, error);
    return res.status(500).json({ success: false, message: "Failed to resolve token image" });
  }
};

module.exports = {
    getTokenImage,
    getAllTokens,
    addToken,
    updateToken,
    deleteToken,
    searchTokenByName,
};
