const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/promoController');
const { requireAdmin } = require('../middleware/role');

// static sebelum /:id
router.get('/aktif',       ctrl.aktif);
router.get('/',            ctrl.index);
router.post('/',           requireAdmin, ctrl.store);
router.put('/:id',         requireAdmin, ctrl.update);
router.patch('/:id/toggle', requireAdmin, ctrl.toggle);
router.delete('/:id',      ctrl.destroy); // dilindungi blockOperatorDelete global

module.exports = router;
