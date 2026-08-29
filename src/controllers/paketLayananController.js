const Joi = require('joi');
const db  = require('../database/connection');
const svc = require('../services/paketLayanan.service');

// ── Validation schemas ───────────────────────────────────────────────────────
const templateSchemaCreate = Joi.object({
  nama:              Joi.string().trim().min(1).max(100).required(),
  deskripsi:         Joi.string().allow('', null).max(500),
  kuota_kg:          Joi.number().positive().max(9999).required(),
  harga:             Joi.number().min(0).max(999999999).required(),
  masa_berlaku_hari: Joi.number().integer().min(1).max(3650).default(30),
  estimasi_min_hari: Joi.number().integer().min(0).max(365).default(3),
  estimasi_max_hari: Joi.number().integer().min(0).max(365).default(4),
  aktif:             Joi.number().valid(0, 1).default(1)
});

const templateSchemaUpdate = Joi.object({
  nama:              Joi.string().trim().min(1).max(100),
  deskripsi:         Joi.string().allow('', null).max(500),
  kuota_kg:          Joi.number().positive().max(9999),
  harga:             Joi.number().min(0).max(999999999),
  masa_berlaku_hari: Joi.number().integer().min(1).max(3650),
  estimasi_min_hari: Joi.number().integer().min(0).max(365),
  estimasi_max_hari: Joi.number().integer().min(0).max(365),
  aktif:             Joi.number().valid(0, 1)
});

const beliSchema = Joi.object({
  pelanggan_id:      Joi.number().integer().positive().required(),
  paket_template_id: Joi.number().integer().positive().required(),
  metode_bayar:      Joi.string().valid('tunai', 'transfer', 'qris').default('tunai')
});

const toleransiSchema = Joi.object({
  tambah_hari: Joi.number().integer().min(1).max(365).required(),
  catatan:     Joi.string().allow('', null).max(500)
});

// ── Template CRUD ────────────────────────────────────────────────────────────
exports.listTemplate = async (req, res) => {
  try {
    const includeInactive = req.query.aktif === 'semua'
      || req.session?.user?.role === 'owner';
    const data = await svc.listTemplate({ includeInactive });
    res.json({ data });
  } catch (err) {
    console.error('[paket:listTemplate]', err);
    res.status(500).json({ error: 'Gagal mengambil template paket' });
  }
};

exports.getTemplate = async (req, res) => {
  try {
    const row = await svc.getTemplate(req.params.id);
    if (!row) return res.status(404).json({ error: 'Template tidak ditemukan' });
    res.json({ data: row });
  } catch (err) {
    console.error('[paket:getTemplate]', err);
    res.status(500).json({ error: 'Gagal mengambil template' });
  }
};

exports.createTemplate = async (req, res) => {
  const { error, value } = templateSchemaCreate.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
  try {
    const row = await svc.createTemplate(value);
    res.status(201).json({ data: row, message: 'Template paket dibuat' });
  } catch (err) {
    console.error('[paket:createTemplate]', err);
    res.status(500).json({ error: 'Gagal membuat template' });
  }
};

exports.updateTemplate = async (req, res) => {
  const { error, value } = templateSchemaUpdate.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
  try {
    const existing = await svc.getTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template tidak ditemukan' });
    const row = await svc.updateTemplate(req.params.id, value);
    res.json({ data: row, message: 'Template diperbarui' });
  } catch (err) {
    console.error('[paket:updateTemplate]', err);
    res.status(500).json({ error: 'Gagal update template' });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const existing = await svc.getTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template tidak ditemukan' });
    await svc.deleteTemplate(req.params.id);
    res.json({ message: 'Template dinonaktifkan', soft: true });
  } catch (err) {
    console.error('[paket:deleteTemplate]', err);
    res.status(500).json({ error: 'Gagal menghapus template' });
  }
};

// ── Paket Pelanggan ──────────────────────────────────────────────────────────
exports.listPaketPelanggan = async (req, res) => {
  try {
    const pelangganId = req.query.pelanggan_id ? Number(req.query.pelanggan_id) : null;
    const status = req.query.status || null;
    const rows = await svc.getSemuaPaketPelanggan({ pelangganId, status });
    res.json({ data: rows });
  } catch (err) {
    console.error('[paket:listPaketPelanggan]', err);
    res.status(500).json({ error: 'Gagal mengambil daftar paket pelanggan' });
  }
};

