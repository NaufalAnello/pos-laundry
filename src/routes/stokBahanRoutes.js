const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/stokBahanController');

router.get('/',              ctrl.index);
router.get('/:id/mutasi',    ctrl.mutasi);
router.post('/',             ctrl.store);
router.put('/:id',           ctrl.update);
router.post('/:id/tambah',   ctrl.tambah);
router.post('/:id/koreksi',  ctrl.koreksi);
router.delete('/:id',        ctrl.destroy);

module.exports = router;
