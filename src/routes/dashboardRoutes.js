const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/dashboardController');

router.get('/', ctrl.index);

// Antar Jemput hari ini (widget otomatis)
router.get('/antar-jemput-hari-ini', ctrl.antarJemputHariIni);
router.post('/antar-jemput/ai-saran', ctrl.antarJemputAISaran);
router.post('/terapkan-tarif-aj',     ctrl.terapkanTarifAJ);

module.exports = router;
