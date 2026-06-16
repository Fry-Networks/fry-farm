const logger = require("../config/logger");
const  StakerData = require("../models/stakerDataSchema");

// get all staker data
const getAllStakerData = async (req, res) => {
    try {
      
      const stakerData = await StakerData.find();
  
      if (!stakerData || stakerData.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No staker data found.",
        });
      }
  
      res.status(200).json({
        success: true,
        message: "All staker data fetched successfully.",
        data: stakerData,
      });
    } catch (error) {
      
      logger.error("Error fetching staker data:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while fetching staker data.",
        error: error.message,
      });
    }
  };
// get staker data by wallet id
const getStakerDataByWalletId = async (req, res) => {
    const { walletId } = req.params; 
  
    try {
  
      const stakerData = await StakerData.find({ walletId });
  
 
      if (stakerData.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }
  
      res.status(200).json({
        success: true,
        message: `Staker data for wallet ID: ${walletId} fetched successfully.`,
        data: stakerData,
      });
    } catch (error) {
 
      logger.error("Error fetching staker data by wallet ID:", error);
  
      res.status(500).json({
        success: false,
        message: "An error occurred while fetching staker data.",
        error: error.message,
      });
    }
  };
  

  



// addStakerData controller
const addStakerData = async (req, res) => {
    try {
      const { walletId, stakedAmount, stakeTime, poolId, rewardClaimed, feeTxId, feeAssetId } = req.body;

      if (!walletId || stakedAmount == null || stakeTime == null || !poolId) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: walletId, stakedAmount, stakeTime, or poolId.",
        });
      }

      // Verify wallet matches authenticated user
      if (walletId !== req.user.wallet) {
        return res.status(403).json({
          success: false,
          message: "Wallet does not match authenticated user",
        });
      }

      const chainId = req.chainId || 'algorand-mainnet';
      const newStakerData = new StakerData({
        chainId,
        walletId,
        stakedAmount,
        stakeTime,
        poolId,
        rewardClaimed: rewardClaimed || 0,
        feeTxId: feeTxId || '',
        feeAssetId: feeAssetId || 0,
      });
  
      const savedStakerData = await newStakerData.save();
  
      res.status(201).json({
        success: true,
        message: "Staker data added successfully.",
        data: savedStakerData,
      });
    } catch (error) {
  
      logger.error("Error adding staker data:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while adding staker data.",
        error: error.message,
      });
    }
  };
  
// delete staker data
const deleteStakerData = async (req, res) => {
    const { id } = req.params; 

    try {

        const deletedStakerData = await StakerData.findByIdAndDelete(id);

       
        if (!deletedStakerData) {
            return res.status(404).json({
                success: false,
                message: "Staker data not found.",
            });
        }

      
        res.status(200).json({
            success: true,
            message: "Staker data deleted successfully.",
            data: deletedStakerData,
        });
    } catch (error) {
      
        logger.error("Error deleting staker data:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred while deleting staker data.",
            error: error.message,
        });
    }
}

// Update staker data by ID
const updateStakerData = async (req, res) => {
    const { id } = req.params; 
    const updatedData = req.body; 
  
    try {
      
      const stakerData = await StakerData.findByIdAndUpdate(id, updatedData, {
        new: true, 
        runValidators: true, 
      });
  
  
      if (!stakerData) {
        return res.status(404).json({
          success: false,
          message: `Staker data with ID ${id} not found.`,
        });
      }
  
    
      res.status(200).json({
        success: true,
        message: `Staker data with ID ${id} updated successfully.`,
        data: stakerData,
      });
    } catch (error) {
 
      logger.error("Error updating staker data:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred while updating staker data.",
        error: error.message,
      });
    }
  };
  

  

module.exports = {
    getAllStakerData,
    getStakerDataByWalletId,
    addStakerData,
    deleteStakerData,
    updateStakerData
};