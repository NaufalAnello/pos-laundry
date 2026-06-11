const Joi = require('joi');
const db  = require('../database/connection');

const pelangganSchema = Joi.object({
  nama:    Joi.string().max(100).required(),
  telepon: Joi.string().max(20).allow('', null),
  alamat:  Joi.string().max(500).allow('', null),
  email:   Joi.string().email().max(100).allow('', null),
  jarak_workshop_km: Joi.number().min(0).max(999).allow(null),
  parfum:           Joi.string().max(100).allow('', null),
  instruksi_khusus: Joi.string().max(500).allow('', null),
  catatan:          Joi.string().max(500).allow('', null)
});

const LEVEL_DEFAULTS = { level_silver_min: '500', level_gold_min: '2000', level_platinum_min: '5000' };

const getPoinSettings = async () => {
  const keys = Object.keys(LEVEL_DEFAULTS);
  const rows = await db('pengaturan').whereIn('kunci', keys);
  const map  = Object.fromEntries(rows.map(r => [r.kunci, r.nilai]));
  return Object.fromEntries(keys.map(k => [k, parseInt(map[k] ?? LEVEL_DEFAULTS[k]) || 0]));
};

const getLevel = (poin, s) => {
  if (poin >= s.level_platinum_min) return { label: 'Platinum', color: '#7c3aed' };
  if (poin >= s.level_gold_min)     return { label: 'Gold',     color: '#d97706' };
  if (poin >= s.level_silver_min)   return { label: 'Silver',   color: '#6b7280' };
  return                                   { label: 'Bronze',   color: '#92400e' };
};

// ── GET /api/v1/pelanggan ─────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const s = await getPoinSettings();
    const { q = '', page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const applySearch = (base) => {
      if (q) base.where(function () {
        this.where('p.nama', 'like', `%${q}%`).orWhere('p.telepon', 'like', `%${q}%`);
      });
      return base;
    };

    const baseJoin = (base) =>
      applySearch(base.leftJoin(
        db('transaksi').whereNotIn('status', ['dibatalkan']).groupBy('pelanggan_id')
          .select('pelanggan_id',
            db.raw('COUNT(*) as jumlah_transaksi'),
            db.raw('SUM(total_bayar) as total_belanja'),
            db.raw('MAX(tanggal_masuk) as transaksi_terakhir')
          ).as('tr'),
        'tr.pelanggan_id', 'p.id'
      ).orderBy('p.nama'));

    const [rows, countRow] = await Promise.all([
      baseJoin(db('pelanggan as p').select(
        'p.id', 'p.nama', 'p.telepon', 'p.email', 'p.alamat', 'p.total_poin', 'p.created_at',
        'p.jarak_workshop_km',
        'p.parfum', 'p.instruksi_khusus', 'p.catatan',
        db.raw('COALESCE(tr.jumlah_transaksi, 0) as jumlah_transaksi'),
        db.raw('COALESCE(tr.total_belanja, 0) as total_belanja'),
        'tr.transaksi_terakhir'
      )).limit(Number(limit)).offset(offset),
      baseJoin(db('pelanggan as p').count('p.id as total').first())
    ]);

    res.json({
      data: rows.map(p => ({ ...p, level: getLevel(p.total_poin, s) })),
      meta: { total: Number(countRow?.total ?? 0), page: Number(page), limit: Number(limit) }
    });
  } catch (err) {
    console.error('[pelanggan:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data pelanggan' });
  }
};

// ── POST /api/v1/pelanggan ────────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = pelangganSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const [id] = await db('pelanggan').insert({
      ...value, total_poin: 0, created_at: new Date(), updated_at: new Date()
    });
    const created = await db('pelanggan').where({ id }).first();
    res.status(201).json({ message: 'Pelanggan berhasil ditambahkan', data: created });
  } catch (err) {
    console.error('[pelanggan:store]', err);
    res.status(500).json({ error: 'Gagal menambah pelanggan' });
  }
};

