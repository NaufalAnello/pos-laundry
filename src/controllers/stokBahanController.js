const Joi = require('joi');
const db  = require('../database/connection');
const svc = require('../services/stokBahan.service');

const SATUAN_VALID = ['ml', 'liter', 'gram', 'kg', 'pcs'];
const SATUAN_RASIO_VALID = ['per_kg', 'per_pcs'];

const createSchema = Joi.object({
  nama:            Joi.string().trim().min(1).max(100).required(),
  satuan:          Joi.string().valid(...SATUAN_VALID).required(),
  stok_sekarang:   Joi.number().min(0).default(0),
  batas_minimum:   Joi.number().min(0).default(0),
  rasio_pemakaian: Joi.number().min(0).default(0),
  satuan_rasio:    Joi.string().valid(...SATUAN_RASIO_VALID).default('per_kg')
});

const updateSchema = Joi.object({
  nama:            Joi.string().trim().min(1).max(100),
  satuan:          Joi.string().valid(...SATUAN_VALID),
  batas_minimum:   Joi.number().min(0),
  rasio_pemakaian: Joi.number().min(0),
  satuan_rasio:    Joi.string().valid(...SATUAN_RASIO_VALID)
});

// ── GET /api/v1/stok-bahan ────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const rows = await db('bahan_baku')
      .where('aktif', 1)
      .orderBy('nama', 'asc');

    const data = rows.map(r => ({
      ...r,
      stok_sekarang:   Number(r.stok_sekarang),
      batas_minimum:   Number(r.batas_minimum),
      rasio_pemakaian: Number(r.rasio_pemakaian),
      di_bawah_batas:  Number(r.stok_sekarang) < Number(r.batas_minimum) && Number(r.batas_minimum) > 0
    }));

    const menipis = data.filter(d => d.di_bawah_batas);

    res.json({ data, menipis });
  } catch (err) {
    console.error('[stok-bahan:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data bahan baku' });
  }
};

// ── GET /api/v1/stok-bahan/:id/mutasi ─────────────────────────────────────────
exports.mutasi = async (req, res) => {
  try {
    const bahan = await db('bahan_baku').where('id', req.params.id).first();
    if (!bahan) return res.status(404).json({ error: 'Bahan tidak ditemukan' });

    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    const query = db('mutasi_stok_bahan as m')
      .leftJoin('transaksi as t', 't.id', 'm.transaksi_id')
      .leftJoin('users as u',     'u.id', 'm.created_by')
      .where('m.bahan_id', req.params.id)
      .orderBy('m.id', 'desc')
      .select(
        'm.*',
        't.nomor_transaksi',
        'u.nama as operator_nama'
      );

    const [rows, countRow] = await Promise.all([
      query.clone().limit(limit).offset(offset),
      db('mutasi_stok_bahan').where('bahan_id', req.params.id).count('id as total').first()
    ]);

    res.json({
      bahan,
      data: rows,
      meta: { total: Number(countRow?.total ?? 0), page, limit }
    });
  } catch (err) {
    console.error('[stok-bahan:mutasi]', err);
    res.status(500).json({ error: 'Gagal mengambil mutasi bahan' });
  }
};

// ── POST /api/v1/stok-bahan ───────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = createSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const [id] = await db('bahan_baku').insert({
      nama:            value.nama,
      satuan:          value.satuan,
      stok_sekarang:   value.stok_sekarang,
      batas_minimum:   value.batas_minimum,
      rasio_pemakaian: value.rasio_pemakaian,
      satuan_rasio:    value.satuan_rasio,
      aktif:           1,
      created_at:      new Date(),
      updated_at:      new Date()
    });

    // Catat mutasi stok awal jika ada
    if (value.stok_sekarang > 0) {
      await db('mutasi_stok_bahan').insert({
        bahan_id:     id,
        jenis:        'masuk',
        jumlah:       value.stok_sekarang,
        stok_sebelum: 0,
        stok_sesudah: value.stok_sekarang,
        transaksi_id: null,
        keterangan:   'Stok awal',
        created_by:   req.session?.user?.id || null,
        created_at:   new Date()
      });
    }

    const created = await db('bahan_baku').where('id', id).first();
    res.status(201).json({ message: 'Bahan berhasil ditambahkan', data: created });
  } catch (err) {
    console.error('[stok-bahan:store]', err);
    res.status(500).json({ error: 'Gagal menambah bahan' });
  }
};

// ── PUT /api/v1/stok-bahan/:id ────────────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const bahan = await db('bahan_baku').where('id', req.params.id).first();
    if (!bahan) return res.status(404).json({ error: 'Bahan tidak ditemukan' });

    await db('bahan_baku').where('id', req.params.id).update({
      ...value,
      updated_at: new Date()
    });

    const fresh = await db('bahan_baku').where('id', req.params.id).first();
    res.json({ message: 'Bahan berhasil diupdate', data: fresh });
  } catch (err) {
    console.error('[stok-bahan:update]', err);
    res.status(500).json({ error: 'Gagal mengupdate bahan' });
  }
};

// ── POST /api/v1/stok-bahan/:id/tambah ────────────────────────────────────────
exports.tambah = async (req, res) => {
  const schema = Joi.object({
    jumlah:     Joi.number().positive().required(),
    keterangan: Joi.string().allow('', null)
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const hasil = await svc.tambahStokManual(
      req.params.id, value.jumlah, value.keterangan, req.session?.user?.id
    );
    res.json({ message: 'Stok berhasil ditambah', ...hasil });
  } catch (err) {
    console.error('[stok-bahan:tambah]', err);
    res.status(400).json({ error: err.message || 'Gagal menambah stok' });
  }
};

// ── POST /api/v1/stok-bahan/:id/koreksi ───────────────────────────────────────
exports.koreksi = async (req, res) => {
  const schema = Joi.object({
    stok_baru:  Joi.number().min(0).required(),
    keterangan: Joi.string().allow('', null)
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const hasil = await svc.koreksiStok(
      req.params.id, value.stok_baru, value.keterangan, req.session?.user?.id
    );
    res.json({ message: 'Stok berhasil dikoreksi', ...hasil });
  } catch (err) {
    console.error('[stok-bahan:koreksi]', err);
    res.status(400).json({ error: err.message || 'Gagal koreksi stok' });
  }
};

// ── DELETE /api/v1/stok-bahan/:id ─────────────────────────────────────────────
// Soft delete: aktif=0. Data mutasi tetap disimpan sebagai riwayat.
exports.destroy = async (req, res) => {
  try {
    const bahan = await db('bahan_baku').where('id', req.params.id).first();
    if (!bahan) return res.status(404).json({ error: 'Bahan tidak ditemukan' });

    await db('bahan_baku').where('id', req.params.id).update({
      aktif:      0,
      updated_at: new Date()
    });

    res.json({ message: 'Bahan dinonaktifkan' });
  } catch (err) {
    console.error('[stok-bahan:destroy]', err);
    res.status(500).json({ error: 'Gagal menonaktifkan bahan' });
  }
};
