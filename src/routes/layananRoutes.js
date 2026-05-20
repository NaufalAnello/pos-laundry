const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/layananController');
const { requireAdmin } = require('../middleware/role');

// ── Kategori Layanan ───────────────────────────────────────────────────────────
router.get('/kategori-layanan',              ctrl.indexKategori);
router.post('/kategori-layanan',             requireAdmin, ctrl.storeKategori);
router.put('/kategori-layanan/:id',          requireAdmin, ctrl.updateKategori);
router.patch('/kategori-layanan/:id/toggle', requireAdmin, ctrl.toggleKategori);
router.delete('/kategori-layanan/:id',       ctrl.destroyKategori); // sudah dilindungi blockOperatorDelete global

// ── Layanan ────────────────────────────────────────────────────────────────────
// Static routes sebelum :id agar tidak di-capture sebagai ID
router.get('/layanan/per-kategori', ctrl.perKategori);
router.get('/layanan/all',          ctrl.indexLayanan);

router.post('/layanan',              requireAdmin, ctrl.storeLayanan);
router.put('/layanan/:id',           requireAdmin, ctrl.updateLayanan);
router.patch('/layanan/:id/harga',   requireAdmin, ctrl.updateHarga);
router.patch('/layanan/:id/toggle',  requireAdmin, ctrl.toggleLayanan);
router.delete('/layanan/:id',        ctrl.destroyLayanan);

module.exports = router;
