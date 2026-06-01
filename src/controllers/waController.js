const db                 = require('../database/connection');
const transaksiModel     = require('../models/transaksiModel');
const { buildNota, buildTagihan, buildNotifSelesai, generateURL, buildBroadcast, getSettings } = require('../services/wa.service');

const getDefaultWAMode = async () => {
  const s = await getSettings();
  return s.wa_mode_default || s.wa_mode || 'business';
};

// ── Helper: ambil transaksi + pastikan punya pelanggan ber-WA ────────────────
const getTransaksiWithPhone = async (id) => {
  const t = await transaksiModel.findById(id);
  if (!t)                    return { error: 'Transaksi tidak ditemukan', code: 404 };
  if (!t.pelanggan_id)       return { error: 'Transaksi tidak memiliki pelanggan', code: 400 };
  if (!t.pelanggan_telepon)  return { error: 'Pelanggan tidak memiliki nomor telepon', code: 400 };
  return { t };
};

// ── GET /api/v1/transaksi/:id/wa/nota ───────────────────────────────────────
exports.nota = async (req, res) => {
  try {
    const { t, error, code } = await getTransaksiWithPhone(req.params.id);
    if (error) return res.status(code).json({ error });

    const defaultMode = await getDefaultWAMode();
    const mode = ['regular', 'business'].includes(req.query.mode) ? req.query.mode : defaultMode;
    const teks = await buildNota(t, mode);
    const url  = generateURL(t.pelanggan_telepon, teks, mode);
    res.json({ url, teks, telepon: t.pelanggan_telepon, pelanggan: t.pelanggan_nama, mode });
  } catch (err) {
    console.error('[wa:nota]', err);
    res.status(500).json({ error: 'Gagal generate pesan WA nota' });
  }
};

// ── GET /api/v1/transaksi/:id/wa/tagihan ────────────────────────────────────
exports.tagihan = async (req, res) => {
  try {
    const { t, error, code } = await getTransaksiWithPhone(req.params.id);
    if (error) return res.status(code).json({ error });

    const defaultMode = await getDefaultWAMode();
    const mode = ['regular', 'business'].includes(req.query.mode) ? req.query.mode : defaultMode;
    const teks = await buildTagihan(t, mode);
    const url  = generateURL(t.pelanggan_telepon, teks, mode);
    res.json({ url, teks, telepon: t.pelanggan_telepon, pelanggan: t.pelanggan_nama, mode });
  } catch (err) {
    console.error('[wa:tagihan]', err);
    res.status(500).json({ error: 'Gagal generate pesan WA tagihan' });
  }
};

// ── GET /api/v1/transaksi/:id/wa/notif ──────────────────────────────────────
exports.notif = async (req, res) => {
  try {
    const { t, error, code } = await getTransaksiWithPhone(req.params.id);
    if (error) return res.status(code).json({ error });

    const defaultMode = await getDefaultWAMode();
    const mode = ['regular', 'business'].includes(req.query.mode) ? req.query.mode : defaultMode;
    const teks = await buildNotifSelesai(t, mode);
    const url  = generateURL(t.pelanggan_telepon, teks, mode);
    res.json({ url, teks, telepon: t.pelanggan_telepon, pelanggan: t.pelanggan_nama, mode });
  } catch (err) {
    console.error('[wa:notif]', err);
    res.status(500).json({ error: 'Gagal generate pesan WA notifikasi' });
  }
};

