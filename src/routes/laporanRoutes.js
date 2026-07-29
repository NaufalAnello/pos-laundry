const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/laporanController');
const { requireOwner } = require('../middleware/role');

// Laporan (omset, margin, laba rugi, dll) → data keuangan sensitif, khusus owner
router.use(requireOwner);

router.get('/pelanggan/export',      ctrl.exportPelanggan); // before /pelanggan to avoid catch-all
router.get('/pelanggan/:id/detail',  ctrl.pelangganDetail);
router.get('/pelanggan',             ctrl.pelanggan);
router.get('/layanan/export',        ctrl.exportLayanan); // before /layanan to avoid catch-all
router.get('/layanan',               ctrl.layanan);
router.get('/antar-jemput',          ctrl.antarJemput);
router.get('/export',                ctrl.exportCsv); // before / to avoid catch-all
router.get('/',                      ctrl.index);

module.exports = router;
