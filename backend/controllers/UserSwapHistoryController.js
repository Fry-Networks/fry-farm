const logger = require("../config/logger");
const UserSwapHistory = require("../models/userSwapHistorySchema");


// Get all user swap history
const getAllUserSwapHistory = async (req, res) => {
  try {
   
    const userSwapHistory = await UserSwapHistory.find();

    if (!userSwapHistory || userSwapHistory.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No user swap history records found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "User swap history records fetched successfully.",
      data: userSwapHistory,
    });
  } catch (error) {
  
    logger.error("Error fetching user swap history:", error);

    res.status(500).json({
      success: false,
      message: "An error occurred while fetching user swap history.",
      error: error.message,
    });
  }
};

// Get user swap history by userId
const getUserSwapHistoryByUserId = async (req, res) => {
    const { userId } = req.params; 

    try {
      
      const userSwapHistory = await UserSwapHistory.find({ userId });
  
      if (!userSwapHistory || userSwapHistory.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No swap history found for user with ID: ${userId}`,
        });
      }
  
      res.status(200).json({
        success: true,
        message: `User swap history for user ID: ${userId} fetched successfully.`,
        data: userSwapHistory,
      });
    } catch (error) {
  
      logger.error("Error fetching user swap history by userId:", error);

      res.status(500).json({
        success: false,
        message: "An error occurred while fetching user swap history.",
        error: error.message,
      });
    }
  };

// Add user swap history
const addUserSwapHistory = async (req, res) => {
  try {
    const { userId, amount, token1, token2, liquidityPoolId, fee } = req.body;

    if (!userId || amount == null || !token1 || !token2 || !liquidityPoolId || fee == null) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const newSwapHistory = new UserSwapHistory({
      userId,
      amount,
      token1: {
        id: token1.id,
        name: token1.name,
      },
      token2: {
        id: token2.id,
        name: token2.name,
      },
      liquidityPoolId,
      fee,
    });

    const savedSwapHistory = await newSwapHistory.save();

    res.status(201).json({
      success: true,
      message: "User swap history added successfully.",
      data: savedSwapHistory,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "An error occurred while adding swap history.",
      error: error.message,
    });
  }
};

// delete user swap history
const deleteUserSwapHistory = async (req, res) => {

    const { id } = req.params; 

    try {
    
      const deletedSwapHistory = await UserSwapHistory.findByIdAndDelete(id);
 
      if (!deletedSwapHistory) {
        return res.status(404).json({
          success: false,
          message: `No swap history found with ID: ${id}`,
        });
      }
  
      res.status(200).json({
        success: true,
        message: `Swap history with ID: ${id} deleted successfully.`,
        data: deletedSwapHistory,
      });
    } catch (error) {

      logger.error("Error deleting swap history:", error);

      res.status(500).json({
        success: false,
        message: "An error occurred while deleting swap history.",
        error: error.message,
      });
    }

}

// updateUserSwapHistory
const updateUserSwapHistory = async (req, res) => {
    const { id } = req.params; 
    const updatedData = req.body; 
  
    try {
      
      if (!updatedData || Object.keys(updatedData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No data provided for update.",
        });
      }
  
      const userSwapHistory = await UserSwapHistory.findById(id);
  
      if (!userSwapHistory) {
        return res.status(404).json({
          success: false,
          message: `No swap history found for the given ID: ${id}`,
        });
      }
  
      const updatedUserSwapHistory = await UserSwapHistory.findByIdAndUpdate(id, updatedData, { new: true });
  
      res.status(200).json({
        success: true,
        message: `Swap history with ID: ${id} has been successfully updated.`,
        data: updatedUserSwapHistory,
      });
    } catch (error) {
      
      logger.error("Error updating user swap history by _id:", error);
  
      res.status(500).json({
        success: false,
        message: "An error occurred while updating user swap history.",
        error: error.message,
      });
    }
  };

module.exports = {
  getAllUserSwapHistory,
  getUserSwapHistoryByUserId,
  addUserSwapHistory,
  deleteUserSwapHistory,
  updateUserSwapHistory
};
