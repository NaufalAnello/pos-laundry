const Joi = require('joi');
const db  = require('../database/connection');

const kasSchema = Joi.object({
  tanggal:    Joi.date().iso().required(),
  jenis:      Joi.string().valid('masuk', 'keluar').required(),
  kategori:   Joi.string().max(50).default('lainnya'),
  keterangan: Joi.string().max(255).allow('', null),
  jumlah:     Joi.number().min(1).required()
});

// ── GET /api/v1/kas/ringkasan ────────────────────────────────────────────────
exports.ringkasan = async (req, res) => {
  try {
    const today      = new Date().toISOString().slice(0, 10);
    const bulanMulai = today.slice(0, 7) + '-01';

    const [
      saldoTotal,
      masukBulan, keluarBulan,
      masukHari,  keluarHari
    ] = await Promise.all([
      db.raw(`SELECT COALESCE(SUM(CASE WHEN jenis='masuk' THEN jumlah ELSE -jumlah END),0) AS saldo FROM kas`),
      db('kas').where('jenis','masuk').whereRaw('tanggal >= ?',[bulanMulai]).sum('jumlah as total').first(),
      db('kas').where('jenis','keluar').whereRaw('tanggal >= ?',[bulanMulai]).sum('jumlah as total').first(),
      db('kas').where('jenis','masuk').where('tanggal', today).sum('jumlah as total').first(),
      db('kas').where('jenis','keluar').where('tanggal', today).sum('jumlah as total').first()
    ]);

    res.json({
      saldo_total:       Number(saldoTotal[0]?.saldo  ?? 0),
      masuk_bulan_ini:   Number(masukBulan?.total     ?? 0),
      keluar_bulan_ini:  Number(keluarBulan?.total    ?? 0),
      masuk_hari_ini:    Number(masukHari?.total      ?? 0),
      keluar_hari_ini:   Number(keluarHari?.total     ?? 0)
    });
  } catch (err) {
    console.error('[kas:ringkasan]', err);
    res.status(500).json({ error: 'Gagal mengambil ringkasan kas' });
  }
};

// ── GET /api/v1/kas ──────────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const {
      tanggal_dari, tanggal_sampai, jenis,
      page  = 1,
      limit = 50
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    const buildQuery = (q) => {
      q.leftJoin('transaksi as t', 't.id', 'kas.transaksi_id')
       .leftJoin('users as u', 'u.id', 'kas.user_id')
       .orderBy('kas.tanggal', 'desc')
       .orderBy('kas.id', 'desc');

      if (jenis)          q.where('kas.jenis', jenis);
      if (tanggal_dari)   q.whereRaw('kas.tanggal >= ?', [tanggal_dari]);
      if (tanggal_sampai) q.whereRaw('kas.tanggal <= ?', [tanggal_sampai]);
      return q;
    };

    const [rows, countRow] = await Promise.all([
      buildQuery(
        db('kas')
          .limit(Number(limit))
          .offset(offset)
          .select(
            'kas.id', 'kas.tanggal', 'kas.jenis', 'kas.kategori',
            'kas.keterangan', 'kas.jumlah', 'kas.transaksi_id', 'kas.created_at',
            't.nomor_transaksi',
            'u.nama as user_nama'
          )
      ),
      buildQuery(db('kas').count('kas.id as total').first())
    ]);

    res.json({
      data: rows,
      meta: { total: Number(countRow?.total ?? 0), page: Number(page), limit: Number(limit) }
    });
  } catch (err) {
    console.error('[kas:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data kas' });
  }
};

// ── POST /api/v1/kas ─────────────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = kasSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const [id] = await db('kas').insert({
      tanggal:    value.tanggal instanceof Date
        ? value.tanggal.toISOString().slice(0, 10)
        : String(value.tanggal).slice(0, 10),
      jenis:      value.jenis,
      kategori:   value.kategori,
      keterangan: value.keterangan || null,
      jumlah:     value.jumlah,
      transaksi_id: null,
      user_id:    req.session?.user?.id || null,
      created_at: new Date(),
      updated_at: new Date()
    });

    const created = await db('kas').where({ id }).first();
    res.status(201).json({ message: 'Entri kas berhasil dicatat', data: created });
  } catch (err) {
    console.error('[kas:store]', err);
    res.status(500).json({ error: 'Gagal mencatat entri kas' });
  }
};

// ── PUT /api/v1/kas/:id ──────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = kasSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const entry = await db('kas').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ error: 'Entri kas tidak ditemukan' });
    if (entry.transaksi_id) {
      return res.status(400).json({ error: 'Entri otomatis dari transaksi tidak dapat diedit' });
    }

    await db('kas').where({ id: req.params.id }).update({
      tanggal:    value.tanggal instanceof Date
        ? value.tanggal.toISOString().slice(0, 10)
        : String(value.tanggal).slice(0, 10),
      jenis:      value.jenis,
      kategori:   value.kategori,
      keterangan: value.keterangan || null,
      jumlah:     value.jumlah,
      updated_at: new Date()
    });

    const updated = await db('kas').where({ id: req.params.id }).first();
    res.json({ message: 'Entri kas berhasil diperbarui', data: updated });
  } catch (err) {
    console.error('[kas:update]', err);
    res.status(500).json({ error: 'Gagal memperbarui entri kas' });
  }
};

// ── DELETE /api/v1/kas/:id ───────────────────────────────────────────────────
exports.destroy = async (req, res) => {
  try {
    const entry = await db('kas').where({ id: req.params.id }).first();
    if (!entry) return res.status(404).json({ error: 'Entri kas tidak ditemukan' });

    if (entry.transaksi_id) {
      return res.status(400).json({ error: 'Entri dari transaksi tidak dapat dihapus manual' });
    }

    await db('kas').where({ id: req.params.id }).delete();
    res.json({ message: 'Entri kas berhasil dihapus' });
  } catch (err) {
    console.error('[kas:destroy]', err);
    res.status(500).json({ error: 'Gagal hapus entri kas' });
  }
};
