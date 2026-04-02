const express = require('express');
const router = express.Router();
const { validate, stakerDataSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
    getAllStakerData,
    getStakerDataByWalletId,
    addStakerData,
    deleteStakerData,
    updateStakerData
}  = require('../controllers/stackerDataContoller');

router.get('/all', getAllStakerData);
router.get("/:walletId", getStakerDataByWalletId);
router.post('/add', requireAuth, validate(stakerDataSchema), addStakerData);
router.delete('/delete/:id', requireAuth, deleteStakerData);
router.put('/update/:id', requireAuth, updateStakerData);
module.exports = router;
