const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/laporanController');

router.get('/export', ctrl.exportCsv); // before / to avoid catch-all
router.get('/',       ctrl.index);

module.exports = router;
