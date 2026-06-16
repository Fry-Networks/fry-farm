const express = require('express');
const router = express.Router();
const { validate, swapHistorySchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
    getAllUserSwapHistory,
    getUserSwapHistoryByUserId,
    addUserSwapHistory,
    deleteUserSwapHistory,
    updateUserSwapHistory
}  = require('../controllers/UserSwapHistoryController');

router.get('/all', getAllUserSwapHistory);
router.get("/:userId", getUserSwapHistoryByUserId);
router.post('/add', requireAuth, validate(swapHistorySchema), addUserSwapHistory);
router.delete('/delete/:id', requireAuth, deleteUserSwapHistory);
router.put('/update/:id', requireAuth, updateUserSwapHistory);
module.exports = router;
