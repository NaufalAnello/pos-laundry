const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/poinController');
const { requireAdmin } = require('../middleware/role');

// /api/v1/poin/...
router.get('/pengaturan',                      ctrl.getPengaturan);
router.put('/pengaturan',                      requireAdmin, ctrl.updatePengaturan);
router.get('/pelanggan',                       ctrl.indexPelanggan);
router.get('/pelanggan/:id',                   ctrl.showPelanggan);
router.post('/pelanggan/:id/sesuaikan',        requireAdmin, ctrl.sesuaikan);

module.exports = router;
