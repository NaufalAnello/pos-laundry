const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/printerController');
const { requireAdmin } = require('../middleware/role');

router.get('/status', ctrl.status);
router.post('/test',  requireAdmin, ctrl.test);

module.exports = router;
