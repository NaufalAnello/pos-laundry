const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/layananController');
const { requireAdmin } = require('../middleware/role');
const multer = require('multer');
const path = require('path');

// ── Setup Multer untuk upload file ─────────────────────────────────────────────
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // maks 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    const allowedExt = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Gunakan CSV atau Excel'));
    }
  }
});

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

// Import & Export
router.post('/layanan/import/preview',      requireAdmin, upload.single('file'), ctrl.importPreview);
router.post('/layanan/import/konfirmasi',   requireAdmin, ctrl.importKonfirmasi);
router.get('/layanan/export',               requireAdmin, ctrl.exportLayanan);
router.get('/layanan/template',             requireAdmin, ctrl.downloadTemplate);

router.post('/layanan',              requireAdmin, ctrl.storeLayanan);
router.put('/layanan/:id',           requireAdmin, ctrl.updateLayanan);
router.patch('/layanan/:id/harga',   requireAdmin, ctrl.updateHarga);
router.patch('/layanan/:id/toggle',  requireAdmin, ctrl.toggleLayanan);
router.delete('/layanan/:id',        ctrl.destroyLayanan);

module.exports = router;
