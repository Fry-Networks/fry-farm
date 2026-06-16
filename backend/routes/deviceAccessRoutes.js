const express = require('express');
const router = express.Router();
const { checkAccess } = require('../controllers/deviceAccessController');

router.get('/:appId/:wallet', checkAccess);

module.exports = router;
