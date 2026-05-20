const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/pengaturanController');
const { requireAdmin } = require('../middleware/role');

router.get('/backup',   ctrl.backup);          // before / and /:id
router.post('/restore', requireAdmin,
  express.raw({ type: 'application/octet-stream', limit: '100mb' }),
  ctrl.restore);
router.get('/wa-mode',  ctrl.getWAMode);
router.put('/wa-mode',  requireAdmin, ctrl.updateWAMode);
router.get('/',  ctrl.getAll);
router.put('/',  requireAdmin, ctrl.updateBulk);

module.exports = router;
