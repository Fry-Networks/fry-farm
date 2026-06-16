const express = require('express');
const router = express.Router();
const { validate, stakingSchema } = require('../middleware/validate');
const { requireAuth, requireRewardsAdmin, chainAwareAuth } = require('../middleware/auth');

const {
    getAllStakingData,
    getStakingDataById,
    getStakingDataByCreatorId,
    getStakingDataByContractId,
    addStakingData,
    updateStakingData,
    deleteStakingData,
    topUpPoolRewards,
    syncPoolStats,
}  = require('../controllers/stackingController');

router.get('/all', getAllStakingData);
router.get('/contract/:contractId', getStakingDataByContractId);
router.get('/creator/:creatorId', getStakingDataByCreatorId);
router.get('/id/:id', getStakingDataById);
router.post('/add', chainAwareAuth, validate(stakingSchema), addStakingData);
router.delete('/delete/:id', chainAwareAuth, deleteStakingData);
router.put('/update/:id', chainAwareAuth, updateStakingData);

// Admin: top up reward tokens on a depleted pool
router.post('/admin/topup', requireAuth, requireRewardsAdmin, topUpPoolRewards);

// Admin: sync pool stats from on-chain global state
router.post('/admin/sync', requireAuth, requireRewardsAdmin, syncPoolStats);

// Backward-compatible: legacy /:creatorId route
router.get('/:creatorId', getStakingDataByCreatorId);

module.exports = router;
