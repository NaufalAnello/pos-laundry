const Joi = require('joi');
const db  = require('../database/connection');

const STATUS_VALID = ['terjadwal', 'selesai', 'batal'];

const baseSchema = Joi.object({
  pelanggan_id:   Joi.number().integer().positive().required(),
  tanggal_jemput: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  jam_jemput:     Joi.string().pattern(/^\d{2}:\d{2}$/).allow('', null),
  alamat:         Joi.string().max(500).allow('', null),
  catatan:        Joi.string().max(500).allow('', null)
});

const todayISO = () => new Date().toISOString().slice(0, 10);

// Query builder dasar dengan join pelanggan
function baseQuery() {
  return db('reservasi_jemput as r')
    .leftJoin('pelanggan as p', 'p.id', 'r.pelanggan_id')
    .leftJoin('transaksi as t', 't.id', 'r.transaksi_id')
    .leftJoin('users as u', 'u.id', 'r.created_by')
    .select(
      'r.id', 'r.pelanggan_id', 'r.transaksi_id',
      'r.tanggal_jemput', 'r.jam_jemput',
      'r.alamat', 'r.catatan', 'r.status', 'r.alasan_batal',
      'r.created_at', 'r.updated_at',
      'p.nama as pelanggan_nama',
      'p.telepon as pelanggan_telepon',
      'p.alamat as pelanggan_alamat',
      't.nomor_transaksi',
      'u.nama as created_by_nama'
    );
}

// ── GET /api/v1/reservasi-jemput ─────────────────────────────────────────────
// Query: tanggal, status, pelanggan_id, sampai_tanggal
exports.index = async (req, res) => {
  try {
    const { tanggal, sampai_tanggal, status, pelanggan_id } = req.query;
    const q = baseQuery();

    if (tanggal)        q.where('r.tanggal_jemput', tanggal);
    if (sampai_tanggal) q.whereBetween('r.tanggal_jemput', [tanggal || todayISO(), sampai_tanggal]);
    if (status)         q.where('r.status', status);
    if (pelanggan_id)   q.where('r.pelanggan_id', Number(pelanggan_id));

    q.orderBy('r.tanggal_jemput', 'asc').orderByRaw("COALESCE(r.jam_jemput, '23:59') asc");

    const rows = await q;
    res.json({ data: rows });
  } catch (err) {
    console.error('[reservasi:index]', err);
    res.status(500).json({ error: 'Gagal mengambil daftar reservasi' });
  }
};

// ── GET /api/v1/reservasi-jemput/hari-ini ────────────────────────────────────
exports.hariIni = async (req, res) => {
  try {
    const today = todayISO();
    const rows = await baseQuery()
      .where('r.tanggal_jemput', today)
      .where('r.status', 'terjadwal')
      .orderByRaw("COALESCE(r.jam_jemput, '23:59') asc");

    res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('[reservasi:hariIni]', err);
    res.status(500).json({ error: 'Gagal mengambil reservasi hari ini' });
  }
};

// ── GET /api/v1/reservasi-jemput/:id ─────────────────────────────────────────
exports.show = async (req, res) => {
  try {
    const row = await baseQuery().where('r.id', req.params.id).first();
    if (!row) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    res.json({ data: row });
  } catch (err) {
    console.error('[reservasi:show]', err);
    res.status(500).json({ error: 'Gagal mengambil reservasi' });
  }
};

// ── POST /api/v1/reservasi-jemput ────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = baseSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  // Tanggal tidak boleh di masa lalu
  if (value.tanggal_jemput < todayISO()) {
    return res.status(400).json({ error: 'Tanggal jemput tidak boleh di masa lalu' });
  }

  try {
    const pelanggan = await db('pelanggan').where({ id: value.pelanggan_id }).first();
    if (!pelanggan) return res.status(400).json({ error: 'Pelanggan tidak ditemukan' });

    const [id] = await db('reservasi_jemput').insert({
      pelanggan_id:   value.pelanggan_id,
      tanggal_jemput: value.tanggal_jemput,
      jam_jemput:     value.jam_jemput || null,
      alamat:         value.alamat || pelanggan.alamat || null,
      catatan:        value.catatan || null,
      status:         'terjadwal',
      created_by:     req.session?.userId || null
    });

    const row = await baseQuery().where('r.id', id).first();
    res.json({ message: 'Reservasi berhasil disimpan', data: row });
  } catch (err) {
    console.error('[reservasi:store]', err);
    res.status(500).json({ error: 'Gagal menyimpan reservasi' });
  }
};