// ── GET /api/v1/wa/log-list?transaksi_id=&page=&limit= ───────────────────────
exports.logList = async (req, res) => {
  try {
    const { transaksi_id, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const build = (q) => {
      if (transaksi_id) q.where('w.transaksi_id', transaksi_id);
      return q;
    };

    const [rows, countRow] = await Promise.all([
      build(db('wa_log as w')
        .leftJoin('transaksi as t', 't.id', 'w.transaksi_id')
        .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
        .orderBy('w.created_at', 'desc')
        .limit(Number(limit)).offset(offset)
        .select('w.*', 't.nomor_transaksi', 'p.nama as pelanggan_nama')),
      build(db('wa_log as w').leftJoin('transaksi as t', 't.id', 'w.transaksi_id')
        .count('w.id as total').first())
    ]);

    res.json({ data: rows, meta: { total: Number(countRow?.total ?? 0), page: Number(page), limit: Number(limit) } });
  } catch (err) {
    console.error('[wa:logList]', err);
    res.status(500).json({ error: 'Gagal mengambil log WA' });
  }
};

// ── GET /api/v1/wa/tagihan — order belum lunas ────────────────────────────────
exports.tagihanList = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
      .whereNotIn('t.status', ['dibatalkan'])
      .whereRaw('t.bayar < t.total_bayar')
      .whereNotNull('t.pelanggan_id')
      .whereNotNull('p.telepon')
      .orderBy('t.tanggal_masuk', 'desc')
      .limit(Number(limit)).offset(offset)
      .select(
        't.id', 't.nomor_transaksi', 't.status', 't.total_bayar', 't.bayar',
        't.tanggal_masuk',
        'p.id as pelanggan_id', 'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
        db.raw('(t.total_bayar - t.bayar) as sisa_tagihan')
      );

    res.json({ data: rows });
  } catch (err) {
    console.error('[wa:tagihanList]', err);
    res.status(500).json({ error: 'Gagal mengambil tagihan' });
  }
};

// ── POST /api/v1/wa/broadcast ─────────────────────────────────────────────────
exports.broadcast = async (req, res) => {
  try {
    const { pesan, pelanggan_ids = [], level_filter, mode: reqMode } = req.body;
    const defaultMode = await getDefaultWAMode();
    const waMode = ['regular', 'business'].includes(reqMode) ? reqMode : defaultMode;
    if (!pesan?.trim()) return res.status(400).json({ error: 'Pesan wajib diisi' });

    let query = db('pelanggan').whereNotNull('telepon').where('telepon', '!=', '');

    if (pelanggan_ids.length > 0) {
      query.whereIn('id', pelanggan_ids);
    }

    const pelanggan = await query.select('id', 'nama', 'telepon', 'total_poin').orderBy('nama');

    // Ambil threshold level dari pengaturan (bukan hardcode) agar konsisten dgn modul poin
    const thRows = await db('pengaturan')
      .whereIn('kunci', ['level_silver_min', 'level_gold_min', 'level_platinum_min']);
    const th = Object.fromEntries(thRows.map(r => [r.kunci, parseInt(r.nilai) || 0]));
    const silverMin   = th.level_silver_min   || 500;
    const goldMin     = th.level_gold_min     || 2000;
    const platinumMin = th.level_platinum_min || 5000;

    // Filter by level if requested
    const targets = pelanggan.filter(p => {
      if (!level_filter || level_filter === 'all') return true;
      const poin = p.total_poin || 0;
      if (level_filter === 'platinum') return poin >= platinumMin;
      if (level_filter === 'gold')     return poin >= goldMin     && poin < platinumMin;
      if (level_filter === 'silver')   return poin >= silverMin   && poin < goldMin;
      if (level_filter === 'bronze')   return poin < silverMin;
      return true;
    });

    const result = buildBroadcast(pesan, targets, waMode);
    res.json({ data: result, total: result.length, mode: waMode });
  } catch (err) {
    console.error('[wa:broadcast]', err);
    res.status(500).json({ error: 'Gagal menyiapkan broadcast' });
  }
};

// ── POST /api/v1/wa/log — catat WA terkirim ─────────────────────────────────
exports.log = async (req, res) => {
  try {
    const { telepon, pesan, transaksi_id, status = 'terkirim', wa_mode = 'business' } = req.body;
    if (!telepon || !pesan) {
      return res.status(400).json({ error: 'telepon dan pesan wajib diisi' });
    }

    const [id] = await db('wa_log').insert({
      telepon,
      pesan,
      status,
      wa_mode: ['regular', 'business'].includes(wa_mode) ? wa_mode : 'business',
      transaksi_id: transaksi_id || null,
      response_api: null,
      created_at:   new Date()
    });

    res.status(201).json({ message: 'WA log berhasil dicatat', id });
  } catch (err) {
    console.error('[wa:log]', err);
    res.status(500).json({ error: 'Gagal menyimpan WA log' });
  }
};
