const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/transaksiController');
const struk    = require('../controllers/strukController');
const wa       = require('../controllers/waController');
const printer  = require('../controllers/printerController');
const biayaTambahan = require('../controllers/biayaTambahanController');
const { requireAdmin } = require('../middleware/auth');

router.get('/',               ctrl.index);
router.post('/',              ctrl.store);
router.get('/:id/detail',     ctrl.detail);
router.get('/:id',            ctrl.show);
router.put('/:id',            ctrl.update);
router.put('/:id/status',     ctrl.updateStatus);
router.put('/:id/lunasi',     ctrl.lunasi);
router.delete('/:id',         requireAdmin, ctrl.destroy);

// Item management (tambah/edit/hapus item layanan)
router.post('/:id/item',          ctrl.addItem);
router.put('/:id/item/:item_id',  ctrl.updateItem);
router.delete('/:id/item/:item_id', ctrl.deleteItem);

// Biaya tambahan management
router.get('/:id/biaya-tambahan',    biayaTambahan.index);
router.post('/:id/biaya-tambahan',   biayaTambahan.store);
router.put('/:id/biaya-tambahan/:biaya_id',  biayaTambahan.update);
router.delete('/:id/biaya-tambahan/:biaya_id', biayaTambahan.destroy);

// Struk
router.get('/:id/struk',      struk.show);

// WA endpoints
router.get('/:id/wa/nota',    wa.nota);
router.get('/:id/wa/tagihan', wa.tagihan);
router.get('/:id/wa/notif',   wa.notif);

// Print thermal
router.post('/:id/print', printer.cetakTransaksi);
router.post('/:id/label', printer.cetakLabel);

module.exports = router;
