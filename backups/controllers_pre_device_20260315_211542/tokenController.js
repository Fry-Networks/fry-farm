const logger = require("../config/logger");
const Token = require("../models/tokensSchema");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getAllTokens = async (req, res) => {
  try {
    const tokens = await Token.find();
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
    const tokens = await Token.find({
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

module.exports = {
    getAllTokens,
    addToken,
    updateToken,
    deleteToken,
    searchTokenByName,
};