// ── GET /api/v1/pelanggan/:id ─────────────────────────────────────────────────
exports.show = async (req, res) => {
  try {
    const s   = await getPoinSettings();
    const pel = await db('pelanggan').where({ id: req.params.id }).first();
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const [transaksiStat, waLog, transaksiTerbaru] = await Promise.all([
      db('transaksi')
        .where('pelanggan_id', req.params.id)
        .whereNotIn('status', ['dibatalkan'])
        .select(
          db.raw('COUNT(*) as jumlah_transaksi'),
          db.raw('SUM(total_bayar) as total_belanja'),
          db.raw('MAX(tanggal_masuk) as transaksi_terakhir')
        ).first(),

      pel.telepon
        ? db('wa_log as w')
            .leftJoin('transaksi as t', 't.id', 'w.transaksi_id')
            .where(function () {
              this.where('w.telepon', pel.telepon).orWhere('t.pelanggan_id', pel.id);
            })
            .orderBy('w.created_at', 'desc').limit(30)
            .select('w.*', 't.nomor_transaksi')
        : Promise.resolve([]),

      db('transaksi')
        .where('pelanggan_id', req.params.id)
        .orderBy('id', 'desc').limit(5)
        .select('id', 'nomor_transaksi', 'status', 'total_bayar', 'tanggal_masuk')
    ]);

    res.json({
      data: {
        ...pel,
        level: getLevel(pel.total_poin, s),
        jumlah_transaksi:   Number(transaksiStat?.jumlah_transaksi  ?? 0),
        total_belanja:      Number(transaksiStat?.total_belanja      ?? 0),
        transaksi_terakhir: transaksiStat?.transaksi_terakhir,
        wa_log:             waLog,
        transaksi_terbaru:  transaksiTerbaru
      }
    });
  } catch (err) {
    console.error('[pelanggan:show]', err);
    res.status(500).json({ error: 'Gagal mengambil detail pelanggan' });
  }
};

// ── GET /api/v1/pelanggan/:id/order-terakhir ─────────────────────────────────
// Dipakai oleh fitur Quick Repeat Order di form order baru.
// Return: { data: { id, nomor_transaksi, tanggal_masuk, total, layanan: [...] } | null }
exports.orderTerakhir = async (req, res) => {
  try {
    const trx = await db('transaksi')
      .where('pelanggan_id', req.params.id)
      .whereNot('status', 'dibatalkan')
      .orderBy('id', 'desc')
      .first('id', 'nomor_transaksi', 'tanggal_masuk', 'total_bayar', 'status');

    if (!trx) return res.json({ data: null });

    const layanan = await db('detail_transaksi as d')
      .leftJoin('layanan as l', 'l.id', 'd.layanan_id')
      .where('d.transaksi_id', trx.id)
      // Hanya layanan yang masih aktif (id ada) — yang sudah dihapus diabaikan biar
      // tidak gagal saat di-repeat
      .whereNotNull('l.id')
      .select(
        'd.layanan_id',
        'd.nama_layanan as nama',
        'd.jumlah',
        'd.satuan',
        'd.harga_satuan as harga'
      );

    res.json({
      data: {
        id: trx.id,
        nomor_transaksi: trx.nomor_transaksi,
        tanggal_masuk: trx.tanggal_masuk,
        total: Number(trx.total_bayar),
        layanan
      }
    });
  } catch (err) {
    console.error('[pelanggan:orderTerakhir]', err);
    res.status(500).json({ error: 'Gagal mengambil order terakhir pelanggan' });
  }
};

// ── PUT /api/v1/pelanggan/:id ─────────────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = pelangganSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const pel = await db('pelanggan').where({ id: req.params.id }).first();
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    await db('pelanggan').where({ id: req.params.id })
      .update({ ...value, updated_at: new Date() });

    const updated = await db('pelanggan').where({ id: req.params.id }).first();
    res.json({ message: 'Pelanggan berhasil diperbarui', data: updated });
  } catch (err) {
    console.error('[pelanggan:update]', err);
    res.status(500).json({ error: 'Gagal memperbarui pelanggan' });
  }
};

