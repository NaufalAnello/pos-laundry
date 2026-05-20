const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/kasController');

// ringkasan sebelum /:id
router.get('/ringkasan', ctrl.ringkasan);
router.get('/',          ctrl.index);
router.post('/',         ctrl.store);
router.delete('/:id',    ctrl.destroy);

module.exports = router;
