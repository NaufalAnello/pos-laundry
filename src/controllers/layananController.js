const Joi = require('joi');
const db  = require('../database/connection');
const { hitungHargaJual, hitungMarginDariHarga, hitungKeuntungan } = require('../utils/margin');

// Ambil mode pembulatan harga dari pengaturan (ratusan/ribuan/tanpa)
const getPembulatan = async () => {
  const row = await db('pengaturan').where({ kunci: 'margin_pembulatan' }).first();
  return ['ratusan', 'ribuan', 'tanpa'].includes(row?.nilai) ? row.nilai : 'ratusan';
};

// ── Schemas ──────────────────────────────────────────────────────────────────
const kategoriSchema = Joi.object({
  nama:     Joi.string().max(100).required(),
  deskripsi: Joi.string().allow('', null),
  ikon:     Joi.string().max(50).allow('', null).default('category'),
  warna:    Joi.string().max(20).allow('', null).default('#6366f1'),
  aktif:    Joi.boolean().default(true)
});

const layananSchema = Joi.object({
  kategori_id:   Joi.number().integer().positive().allow(null),
  nama:          Joi.string().max(100).required(),
  harga:         Joi.number().min(0).required(),
  satuan:        Joi.string().max(20).default('kg'),
  estimasi_hari: Joi.number().integer().min(1).default(2),
  deskripsi:     Joi.string().allow('', null),
  aktif:         Joi.boolean().default(true),
  hpp:           Joi.number().min(0).default(0),
  margin_persen: Joi.number().min(0).max(10000).default(0),
  harga_auto:    Joi.number().integer().min(0).max(1).default(0)
});

const hargaSchema = Joi.object({
  harga: Joi.number().min(0).required()
});

// ── Helper: kategori dengan jumlah layanan ────────────────────────────────────
const queryKategoriList = () =>
  db('kategori_layanan as k')
    .leftJoin('layanan as l', 'l.kategori_id', 'k.id')
    .groupBy('k.id')
    .orderBy('k.nama')
    .select(
      'k.id', 'k.nama', 'k.deskripsi', 'k.aktif', 'k.ikon', 'k.warna',
      'k.created_at', 'k.updated_at',
      db.raw('COUNT(l.id) as jumlah_layanan'),
      db.raw('SUM(CASE WHEN l.aktif = 1 THEN 1 ELSE 0 END) as jumlah_aktif')
    );

// ── GET /api/v1/kategori-layanan ──────────────────────────────────────────────
exports.indexKategori = async (req, res) => {
  try {
    const rows = await queryKategoriList();
    res.json({ data: rows });
  } catch (err) {
    console.error('[kategori:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data kategori' });
  }
};

// ── GET /api/v1/kategori-layanan (with nested layanan) ────────────────────────
// Endpoint khusus untuk admin accordion
exports.perKategori = async (req, res) => {
  try {
    const kategoriList = await queryKategoriList();
    if (!kategoriList.length) return res.json({ data: [] });

    const layananRows = await db('layanan as l')
      .leftJoin('kategori_layanan as k', 'k.id', 'l.kategori_id')
      .orderBy(['k.nama', 'l.nama'])
      .select(
        'l.id', 'l.nama', 'l.harga', 'l.satuan', 'l.estimasi_hari',
        'l.deskripsi', 'l.aktif', 'l.kategori_id', 'l.created_at',
        'l.hpp', 'l.margin_persen', 'l.harga_auto'
      );

    const byKategori = {};
    layananRows.forEach(l => {
      const k = l.kategori_id || 0;
      if (!byKategori[k]) byKategori[k] = [];
      const hpp = Number(l.hpp || 0);
      byKategori[k].push({
        ...l,
        hpp,
        margin_persen:      Number(l.margin_persen || 0),
        harga_auto:         Number(l.harga_auto || 0),
        keuntungan_per_satuan: hpp > 0 ? l.harga - hpp : null,
        margin_aktual:      hpp > 0 ? hitungMarginDariHarga(hpp, l.harga) : null,
        hpp_terisi:         hpp > 0,
      });
    });

    const data = kategoriList.map(k => ({
      ...k,
      layanan: byKategori[k.id] || []
    }));

    // Tambah kategori "tanpa kategori" jika ada
    if (byKategori[0]?.length) {
      data.push({
        id: null, nama: 'Tanpa Kategori', ikon: 'folder', warna: '#94a3b8',
        aktif: true, jumlah_layanan: byKategori[0].length, layanan: byKategori[0]
      });
    }

    res.json({ data });
  } catch (err) {
    console.error('[layanan:perKategori]', err);
    res.status(500).json({ error: 'Gagal mengambil data layanan per kategori' });
  }
};

