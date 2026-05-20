const Joi = require('joi');
const db  = require('../database/connection');

const promoSchema = Joi.object({
  nama:           Joi.string().max(100).required(),
  deskripsi:      Joi.string().allow('', null),
  jenis:          Joi.string().valid('persen', 'nominal', 'paket').default('persen'),
  diskon_persen:  Joi.number().min(0).max(100).default(0),
  diskon_nominal: Joi.number().min(0).default(0),
  min_pembelian:  Joi.number().min(0).default(0),
  layanan_ids:    Joi.string().allow('', null),
  berlaku_mulai:  Joi.date().iso().allow(null),
  berlaku_sampai: Joi.date().iso().allow(null),
  hari_berlaku:   Joi.string().allow('', null), // JSON "[0,1,2]"
  aktif:          Joi.boolean().default(true)
});

const fmtDate = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : null);

const buildFilter = (q, { tab, search }) => {
  const today = new Date().toISOString().slice(0, 10);
  if (tab === 'aktif')      q.where('aktif', true).where(function () {
    this.whereNull('berlaku_sampai').orWhere('berlaku_sampai', '>=', today);
  });
  if (tab === 'nonaktif')   q.where('aktif', false);
  if (tab === 'terjadwal')  q.where('berlaku_mulai', '>', today);
  if (tab === 'expired')    q.where('berlaku_sampai', '<', today);
  if (search)               q.where('nama', 'like', `%${search}%`);
  return q;
};

// ── GET /api/v1/promo ────────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const { tab = 'semua', q = '' } = req.query;
    const rows = await buildFilter(
      db('paket_promo').orderBy('created_at', 'desc'),
      { tab, search: q }
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[promo:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data promo' });
  }
};

// ── GET /api/v1/promo/aktif ──────────────────────────────────────────────────
exports.aktif = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dow   = String(new Date().getDay()); // 0=Sun ... 6=Sat

    const rows = await db('paket_promo')
      .where('aktif', true)
      .where(function () {
        this.whereNull('berlaku_mulai').orWhere('berlaku_mulai', '<=', today);
      })
      .where(function () {
        this.whereNull('berlaku_sampai').orWhere('berlaku_sampai', '>=', today);
      })
      .where(function () {
        // hari_berlaku null/empty = berlaku semua hari
        this.whereNull('hari_berlaku')
            .orWhere('hari_berlaku', '')
            .orWhere('hari_berlaku', 'like', `%${dow}%`);
      })
      .orderBy('nama');

    res.json({ data: rows });
  } catch (err) {
    console.error('[promo:aktif]', err);
    res.status(500).json({ error: 'Gagal mengambil promo aktif' });
  }
};

// ── POST /api/v1/promo ───────────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = promoSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const [id] = await db('paket_promo').insert({
      ...value,
      berlaku_mulai:  fmtDate(value.berlaku_mulai),
      berlaku_sampai: fmtDate(value.berlaku_sampai),
      created_at: new Date(),
      updated_at: new Date()
    });
    const created = await db('paket_promo').where({ id }).first();
    res.status(201).json({ message: 'Promo berhasil dibuat', data: created });
  } catch (err) {
    console.error('[promo:store]', err);
    res.status(500).json({ error: 'Gagal membuat promo' });
  }
};

// ── PUT /api/v1/promo/:id ────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = promoSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const existing = await db('paket_promo').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Promo tidak ditemukan' });

    await db('paket_promo').where({ id: req.params.id }).update({
      ...value,
      berlaku_mulai:  fmtDate(value.berlaku_mulai),
      berlaku_sampai: fmtDate(value.berlaku_sampai),
      updated_at: new Date()
    });
    const updated = await db('paket_promo').where({ id: req.params.id }).first();
    res.json({ message: 'Promo berhasil diupdate', data: updated });
  } catch (err) {
    console.error('[promo:update]', err);
    res.status(500).json({ error: 'Gagal update promo' });
  }
};

// ── PATCH /api/v1/promo/:id/toggle ──────────────────────────────────────────
exports.toggle = async (req, res) => {
  try {
    const existing = await db('paket_promo').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Promo tidak ditemukan' });

    const newAktif = existing.aktif ? 0 : 1;
    await db('paket_promo').where({ id: req.params.id })
      .update({ aktif: newAktif, updated_at: new Date() });
    res.json({ message: `Promo ${newAktif ? 'diaktifkan' : 'dinonaktifkan'}`, aktif: !!newAktif });
  } catch (err) {
    console.error('[promo:toggle]', err);
    res.status(500).json({ error: 'Gagal toggle promo' });
  }
};

// ── DELETE /api/v1/promo/:id ─────────────────────────────────────────────────
exports.destroy = async (req, res) => {
  try {
    const existing = await db('paket_promo').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Promo tidak ditemukan' });

    // Soft-delete jika sudah dipakai di transaksi
    const used = await db('transaksi').where('paket_promo_id', req.params.id).count('id as n').first();
    if (Number(used.n) > 0) {
      await db('paket_promo').where({ id: req.params.id })
        .update({ aktif: 0, updated_at: new Date() });
      return res.json({ message: 'Promo dinonaktifkan (sudah digunakan di transaksi)', soft: true });
    }
    await db('paket_promo').where({ id: req.params.id }).delete();
    res.json({ message: 'Promo berhasil dihapus' });
  } catch (err) {
    console.error('[promo:destroy]', err);
    res.status(500).json({ error: 'Gagal hapus promo' });
  }
};
