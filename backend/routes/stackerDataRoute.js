const express = require('express');
const router = express.Router();
const { validate, stakerDataSchema } = require('../middleware/validate');
const { requireAuth, chainAwareAuth } = require('../middleware/auth');

const {
    getAllStakerData,
    getStakerDataByWalletId,
    addStakerData,
    deleteStakerData,
    updateStakerData
}  = require('../controllers/stackerDataContoller');

router.get('/all', getAllStakerData);
router.get("/:walletId", getStakerDataByWalletId);
router.post('/add', chainAwareAuth, validate(stakerDataSchema), addStakerData);
router.delete('/delete/:id', requireAuth, deleteStakerData);
router.put('/update/:id', requireAuth, updateStakerData);
module.exports = router;
