const logger = require("../config/logger");
const Staking = require("../models/stakingSchema");
const { checkIsAdmin } = require("../middleware/auth");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get all staking data
const getAllStakingData = async(req, res) => {
    try {
        const { tokenName } = req.query;
        const chainId = req.chainId || 'algorand-mainnet';

        const query = tokenName ?
            { chainId, 'stakeToken.name': { $regex: escapeRegex(tokenName), $options: 'i' } } :
            { chainId };

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
        const chainId = req.chainId || 'algorand-mainnet';
        const query = { creatorId, chainId };

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
        const chainId = req.chainId || 'algorand-mainnet';
        const stakingData = await Staking.find({ stakingContractId: contractId, chainId });

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
        contractVersion,
    } = req.body;

    try {


        const newStakingData = new Staking({
            chainId: req.chainId || 'algorand-mainnet',
            creatorId,
            stakeToken,
            rewardToken,
            stakingStartTime,
            stakingEndTime,
            stakingTime,
            duration,
            aprRate,
            rewardTokenAmount,
            stakingContractId: String(stakingContractId),
            lockPeriod,
            contractVersion: contractVersion || 1,
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

        // Verify ownership — only pool creator or admin can update
        const isAdmin = await checkIsAdmin(req.user.wallet);
        if (currentData.creatorId !== req.user.wallet && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this pool',
            });
        }

        const currentTotalStakers = currentData.totalStakers || 0;
        const newTotalStakers = currentTotalStakers + (totalStakers || 0);


        const { totalAmountStaked, ...otherUpdatedData } = updatedData;
        const updateOperation = {
            $set: {
                ...otherUpdatedData,
                totalStakers: newTotalStakers,
            },
        };
        if (totalAmountStaked !== undefined && !isNaN(totalAmountStaked)) {
            updateOperation.$set.totalAmountStaked = totalAmountStaked;
        }
        const updatedStakingData = await Staking.findByIdAndUpdate(
            id,
            updateOperation,
            { new: true, runValidators: true }
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
        // Verify ownership before deleting
        const pool = await Staking.findById(id);
        if (!pool) {
            return res.status(404).json({
                success: false,
                message: `Staking data with ID ${id} not found.`,
            });
        }

        const isAdmin = await checkIsAdmin(req.user.wallet);
        if (pool.creatorId !== req.user.wallet && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this pool',
            });
        }

        await Staking.findByIdAndDelete(id);

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



// Admin: top up reward tokens for a depleted staking pool
const topUpPoolRewards = async (req, res) => {
    const { poolId, amount } = req.body;

    if (!poolId || !amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: "poolId and a positive amount are required",
        });
    }

    try {
        const pool = await Staking.findById(poolId);
        if (!pool) {
            return res.status(404).json({ success: false, message: "Pool not found" });
        }

        pool.rewardTokenAmount = (pool.rewardTokenAmount || 0) + amount;
        await pool.save();

        logger.info(`Admin topped up pool ${poolId} with ${amount} reward tokens (new total: ${pool.rewardTokenAmount})`);

        res.status(200).json({
            success: true,
            message: "Pool rewards topped up",
            data: { poolId, newRewardTokenAmount: pool.rewardTokenAmount },
        });
    } catch (error) {
        logger.error("topUpPoolRewards error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to top up pool rewards",
            error: error.message,
        });
    }
};

// Admin: trigger on-chain pool stats sync
const { syncAllPools, syncPool } = require('../services/poolSyncService');

const syncPoolStats = async (req, res) => {
    try {
        const { poolId, includeEnded } = req.body;

        if (poolId) {
            const pool = await Staking.findById(poolId);
            if (!pool) {
                return res.status(404).json({ success: false, message: 'Pool not found' });
            }
            const result = await syncPool(pool);
            return res.json({ success: true, data: result });
        }

        const stats = await syncAllPools({ includeEnded: !!includeEnded });
        res.json({ success: true, data: stats });
    } catch (error) {
        logger.error('syncPoolStats error:', error);
        res.status(500).json({ success: false, message: error.message });
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
    topUpPoolRewards,
    syncPoolStats,
};