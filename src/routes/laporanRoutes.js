const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/laporanController');

router.get('/layanan/export', ctrl.exportLayanan); // before /layanan to avoid catch-all
router.get('/layanan',        ctrl.layanan);
router.get('/export',         ctrl.exportCsv); // before / to avoid catch-all
router.get('/',               ctrl.index);

module.exports = router;
