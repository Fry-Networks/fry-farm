const express = require('express');
const router = express.Router();
const { validate, tokenSchema } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const {
    getAllTokens,
    addToken,
    updateToken,
    deleteToken,
    searchTokenByName,
    getTokenImage
}  = require('../controllers/tokenController');

router.get('/all', getAllTokens);
router.get('/search/:tokenName', searchTokenByName);
router.post('/add', requireAuth, validate(tokenSchema), addToken);
router.delete('/delete/:id', requireAuth, deleteToken);
router.put('/update/:id', requireAuth, updateToken);
router.get('/:asaId/image', getTokenImage);
module.exports = router;
