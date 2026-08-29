const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/paketLayananController');
const { requireOwner } = require('../middleware/role');

// Semua role boleh: lihat template & paket pelanggan, JUAL paket ke pelanggan
// (operasional harian), lihat mutasi & reminder mendekati kadaluarsa.
// Owner-only: create/update/delete template, beri toleransi.

// ── Template Paket ──
router.get('/paket-template',       ctrl.listTemplate);
router.get('/paket-template/:id',   ctrl.getTemplate);
router.post('/paket-template',      requireOwner, ctrl.createTemplate);
router.put('/paket-template/:id',   requireOwner, ctrl.updateTemplate);
router.delete('/paket-template/:id', ctrl.deleteTemplate); // sudah di-guard blockOperatorDelete global

// ── Paket Pelanggan ──
router.get('/paket-pelanggan',                    ctrl.listPaketPelanggan);
router.get('/paket-pelanggan/mendekat-kadaluarsa', ctrl.mendekatKadaluarsa);
router.get('/paket-pelanggan/aktif/:pelangganId',  ctrl.aktifPelanggan);
router.get('/paket-pelanggan/:id/mutasi',          ctrl.mutasi);
router.get('/paket-pelanggan/:id/reminder-wa',     ctrl.reminderWa);
router.post('/paket-pelanggan/beli',               ctrl.beliPaket);
router.post('/paket-pelanggan/:id/toleransi',      requireOwner, ctrl.beriToleransi);

module.exports = router;
