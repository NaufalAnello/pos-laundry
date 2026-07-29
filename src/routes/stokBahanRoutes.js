const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/stokBahanController');
const { requireOwner } = require('../middleware/role');

// Karyawan boleh: lihat list, lihat mutasi, restock (tambah stok manual).
// Owner-only: tambah bahan baru, edit bahan, koreksi stok, hapus bahan.
router.get('/',              ctrl.index);
router.get('/:id/mutasi',    ctrl.mutasi);
router.post('/',             requireOwner, ctrl.store);
router.put('/:id',           requireOwner, ctrl.update);
router.post('/:id/tambah',   ctrl.tambah);
router.post('/:id/koreksi',  requireOwner, ctrl.koreksi);
router.delete('/:id',        ctrl.destroy); // sudah dilindungi blockOperatorDelete global

module.exports = router;
