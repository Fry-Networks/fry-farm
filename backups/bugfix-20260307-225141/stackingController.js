const logger = require("../config/logger");
const Staking = require("../models/stakingSchema");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get all staking data
const getAllStakingData = async(req, res) => {
    try {
        const { tokenName } = req.query;

        const query = tokenName ?
            { 'stakeToken.name': { $regex: escapeRegex(tokenName), $options: 'i' } } :
            {};


        const stakingData = await Staking.find(query);

        res.status(200).json({
            success: true,
            message: stakingData.length === 0 ?
                (tokenName ? `No staking data found for token: ${tokenName}` : "No staking data found.") :
                "Staking data fetched successfully.",
            data: stakingData,
        });
    } catch (error) {
        logger.error("Error fetching staking data:", error);

        res.status(500).json({
            success: false,
            message: "An error occurred while fetching staking data.",
            error: error.message,
        });
    }
};


// Get staking data by creatorId
const getStakingDataByCreatorId = async(req, res) => {
    const { creatorId } = req.params;
    const { tokenName } = req.query; // Get tokenName from query parameters
    try {
        // Build the query to include creatorId and optionally tokenName
        const query = { creatorId };

        // If tokenName is provided, add filter for stakeToken.name
        if (tokenName) {
            query['stakeToken.name'] = { $regex: escapeRegex(tokenName), $options: 'i' }; // Case-insensitive search
        }

        // Fetch the staking data based on the query
        const stakingData = await Staking.find(query);

        res.status(200).json({
            success: true,
            message: stakingData.length === 0 ?
                (tokenName ? `No staking data found for token: ${tokenName}` : "No staking data found.") :
                "Staking data fetched successfully.",
            data: stakingData,
        });
    } catch (error) {
        logger.error("Error fetching staking data:", error);

        res.status(500).json({
            success: false,
            message: "An error occurred while fetching staking data.",
            error: error.message,
        });
    }
};

// Get staking data by ID
const getStakingDataById = async(req, res) => {
    const { id } = req.params;

    try {
        const stakingData = await Staking.findById(id);

        if (!stakingData) {
            return res.status(404).json({
                success: false,
                message: `Staking data with ID ${id} not found.`,
            });
        }

        res.status(200).json({
            success: true,
            message: "Staking data fetched successfully.",
            data: stakingData,
        });
    } catch (error) {
        logger.error("Error fetching staking data by ID:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred while fetching staking data.",
            error: error.message,
        });
    }
};

// Get staking data by contract ID (appId)
const getStakingDataByContractId = async(req, res) => {
    const { contractId } = req.params;

    try {
        const stakingData = await Staking.find({ stakingContractId: contractId });

        res.status(200).json({
            success: true,
            message: stakingData.length === 0
                ? `No staking data found for contract ID: ${contractId}`
                : "Staking data fetched successfully.",
            data: stakingData,
        });
    } catch (error) {
        logger.error("Error fetching staking data by contract ID:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred while fetching staking data.",
            error: error.message,
        });
    }
};

// Add staking data
const addStakingData = async(req, res) => {
    const {
        creatorId,
        stakeToken,
        rewardToken,
        stakingStartTime,
        stakingEndTime,
        stakingTime,
        duration,
        aprRate,
        rewardTokenAmount,
        stakingContractId,
        lockPeriod,
    } = req.body;

    try {


        const newStakingData = new Staking({
            creatorId,
            stakeToken,
            rewardToken,
            stakingStartTime,
            stakingEndTime,
            stakingTime,
            duration,
            aprRate,
            rewardTokenAmount,
            stakingContractId,
            lockPeriod,
        });

        const savedStakingData = await newStakingData.save();

        res.status(201).json({
            success: true,
            message: "Staking data added successfully.",
            data: savedStakingData,
        });
    } catch (error) {

        logger.error("Error adding staking data:", error);

        res.status(500).json({
            success: false,
            message: "An error occurred while adding staking data.",
            error: error.message,
        });
    }
};


// Update staking data by ID
const updateStakingData = async(req, res) => {
    const { id } = req.params;
    const { totalStakers, ...updatedData } = req.body; // Extract totalStakers and other fields

    try {
        // Fetch the current data to get the existing totalStakers value
        const currentData = await Staking.findById(id);

        if (!currentData) {
            return res.status(404).json({
                success: false,
                message: `Staking data with ID ${id} not found.`,
            });
        }

        const currentTotalStakers = currentData.totalStakers || 0;
        const newTotalStakers = currentTotalStakers + (totalStakers || 0);


        const updatedStakingData = await Staking.findByIdAndUpdate(
            id, {
                $set: {
                    ...updatedData,
                    totalStakers: newTotalStakers,
                },
            }, { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: `Staking data with ID ${id} updated successfully.`,
            updatedData: updatedStakingData,
        });
    } catch (error) {
        logger.error("Error updating staking data:", error);

        res.status(500).json({
            success: false,
            message: "An error occurred while updating staking data.",
            error: error.message,
        });
    }
};



// Delete staking data by ID
const deleteStakingData = async(req, res) => {
    const { id } = req.params;

    try {

        const deletedData = await Staking.findByIdAndDelete(id);


        if (!deletedData) {
            return res.status(404).json({
                success: false,
                message: `Staking data with ID ${id} not found.`,
            });
        }


        res.status(200).json({
            success: true,
            message: `Staking data with ID ${id} deleted successfully.`,
            deletedId: id,
        });
    } catch (error) {
        logger.error("Error deleting staking data:", error);

        res.status(500).json({
            success: false,
            message: "An error occurred while deleting staking data.",
            error: error.message,
        });
    }
};



module.exports = {
    getAllStakingData,
    getStakingDataById,
    getStakingDataByCreatorId,
    getStakingDataByContractId,
    addStakingData,
    updateStakingData,
    deleteStakingData,
};