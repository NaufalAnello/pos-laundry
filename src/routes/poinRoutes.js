const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/poinController');
const { requireAdmin } = require('../middleware/role');

// Halaman Poin (kelola poin pelanggan + pengaturan) → owner-only per matrix
router.get('/pengaturan',                      requireAdmin, ctrl.getPengaturan);
router.put('/pengaturan',                      requireAdmin, ctrl.updatePengaturan);
router.get('/pelanggan',                       requireAdmin, ctrl.indexPelanggan);
router.get('/pelanggan/:id',                   requireAdmin, ctrl.showPelanggan);
router.post('/pelanggan/:id/sesuaikan',        requireAdmin, ctrl.sesuaikan);

module.exports = router;