// ── POST /api/v1/kategori-layanan ─────────────────────────────────────────────
exports.storeKategori = async (req, res) => {
  const { error, value } = kategoriSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const [id] = await db('kategori_layanan').insert({
      ...value, created_at: new Date(), updated_at: new Date()
    });
    const created = await db('kategori_layanan').where({ id }).first();
    res.status(201).json({ message: 'Kategori berhasil dibuat', data: created });
  } catch (err) {
    console.error('[kategori:store]', err);
    res.status(500).json({ error: 'Gagal membuat kategori' });
  }
};

// ── PUT /api/v1/kategori-layanan/:id ─────────────────────────────────────────
exports.updateKategori = async (req, res) => {
  const { error, value } = kategoriSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const existing = await db('kategori_layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' });

    await db('kategori_layanan').where({ id: req.params.id }).update({ ...value, updated_at: new Date() });
    const updated = await db('kategori_layanan').where({ id: req.params.id }).first();
    res.json({ message: 'Kategori berhasil diupdate', data: updated });
  } catch (err) {
    console.error('[kategori:update]', err);
    res.status(500).json({ error: 'Gagal update kategori' });
  }
};

// ── PATCH /api/v1/kategori-layanan/:id/toggle ─────────────────────────────────
exports.toggleKategori = async (req, res) => {
  try {
    const existing = await db('kategori_layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' });

    const newAktif = existing.aktif ? 0 : 1;
    await db('kategori_layanan').where({ id: req.params.id }).update({ aktif: newAktif, updated_at: new Date() });
    res.json({ message: `Kategori ${newAktif ? 'diaktifkan' : 'dinonaktifkan'}`, aktif: !!newAktif });
  } catch (err) {
    console.error('[kategori:toggle]', err);
    res.status(500).json({ error: 'Gagal toggle kategori' });
  }
};

// ── DELETE /api/v1/kategori-layanan/:id ───────────────────────────────────────
exports.destroyKategori = async (req, res) => {
  try {
    const existing = await db('kategori_layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Kategori tidak ditemukan' });

    const count = await db('layanan').where('kategori_id', req.params.id).count('id as n').first();
    if (Number(count.n) > 0) {
      return res.status(400).json({
        error: `Kategori masih memiliki ${count.n} layanan. Pindahkan atau hapus layanan terlebih dahulu.`
      });
    }

    await db('kategori_layanan').where({ id: req.params.id }).delete();
    res.json({ message: 'Kategori berhasil dihapus' });
  } catch (err) {
    console.error('[kategori:destroy]', err);
    res.status(500).json({ error: 'Gagal hapus kategori' });
  }
};

// ── GET /api/v1/layanan/all ───────────────────────────────────────────────────
exports.indexLayanan = async (req, res) => {
  try {
    const rows = await db('layanan as l')
      .leftJoin('kategori_layanan as k', 'k.id', 'l.kategori_id')
      .orderBy(['k.nama', 'l.nama'])
      .select(
        'l.id', 'l.nama', 'l.harga', 'l.satuan', 'l.estimasi_hari',
        'l.deskripsi', 'l.aktif', 'l.kategori_id', 'l.created_at',
        'l.hpp', 'l.margin_persen', 'l.harga_auto',
        'k.nama as kategori_nama'
      );
    res.json({ data: rows });
  } catch (err) {
    console.error('[layanan:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data layanan' });
  }
};

