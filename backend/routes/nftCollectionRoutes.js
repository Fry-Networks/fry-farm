const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getAllCollections,
  searchCollections,
  addCollection,
  seedCollections,
} = require('../controllers/nftCollectionController');

router.get('/all', getAllCollections);
router.get('/search', searchCollections);
router.post('/add', requireAuth, addCollection);
router.post('/seed', requireAuth, seedCollections);

module.exports = router;
