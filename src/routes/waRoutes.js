const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/waController');

router.post('/log',        ctrl.log);
router.get('/log-list',    ctrl.logList);
router.get('/tagihan',     ctrl.tagihanList);
router.post('/broadcast',  ctrl.broadcast);

module.exports = router;
