const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/transaksiController');
const struk    = require('../controllers/strukController');
const wa       = require('../controllers/waController');
const printer  = require('../controllers/printerController');

router.get('/',               ctrl.index);
router.post('/',              ctrl.store);
router.get('/:id/detail',     ctrl.detail);
router.get('/:id',            ctrl.show);
router.put('/:id',            ctrl.update);
router.put('/:id/status',     ctrl.updateStatus);

// Struk
router.get('/:id/struk',      struk.show);

// WA endpoints
router.get('/:id/wa/nota',    wa.nota);
router.get('/:id/wa/tagihan', wa.tagihan);
router.get('/:id/wa/notif',   wa.notif);

// Print thermal
router.post('/:id/print', printer.cetakTransaksi);

module.exports = router;