// ── POST /api/v1/layanan ──────────────────────────────────────────────────────
exports.storeLayanan = async (req, res) => {
  const { error, value } = layananSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    if (value.kategori_id) {
      const kat = await db('kategori_layanan').where({ id: value.kategori_id }).first();
      if (!kat) return res.status(400).json({ error: 'Kategori tidak ditemukan' });
    }

    if (value.harga_auto && value.hpp > 0 && value.margin_persen > 0) {
      value.harga = hitungHargaJual(value.hpp, value.margin_persen, await getPembulatan());
    }

    const [id] = await db('layanan').insert({ ...value, created_at: new Date(), updated_at: new Date() });
    const created = await db('layanan').where({ id }).first();
    res.status(201).json({ message: 'Layanan berhasil dibuat', data: created });
  } catch (err) {
    console.error('[layanan:store]', err);
    res.status(500).json({ error: 'Gagal membuat layanan' });
  }
};

// ── PUT /api/v1/layanan/:id ───────────────────────────────────────────────────
exports.updateLayanan = async (req, res) => {
  const { error, value } = layananSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const existing = await db('layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Layanan tidak ditemukan' });

    if (value.harga_auto && value.hpp > 0 && value.margin_persen > 0) {
      value.harga = hitungHargaJual(value.hpp, value.margin_persen, await getPembulatan());
    }

    await db('layanan').where({ id: req.params.id }).update({ ...value, updated_at: new Date() });
    const updated = await db('layanan').where({ id: req.params.id }).first();
    res.json({ message: 'Layanan berhasil diupdate', data: updated });
  } catch (err) {
    console.error('[layanan:update]', err);
    res.status(500).json({ error: 'Gagal update layanan' });
  }
};

// ── PATCH /api/v1/layanan/:id/harga ──────────────────────────────────────────
exports.updateHarga = async (req, res) => {
  const { error, value } = hargaSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const existing = await db('layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Layanan tidak ditemukan' });

    await db('layanan').where({ id: req.params.id }).update({ harga: value.harga, updated_at: new Date() });
    res.json({ message: 'Harga berhasil diupdate', harga: value.harga });
  } catch (err) {
    console.error('[layanan:updateHarga]', err);
    res.status(500).json({ error: 'Gagal update harga' });
  }
};

// ── PATCH /api/v1/layanan/:id/toggle ─────────────────────────────────────────
exports.toggleLayanan = async (req, res) => {
  try {
    const existing = await db('layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Layanan tidak ditemukan' });

    const newAktif = existing.aktif ? 0 : 1;
    await db('layanan').where({ id: req.params.id }).update({ aktif: newAktif, updated_at: new Date() });
    res.json({ message: `Layanan ${newAktif ? 'diaktifkan' : 'dinonaktifkan'}`, aktif: !!newAktif });
  } catch (err) {
    console.error('[layanan:toggle]', err);
    res.status(500).json({ error: 'Gagal toggle layanan' });
  }
};

// ── DELETE /api/v1/layanan/:id ────────────────────────────────────────────────
exports.destroyLayanan = async (req, res) => {
  try {
    const existing = await db('layanan').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Layanan tidak ditemukan' });

    const used = await db('detail_transaksi').where('layanan_id', req.params.id).count('id as n').first();
    if (Number(used.n) > 0) {
      // Soft delete jika sudah dipakai di transaksi
      await db('layanan').where({ id: req.params.id }).update({ aktif: 0, updated_at: new Date() });
      return res.json({ message: 'Layanan dinonaktifkan (sudah digunakan di transaksi)', soft: true });
    }

    await db('layanan').where({ id: req.params.id }).delete();
    res.json({ message: 'Layanan berhasil dihapus' });
  } catch (err) {
    console.error('[layanan:destroy]', err);
    res.status(500).json({ error: 'Gagal hapus layanan' });
  }
};
