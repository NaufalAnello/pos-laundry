const express = require('express');
const router  = express.Router();
const db      = require('../database/connection');
const { findAllAktif: getLayanan }  = require('../models/layananModel');
const { findAllAktif: getPromo }    = require('../models/paketPromoModel');

// GET /api/v1/layanan
router.get('/layanan', async (req, res) => {
  try {
    const data = await getLayanan();
    res.json({ data });
  } catch (err) {
    console.error('[support:layanan]', err);
    res.status(500).json({ error: 'Gagal mengambil layanan' });
  }
});

// GET /api/v1/paket-promo
router.get('/paket-promo', async (req, res) => {
  try {
    const data = await getPromo();
    res.json({ data });
  } catch (err) {
    console.error('[support:paket-promo]', err);
    res.status(500).json({ error: 'Gagal mengambil promo' });
  }
});

// GET /api/v1/pengaturan
router.get('/pengaturan', async (req, res) => {
  try {
    const rows = await db('pengaturan').orderBy('kunci');
    const data = Object.fromEntries(rows.map(r => [r.kunci, r.nilai]));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil pengaturan' });
  }
});

module.exports = router;
