const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reservasiJemputController');
const { requireAdmin } = require('../middleware/role');

// static path sebelum dynamic
router.get('/hari-ini',       ctrl.hariIni);
router.get('/',               ctrl.index);
router.post('/',              ctrl.store);
router.get('/:id',            ctrl.show);
router.put('/:id',            ctrl.update);
router.put('/:id/selesai',    ctrl.selesai);
router.put('/:id/batal',      ctrl.batal);
router.delete('/:id',         requireAdmin, ctrl.destroy);

module.exports = router;