// ── DELETE /api/v1/pelanggan/:id ──────────────────────────────────────────────
exports.destroy = async (req, res) => {
  try {
    const pel = await db('pelanggan').where({ id: req.params.id }).first();
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const count = await db('transaksi').where('pelanggan_id', req.params.id).count('id as n').first();
    if (Number(count?.n) > 0) {
      return res.status(400).json({ error: 'Pelanggan memiliki riwayat transaksi dan tidak dapat dihapus' });
    }

    await db('pelanggan').where({ id: req.params.id }).delete();
    res.json({ message: 'Pelanggan berhasil dihapus' });
  } catch (err) {
    console.error('[pelanggan:destroy]', err);
    res.status(500).json({ error: 'Gagal menghapus pelanggan' });
  }
};

// ── GET /api/v1/pelanggan/:id/wa-log ─────────────────────────────────────────
exports.waLog = async (req, res) => {
  try {
    const pel = await db('pelanggan').where({ id: req.params.id }).first();
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const logs = pel.telepon
      ? await db('wa_log as w')
          .leftJoin('transaksi as t', 't.id', 'w.transaksi_id')
          .where(function () {
            this.where('w.telepon', pel.telepon).orWhere('t.pelanggan_id', pel.id);
          })
          .orderBy('w.created_at', 'desc').limit(50)
          .select('w.*', 't.nomor_transaksi')
      : [];

    res.json({ data: logs });
  } catch (err) {
    console.error('[pelanggan:waLog]', err);
    res.status(500).json({ error: 'Gagal mengambil WA log pelanggan' });
  }
};

// ── IMPORT & EXPORT ───────────────────────────────────────────────────────────
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exportKeExcel, exportKeCSV, buatTemplate } = require('../services/export-pelanggan.service');
const { prosesImport, eksekusiImport } = require('../services/import-pelanggan.service');

const upload = multer({
  dest: '/tmp/uploads',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file harus CSV atau Excel (.xlsx, .xls)'));
    }
  }
});

// GET /api/v1/pelanggan/export?format=xlsx|csv
exports.exportPelanggan = async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;
    const pelanggan = await db('pelanggan').orderBy('nama');

    if (format === 'csv') {
      const csv = exportKeCSV(pelanggan);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=pelanggan.csv');
      return res.send(csv);
    }

    // Excel
    const buffer = exportKeExcel(pelanggan);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=pelanggan.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error('[pelanggan:export]', err);
    res.status(500).json({ error: 'Gagal export pelanggan' });
  }
};

// GET /api/v1/pelanggan/template?format=xlsx|csv
exports.downloadTemplate = async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;
    const buffer = buatTemplate(format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=template-pelanggan.csv');
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=template-pelanggan.xlsx');
    }
    res.send(buffer);
  } catch (err) {
    console.error('[pelanggan:template]', err);
    res.status(500).json({ error: 'Gagal download template' });
  }
};

// POST /api/v1/pelanggan/import/preview
exports.importPreview = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File tidak ditemukan' });
      }

      const semuaPelanggan = await db('pelanggan').select('id', 'nama', 'telepon');
      const hasil = await prosesImport(req.file.path, req.file.mimetype, semuaPelanggan);

      // Cleanup file
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        data: hasil
      });
    } catch (err) {
      console.error('[pelanggan:import-preview]', err);
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: err.message || 'Gagal memproses file' });
    }
  }
];

// POST /api/v1/pelanggan/import/konfirmasi
exports.importKonfirmasi = async (req, res) => {
  try {
    const { preview, aksiDuplikat } = req.body;

    if (!preview) {
      return res.status(400).json({ error: 'Data preview tidak ditemukan' });
    }

    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '../../data/laundry.db');
    const sqlite = new Database(dbPath);

    const hasil = await eksekusiImport(sqlite, preview, aksiDuplikat);
    sqlite.close();

    res.json({
      success: true,
      message: 'Import berhasil',
      data: hasil
    });
  } catch (err) {
    console.error('[pelanggan:import-konfirmasi]', err);
    res.status(500).json({ error: err.message || 'Gagal import data' });
  }
};