// ── PUT /api/v1/reservasi-jemput/:id ─────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = baseSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const existing = await db('reservasi_jemput').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    if (existing.status !== 'terjadwal') {
      return res.status(400).json({ error: 'Reservasi yang sudah selesai/dibatalkan tidak bisa diedit' });
    }

    await db('reservasi_jemput').where({ id: req.params.id }).update({
      pelanggan_id:   value.pelanggan_id,
      tanggal_jemput: value.tanggal_jemput,
      jam_jemput:     value.jam_jemput || null,
      alamat:         value.alamat || null,
      catatan:        value.catatan || null,
      updated_at:     db.fn.now()
    });

    const row = await baseQuery().where('r.id', req.params.id).first();
    res.json({ message: 'Reservasi diperbarui', data: row });
  } catch (err) {
    console.error('[reservasi:update]', err);
    res.status(500).json({ error: 'Gagal memperbarui reservasi' });
  }
};

// ── PUT /api/v1/reservasi-jemput/:id/selesai ─────────────────────────────────
// Body: { transaksi_id? } — jika dikirim, tautkan ke transaksi yang sudah dibuat
exports.selesai = async (req, res) => {
  const schema = Joi.object({
    transaksi_id: Joi.number().integer().positive().allow(null)
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const existing = await db('reservasi_jemput').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    if (existing.status === 'selesai') {
      return res.status(400).json({ error: 'Reservasi sudah ditandai selesai' });
    }
    if (existing.status === 'batal') {
      return res.status(400).json({ error: 'Reservasi sudah dibatalkan' });
    }

    const patch = { status: 'selesai', updated_at: db.fn.now() };
    if (value.transaksi_id) patch.transaksi_id = value.transaksi_id;

    await db('reservasi_jemput').where({ id: req.params.id }).update(patch);

    const row = await baseQuery().where('r.id', req.params.id).first();
    res.json({ message: 'Reservasi ditandai selesai', data: row });
  } catch (err) {
    console.error('[reservasi:selesai]', err);
    res.status(500).json({ error: 'Gagal menandai selesai' });
  }
};

// ── PUT /api/v1/reservasi-jemput/:id/batal ───────────────────────────────────
exports.batal = async (req, res) => {
  const schema = Joi.object({
    alasan: Joi.string().max(500).allow('', null)
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const existing = await db('reservasi_jemput').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    if (existing.status === 'batal') {
      return res.status(400).json({ error: 'Reservasi sudah dibatalkan' });
    }
    if (existing.status === 'selesai') {
      return res.status(400).json({ error: 'Reservasi yang sudah selesai tidak bisa dibatalkan' });
    }

    await db('reservasi_jemput').where({ id: req.params.id }).update({
      status:       'batal',
      alasan_batal: value.alasan || null,
      updated_at:   db.fn.now()
    });

    const row = await baseQuery().where('r.id', req.params.id).first();
    res.json({ message: 'Reservasi dibatalkan', data: row });
  } catch (err) {
    console.error('[reservasi:batal]', err);
    res.status(500).json({ error: 'Gagal membatalkan reservasi' });
  }
};

// ── DELETE /api/v1/reservasi-jemput/:id ──────────────────────────────────────
exports.destroy = async (req, res) => {
  try {
    const existing = await db('reservasi_jemput').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });

    await db('reservasi_jemput').where({ id: req.params.id }).delete();
    res.json({ message: 'Reservasi dihapus' });
  } catch (err) {
    console.error('[reservasi:destroy]', err);
    res.status(500).json({ error: 'Gagal menghapus reservasi' });
  }
};
