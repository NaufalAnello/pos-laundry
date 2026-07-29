const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/kasController');
const { requireOwner } = require('../middleware/role');

// Buku Kas — transaksi keuangan operasional, khusus owner
router.use(requireOwner);

// ringkasan sebelum /:id
router.get('/ringkasan', ctrl.ringkasan);
router.get('/',          ctrl.index);
router.post('/',         ctrl.store);
router.put('/:id',       ctrl.update);
router.delete('/:id',    ctrl.destroy);

module.exports = router;
