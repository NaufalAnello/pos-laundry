const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/masterItemController');
const { requireAuth } = require('../middleware/auth');

// Semua route memerlukan autentikasi
router.use(requireAuth);

router.get('/',           ctrl.index);
router.get('/:id',        ctrl.show);
router.post('/',          ctrl.store);
router.put('/:id',        ctrl.update);
router.delete('/:id',     ctrl.destroy);
router.post('/reorder',   ctrl.reorder);

module.exports = router;