exports.aktifPelanggan = async (req, res) => {
  try {
    const pelangganId = Number(req.params.pelangganId);
    if (!pelangganId) return res.status(400).json({ error: 'pelanggan_id wajib' });
    const rows = await svc.getPaketAktifPelanggan(pelangganId);
    res.json({ data: rows });
  } catch (err) {
    console.error('[paket:aktifPelanggan]', err);
    res.status(500).json({ error: 'Gagal mengambil paket aktif' });
  }
};

exports.beliPaket = async (req, res) => {
  const { error, value } = beliSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
  try {
    const row = await svc.beliPaket({
      pelangganId: value.pelanggan_id,
      templateId:  value.paket_template_id,
      metodeBayar: value.metode_bayar,
      userId:      req.session.user.id
    });
    res.status(201).json({ data: row, message: 'Paket berhasil dibeli' });
  } catch (err) {
    console.error('[paket:beliPaket]', err);
    res.status(400).json({ error: err.message || 'Gagal membeli paket' });
  }
};

exports.beriToleransi = async (req, res) => {
  const { error, value } = toleransiSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
  try {
    const row = await svc.berikanToleransi({
      paketPelangganId: Number(req.params.id),
      tambahHari:       value.tambah_hari,
      catatan:          value.catatan,
      userId:           req.session.user.id
    });
    if (!row) return res.status(404).json({ error: 'Paket tidak ditemukan' });
    res.json({ data: row, message: `Toleransi ${value.tambah_hari} hari diberikan` });
  } catch (err) {
    console.error('[paket:beriToleransi]', err);
    res.status(400).json({ error: err.message || 'Gagal memberi toleransi' });
  }
};

exports.mendekatKadaluarsa = async (req, res) => {
  try {
    const ambang = req.query.ambang ? Number(req.query.ambang) : null;
    const data = await svc.getPaketMendekatiKadaluarsa(ambang);
    res.json({ data });
  } catch (err) {
    console.error('[paket:mendekatKadaluarsa]', err);
    res.status(500).json({ error: 'Gagal mengambil daftar paket mendekati kadaluarsa' });
  }
};

exports.mutasi = async (req, res) => {
  try {
    const data = await svc.getMutasiPaket(Number(req.params.id));
    res.json({ data });
  } catch (err) {
    console.error('[paket:mutasi]', err);
    res.status(500).json({ error: 'Gagal mengambil mutasi paket' });
  }
};

// ── Reminder WA ──────────────────────────────────────────────────────────────
// Generate URL WA reminder untuk paket tertentu (tidak auto-kirim, cuma URL).
exports.reminderWa = async (req, res) => {
  try {
    const waSvc = require('../services/wa.service');
    const paket = await db('paket_pelanggan as p')
      .leftJoin('pelanggan as pel', 'pel.id', 'p.pelanggan_id')
      .select('p.*', 'pel.nama as pelanggan_nama', 'pel.telepon as pelanggan_telepon')
      .where('p.id', Number(req.params.id))
      .first();
    if (!paket) return res.status(404).json({ error: 'Paket tidak ditemukan' });
    if (!paket.pelanggan_telepon) return res.status(400).json({ error: 'Pelanggan tidak punya nomor telepon' });

    const s = await waSvc.getSettings();
    const tpl = s.wa_template_paket_reminder ||
      'Halo {nama}, paket {nama_paket} akan kadaluarsa dalam {sisa_hari} hari. Sisa {sisa_kuota}/{kuota_awal} kg.';

    const sisaHari = svc.sisaHari(paket);
    const fmtDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const vars = {
      nama:              paket.pelanggan_nama || 'Pelanggan',
      nama_paket:        paket.nama_paket_snapshot,
      sisa_hari:         sisaHari,
      tanggal_kadaluarsa: fmtDate(paket.tanggal_kadaluarsa),
      sisa_kuota:        Number(paket.kuota_sisa_kg),
      kuota_awal:        Number(paket.kuota_awal_kg),
      nama_toko:         s.nama_toko || 'Laundry'
    };
    const pesan = tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);
    const url = waSvc.generateURL(paket.pelanggan_telepon, pesan, s.wa_mode_default || 'business');

    // Log ke wa_log (best-effort)
    try {
      await db('wa_log').insert({
        telepon:      paket.pelanggan_telepon,
        pesan,
        url,
        status:       'pending',
        jenis:        'paket_reminder',
        transaksi_id: null,
        created_at:   new Date()
      });
    } catch (_) { /* non-critical */ }

    res.json({ pesan, url, sisa_hari: sisaHari });
  } catch (err) {
    console.error('[paket:reminderWa]', err);
    res.status(500).json({ error: 'Gagal membuat pesan reminder' });
  }
};
