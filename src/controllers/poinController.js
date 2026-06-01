const Joi = require('joi');
const db  = require('../database/connection');

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  poin_per_nominal:    '10000',
  nilai_tukar_poin:    '100',
  min_poin_redeem:     '100',
  level_silver_min:    '500',
  level_gold_min:      '2000',
  level_platinum_min:  '5000'
};

const getPoinSettings = async () => {
  const keys = Object.keys(DEFAULT_SETTINGS);
  const rows = await db('pengaturan').whereIn('kunci', keys);
  const map  = Object.fromEntries(rows.map(r => [r.kunci, r.nilai]));
  return Object.fromEntries(keys.map(k => [k, parseInt(map[k] ?? DEFAULT_SETTINGS[k]) || 0]));
};

const getLevel = (poin, s) => {
  if (poin >= s.level_platinum_min) return { label: 'Platinum', color: '#7c3aed', next: null,      nextMin: null };
  if (poin >= s.level_gold_min)     return { label: 'Gold',     color: '#d97706', next: 'Platinum', nextMin: s.level_platinum_min };
  if (poin >= s.level_silver_min)   return { label: 'Silver',   color: '#6b7280', next: 'Gold',     nextMin: s.level_gold_min };
  return                                   { label: 'Bronze',   color: '#92400e', next: 'Silver',   nextMin: s.level_silver_min };
};

// ── GET /api/v1/poin/pelanggan ────────────────────────────────────────────────
exports.indexPelanggan = async (req, res) => {
  try {
    const s     = await getPoinSettings();
    const { q = '', page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const query = db('pelanggan as p')
      .leftJoin(
        db('transaksi').whereNotIn('status', ['dibatalkan']).groupBy('pelanggan_id')
          .select('pelanggan_id', db.raw('COUNT(*) as jumlah_transaksi'), db.raw('SUM(total_bayar) as total_belanja'))
          .as('tr'),
        'tr.pelanggan_id', 'p.id'
      )
      .orderBy('p.total_poin', 'desc')
      .select(
        'p.id', 'p.nama', 'p.telepon', 'p.total_poin', 'p.created_at',
        db.raw('COALESCE(tr.jumlah_transaksi, 0) as jumlah_transaksi'),
        db.raw('COALESCE(tr.total_belanja, 0) as total_belanja')
      );
    if (q) query.where(function () { this.where('p.nama', 'like', `%${q}%`).orWhere('p.telepon', 'like', `%${q}%`); });

    const [rows, countRow] = await Promise.all([
      query.clone().limit(Number(limit)).offset(offset),
      query.clone().count('p.id as total').first()
    ]);

    const data = rows.map(p => ({ ...p, level: getLevel(p.total_poin, s) }));

    // Level stats
    const levelStats = {
      Platinum: data.filter(p => p.level.label === 'Platinum').length,
      Gold:     data.filter(p => p.level.label === 'Gold').length,
      Silver:   data.filter(p => p.level.label === 'Silver').length,
      Bronze:   data.filter(p => p.level.label === 'Bronze').length,
    };
    // For all-time stats, run count without pagination
    const allCount = await db('pelanggan').count('id as n').first();
    const totalPoin = await db('pelanggan').sum('total_poin as total').first();

    res.json({
      data,
      meta: {
        total: Number(countRow?.total ?? 0),
        page:  Number(page),
        limit: Number(limit)
      },
      stats: {
        level_stats:  levelStats,
        total_pelanggan: Number(allCount?.n ?? 0),
        total_poin_beredar: Number(totalPoin?.total ?? 0),
        settings: s
      }
    });
  } catch (err) {
    console.error('[poin:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data pelanggan poin' });
  }
};

