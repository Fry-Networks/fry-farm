const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
    getAllYieldFarmingData,
    addYieldFarmingData,
    getYieldFarmingDataByWalletId,
    deleteYieldFarmingData,
    updateYieldFarmingData
}  = require('../controllers/yieldFarmingController');



router.get('/all', getAllYieldFarmingData);
router.get("/:walletId", getYieldFarmingDataByWalletId);
router.post('/add', requireAuth, addYieldFarmingData);
router.delete('/delete/:id', requireAuth, deleteYieldFarmingData);
router.put('/update/:id', requireAuth, updateYieldFarmingData);
module.exports = router;