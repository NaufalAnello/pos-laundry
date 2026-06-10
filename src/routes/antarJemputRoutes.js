const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/antarJemputController');

router.post('/hitung',   ctrl.hitung);
router.post('/simpan',   ctrl.simpan);
router.get('/riwayat',   ctrl.riwayat);
router.get('/settings',  ctrl.getSettings);
router.put('/settings',  ctrl.updateSettings);

module.exports = router;