// ── GET /api/v1/poin/pelanggan/:id ────────────────────────────────────────────
exports.showPelanggan = async (req, res) => {
  try {
    const s    = await getPoinSettings();
    const pel  = await db('pelanggan').where({ id: req.params.id }).first();
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const [riwayat, transaksiStat] = await Promise.all([
      db('riwayat_poin as rp')
        .leftJoin('transaksi as t', 't.id', 'rp.transaksi_id')
        .where('rp.pelanggan_id', req.params.id)
        .orderBy('rp.id', 'desc')
        .limit(30)
        .select('rp.*', 't.nomor_transaksi'),
      db('transaksi')
        .where('pelanggan_id', req.params.id)
        .whereNotIn('status', ['dibatalkan'])
        .select(
          db.raw('COUNT(*) as jumlah_transaksi'),
          db.raw('SUM(total_bayar) as total_belanja'),
          db.raw('MAX(tanggal_masuk) as transaksi_terakhir')
        )
        .first()
    ]);

    const level = getLevel(pel.total_poin, s);
    const progress = level.next
      ? Math.round(((pel.total_poin - (getLevel(pel.total_poin - 1, s).nextMin || 0)) /
          (level.nextMin - (getLevel(pel.total_poin - 1, s).nextMin || 0))) * 100)
      : 100;

    res.json({
      data: {
        ...pel,
        level,
        riwayat,
        jumlah_transaksi: Number(transaksiStat?.jumlah_transaksi ?? 0),
        total_belanja:    Number(transaksiStat?.total_belanja    ?? 0),
        transaksi_terakhir: transaksiStat?.transaksi_terakhir
      },
      progress: Math.max(0, Math.min(100, progress || 0))
    });
  } catch (err) {
    console.error('[poin:show]', err);
    res.status(500).json({ error: 'Gagal mengambil detail pelanggan' });
  }
};

// ── POST /api/v1/poin/pelanggan/:id/sesuaikan ────────────────────────────────
exports.sesuaikan = async (req, res) => {
  const { error, value } = Joi.object({
    delta:      Joi.number().not(0).required(),
    keterangan: Joi.string().max(200).allow('', null)
  }).validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const pel = await db('pelanggan').where({ id: req.params.id }).first();
    if (!pel) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

    const newTotal = Math.max(0, pel.total_poin + value.delta);
    const jenis    = value.delta > 0 ? 'tambah' : 'kurang';

    await db.transaction(async (trx) => {
      await trx('pelanggan').where({ id: req.params.id })
        .update({ total_poin: newTotal, updated_at: new Date() });

      // Upsert cache poin_pelanggan (insert bila belum ada — cegah desync)
      const existingPP = await trx('poin_pelanggan').where({ pelanggan_id: req.params.id }).first();
      if (existingPP) {
        await trx('poin_pelanggan').where({ pelanggan_id: req.params.id })
          .update({ total_poin: newTotal, updated_at: new Date() });
      } else {
        await trx('poin_pelanggan').insert({
          pelanggan_id: req.params.id, total_poin: newTotal, updated_at: new Date()
        });
      }

      await trx('riwayat_poin').insert({
        pelanggan_id: req.params.id,
        transaksi_id: null,
        jenis,
        jumlah_poin:  Math.abs(value.delta),
        keterangan:   value.keterangan || `Penyesuaian manual oleh ${req.session?.user?.nama || 'admin'}`,
        created_at:   new Date()
      });
    });

    res.json({ message: `Poin berhasil disesuaikan. Total: ${newTotal} poin`, total_poin: newTotal });
  } catch (err) {
    console.error('[poin:sesuaikan]', err);
    res.status(500).json({ error: 'Gagal menyesuaikan poin' });
  }
};

// ── GET /api/v1/poin/pengaturan ───────────────────────────────────────────────
exports.getPengaturan = async (req, res) => {
  try {
    const s = await getPoinSettings();
    res.json({ data: s });
  } catch (err) {
    console.error('[poin:getPengaturan]', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan poin' });
  }
};

// ── PUT /api/v1/poin/pengaturan ───────────────────────────────────────────────
exports.updatePengaturan = async (req, res) => {
  const keys = Object.keys(DEFAULT_SETTINGS);
  const schema = Joi.object(Object.fromEntries(
    keys.map(k => [k, Joi.number().integer().min(0)])
  )).min(1);

  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    for (const [key, val] of Object.entries(value)) {
      const existing = await db('pengaturan').where({ kunci: key }).first();
      if (existing) {
        await db('pengaturan').where({ kunci: key }).update({ nilai: String(val), updated_at: new Date() });
      } else {
        await db('pengaturan').insert({
          kunci: key, nilai: String(val),
          deskripsi: DEFAULT_SETTINGS[key] ?? '',
          created_at: new Date(), updated_at: new Date()
        });
      }
    }
    res.json({ message: 'Pengaturan poin berhasil disimpan', data: await getPoinSettings() });
  } catch (err) {
    console.error('[poin:updatePengaturan]', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan poin' });
  }
};
