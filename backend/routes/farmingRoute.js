const express = require('express');
const router = express.Router();
const { validate, farmingSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
  getAllFarmingData,
  getFarmingDataByCreatorId,
  addFarmingData,
  updateFarmingData,
  deleteFarmingData,
  getFarmingDataByAppId,
  getFarmingDataByOnlyAppId
} = require('../controllers/farmingController');

router.get('/all', getAllFarmingData);
router.get('/appId/:appId', getFarmingDataByOnlyAppId);
router.get('/creator/:creatorId', getFarmingDataByCreatorId);
router.post('/add', requireAuth, validate(farmingSchema), addFarmingData);
router.put('/update/:appId', requireAuth, updateFarmingData);
router.delete('/delete/:id', requireAuth, deleteFarmingData);

// Backward-compatible: legacy /:id route tries appId first, then creatorId
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  if (/^\d+$/.test(id)) {
    req.params.appId = id;
    return getFarmingDataByOnlyAppId(req, res, next);
  }
  req.params.creatorId = id;
  return getFarmingDataByCreatorId(req, res, next);
});

module.exports = router;
