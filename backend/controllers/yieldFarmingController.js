const logger = require("../config/logger");
const YieldFarming = require('../models/yieldFarmingSchema');

// Get all yield farming data
const getAllYieldFarmingData = async (req, res) => {
    try {
      // Fetch all yield farming data from the database
      const yieldFarmingData = await YieldFarming.find();
  
      // Check if any data exists
      if (!yieldFarmingData || yieldFarmingData.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No yield farming data found.",
        });
      }
  
      // Send success response
      res.status(200).json({
        success: true,
        message: "Yield farming data fetched successfully.",
        data: yieldFarmingData,
      });
    } catch (error) {
      // Log the error for debugging
      logger.error("Error fetching yield farming data:", error);
  
      // Send error response
      res.status(500).json({
        success: false,
        message: "An error occurred while fetching yield farming data.",
        error: error.message,
      });
    }
  };
  
// Add yield farming data
const addYieldFarmingData = async (req, res) => {
    try {
     
      const {
        poolCreator,
        poolId,
        token1,
        token2,
        totalLiquidityProviders,
        rewardToken,
        apy,
        duration,
        startTime,
        endTime,
        tvc,
        rewardsDistributed,
      } = req.body;

      // Validate required fields
      if (
        !poolCreator ||
        !poolId ||
        !token1 ||
        !token2 ||
        totalLiquidityProviders == null ||
        !rewardToken ||
        apy == null ||
        duration == null ||
        startTime == null ||
        endTime == null ||
        tvc == null ||
        rewardsDistributed == null
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are required.",
        });
      }
  
      // Create a new yield farming document
      const newYieldFarming = new YieldFarming({
        poolCreator,
        poolId,
        token1,
        token2,
        totalLiquidityProviders,
        rewardToken,
        apy,
        duration,
        startTime,
        endTime,
        tvc,
        rewardsDistributed,
      });
  
      // Save the document to the database
      const savedYieldFarming = await newYieldFarming.save();
  
      // Send success response
      res.status(201).json({
        success: true,
        message: "Yield farming data added successfully.",
        data: savedYieldFarming,
      });
    } catch (error) {
      // Log the error for debugging
      logger.error("Error adding yield farming data:", error);
  
      // Send error response
      res.status(500).json({
        success: false,
        message: "An error occurred while adding yield farming data.",
        error: error.message,
      });
    }
  };
  
// get yield farming data by walletId
const getYieldFarmingDataByWalletId = async (req, res) => {
    const { walletId } = req.params;

    try {
      const yieldFarmingData = await YieldFarming.find({ poolCreator: walletId });

      if (!yieldFarmingData || yieldFarmingData.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No yield farming data found for wallet: ${walletId}`,
        });
      }

      res.status(200).json({
        success: true,
        message: "Yield farming data fetched successfully.",
        data: yieldFarmingData,
      });
    } catch (error) {
      logger.error("Error fetching yield farming data by walletId:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while fetching yield farming data.",
        error: error.message,
      });
    }
  };

// Delete yield farming data
const deleteYieldFarmingData = async (req, res) => {
    const { id } = req.params; 
  
    try {
      
      const deletedData = await YieldFarming.findByIdAndDelete(id);
  
      if (!deletedData) {
        return res.status(404).json({
          success: false,
          message: `Yield farming data with ID ${id} not found.`,
        });
      }
  
      res.status(200).json({
        success: true,
        message: `Yield farming data with ID ${id} deleted successfully.`,
        deletedData,
      });
    } catch (error) {
    
      logger.error("Error deleting yield farming data:", error);
  
      
      res.status(500).json({
        success: false,
        message: "An error occurred while deleting yield farming data.",
        error: error.message,
      });
    }
  };  

// Update yield farming data
const updateYieldFarmingData = async (req, res) => {
    const { id } = req.params; 
    const updatedData = req.body; 
  
    try {
    
      if (!updatedData || Object.keys(updatedData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No data provided for update.",
        });
      }
  
      const updatedYieldFarming = await YieldFarming.findByIdAndUpdate(
        id,
        updatedData,
        { new: true, runValidators: true } 
      );
  
      if (!updatedYieldFarming) {
        return res.status(404).json({
          success: false,
          message: `Yield farming data with ID ${id} not found.`,
        });
      }
  
      res.status(200).json({
        success: true,
        message: `Yield farming data with ID ${id} updated successfully.`,
        data: updatedYieldFarming,
      });
    } catch (error) {
      
      logger.error("Error updating yield farming data:", error);
  
      res.status(500).json({
        success: false,
        message: "An error occurred while updating yield farming data.",
        error: error.message,
      });
    }
  };
  
  
  
module.exports = {
    getAllYieldFarmingData,
    addYieldFarmingData,
    getYieldFarmingDataByWalletId,
    deleteYieldFarmingData,
    updateYieldFarmingData
};