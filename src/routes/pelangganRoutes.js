const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/pelangganController');
const { requireAdmin } = require('../middleware/role');

// Import/Export routes (static routes first)
router.get('/export',              requireAdmin, ctrl.exportPelanggan);
router.get('/template',            requireAdmin, ctrl.downloadTemplate);
router.post('/import/preview',     requireAdmin, ctrl.importPreview);
router.post('/import/konfirmasi',  requireAdmin, ctrl.importKonfirmasi);

// CRUD routes
router.get('/',              ctrl.index);
router.post('/',             requireAdmin, ctrl.store);
router.get('/:id/wa-log',   ctrl.waLog);   // static before dynamic
router.get('/:id',          ctrl.show);
router.put('/:id',          requireAdmin, ctrl.update);
router.delete('/:id',       ctrl.destroy);

module.exports = router;
