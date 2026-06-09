const db = require('../database/connection');

const getDateRange = (req) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || today.slice(0, 7) + '-01';
  const end   = req.query.end   || today;
  return { start, end };
};

// ── GET /api/v1/laporan ───────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const [
      omsetRow,
      statusRows,
      pelangganBaru,
      distribusiLayanan,
      harianRaw,
      poinStat,
      promoStat,
      kasRow,
      depositStat
    ] = await Promise.all([
      db('transaksi')
        .whereNotIn('status', ['dibatalkan'])
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') >= ?", [start])
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') <= ?", [end])
        .select(
          db.raw('COALESCE(SUM(total_bayar), 0) as total_omset'),
          db.raw('COUNT(*) as jumlah_transaksi'),
          db.raw('COALESCE(AVG(total_bayar), 0) as rata_rata'),
          db.raw('COALESCE(SUM(diskon), 0) as total_diskon')
        ).first(),

      db('transaksi')
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') >= ?", [start])
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') <= ?", [end])
        .groupBy('status')
        .select('status', db.raw('COUNT(*) as jumlah')),

      db('pelanggan')
        .whereRaw("date(created_at/1000,'unixepoch') >= ?", [start])
        .whereRaw("date(created_at/1000,'unixepoch') <= ?", [end])
        .count('id as total').first(),

      db('detail_transaksi as d')
        .leftJoin('transaksi as t', 't.id', 'd.transaksi_id')
        .leftJoin('layanan as l', 'l.id', 'd.layanan_id')
        .whereNotIn('t.status', ['dibatalkan'])
        .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') >= ?", [start])
        .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') <= ?", [end])
        .groupBy('d.nama_layanan')
        .orderByRaw('SUM(d.subtotal) DESC')
        .limit(10)
        .select(
          'd.nama_layanan',
          db.raw('SUM(d.jumlah) as total_jumlah'),
          db.raw('COALESCE(SUM(d.subtotal), 0) as total_omset'),
          db.raw('MAX(COALESCE(l.hpp, 0)) as hpp'),
          db.raw('MAX(COALESCE(l.margin_persen, 0)) as margin_persen')
        ),

      db.raw(`
        WITH RECURSIVE dates(d) AS (
          SELECT date(?)
          UNION ALL
          SELECT date(d,'+1 day') FROM dates WHERE d < date(?)
        )
        SELECT dates.d AS tanggal,
               COALESCE(SUM(t.total_bayar),0) AS omset,
               COALESCE(COUNT(t.id),0) AS jumlah
        FROM dates
        LEFT JOIN transaksi t
          ON date(t.tanggal_masuk/1000,'unixepoch')=dates.d AND t.status NOT IN ('dibatalkan')
        GROUP BY dates.d
        ORDER BY dates.d ASC
      `, [start, end]),

      db('riwayat_poin')
        .whereRaw("date(created_at/1000,'unixepoch') >= ?", [start])
        .whereRaw("date(created_at/1000,'unixepoch') <= ?", [end])
        .select(
          db.raw("COALESCE(SUM(CASE WHEN jenis='tambah' THEN jumlah_poin ELSE 0 END),0) as poin_diberikan"),
          // jenis poin terpakai dicatat sbg 'kurang' (bukan 'redeem') — sebelumnya selalu 0
          db.raw("COALESCE(SUM(CASE WHEN jenis='kurang' THEN jumlah_poin ELSE 0 END),0) as poin_ditukarkan")
        ).first(),

      db('transaksi')
        .whereNotNull('paket_promo_id')
        .whereNotIn('status', ['dibatalkan'])
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') >= ?", [start])
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') <= ?", [end])
        .select(
          db.raw('COUNT(*) as jumlah_pakai_promo'),
          db.raw('COALESCE(SUM(diskon),0) as total_diskon_promo')
        ).first(),

      db('kas')
        .whereRaw("tanggal >= ?", [start])
        .whereRaw("tanggal <= ?", [end])
        .select(
          db.raw("COALESCE(SUM(CASE WHEN jenis='masuk' THEN jumlah ELSE 0 END),0) as total_masuk"),
          db.raw("COALESCE(SUM(CASE WHEN jenis='keluar' THEN jumlah ELSE 0 END),0) as total_keluar")
        ).first(),

      // deposit stats
      (async () => {
        try {
          const [topupRow, bayarRow, kelebihanRow, saldoRow] = await Promise.all([
            db('mutasi_deposit').where('jenis', 'topup')
              .whereRaw("date(created_at/1000,'unixepoch') >= ?", [start])
              .whereRaw("date(created_at/1000,'unixepoch') <= ?", [end])
              .sum('nominal as total').first(),
            db('mutasi_deposit').where('jenis', 'bayar')
              .whereRaw("date(created_at/1000,'unixepoch') >= ?", [start])
              .whereRaw("date(created_at/1000,'unixepoch') <= ?", [end])
              .sum('nominal as total').first(),
            db('mutasi_deposit').where('jenis', 'kelebihan')
              .whereRaw("date(created_at/1000,'unixepoch') >= ?", [start])
              .whereRaw("date(created_at/1000,'unixepoch') <= ?", [end])
              .sum('nominal as total').first(),
            db('deposit_pelanggan').sum('saldo as total').first()
          ]);
          return {
            total_topup:      Number(topupRow?.total     ?? 0),
            total_pemakaian:  Number(bayarRow?.total     ?? 0),
            total_kelebihan:  Number(kelebihanRow?.total ?? 0),
            saldo_beredar:    Number(saldoRow?.total     ?? 0)
          };
        } catch { return { total_topup: 0, total_pemakaian: 0, total_kelebihan: 0, saldo_beredar: 0 }; }
      })()
    ]);

    const statusMap = {};
    statusRows.forEach(r => { statusMap[r.status] = Number(r.jumlah); });

    // db.raw returns array in better-sqlite3 knex
    const harian = Array.isArray(harianRaw) ? harianRaw : (harianRaw[0] || []);

    res.json({
      periode: { start, end },
      omset: {
        total:        Number(omsetRow?.total_omset      ?? 0),
        jumlah:       Number(omsetRow?.jumlah_transaksi ?? 0),
        rata_rata:    Math.round(Number(omsetRow?.rata_rata    ?? 0)),
        total_diskon: Number(omsetRow?.total_diskon     ?? 0)
      },
      status_transaksi: statusMap,
      pelanggan_baru:   Number(pelangganBaru?.total ?? 0),
      distribusi_layanan: distribusiLayanan,
      harian,
      poin: {
        diberikan:  Number(poinStat?.poin_diberikan  ?? 0),
        ditukarkan: Number(poinStat?.poin_ditukarkan ?? 0)
      },
      promo: {
        jumlah_pakai: Number(promoStat?.jumlah_pakai_promo  ?? 0),
        total_diskon: Number(promoStat?.total_diskon_promo   ?? 0)
      },
      laba_rugi: {
        pendapatan:  Number(kasRow?.total_masuk  ?? 0),
        pengeluaran: Number(kasRow?.total_keluar ?? 0),
        laba:        Number(kasRow?.total_masuk  ?? 0) - Number(kasRow?.total_keluar ?? 0)
      },
      deposit: depositStat
    });
  } catch (err) {
    console.error('[laporan:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data laporan' });
  }
};

// ── GET /api/v1/laporan/layanan ───────────────────────────────────────────────
exports.layanan = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const kategoriId = req.query.kategori_id;

    let query = db('detail_transaksi as dt')
      .leftJoin('layanan as l', 'l.id', 'dt.layanan_id')
      .leftJoin('kategori_layanan as k', 'k.id', 'l.kategori_id')
      .leftJoin('transaksi as t', 't.id', 'dt.transaksi_id')
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') >= ?", [start])
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') <= ?", [end])
      .whereNotIn('t.status', ['dibatalkan']);

    if (kategoriId) {
      query = query.where('l.kategori_id', kategoriId);
    }

    const rows = await query
      .groupBy('l.id')
      .orderByRaw('SUM(dt.subtotal) DESC')
      .select(
        'l.nama',
        'k.nama as kategori',
        'l.satuan',
        db.raw('COUNT(DISTINCT dt.transaksi_id) as total_order'),
        db.raw('SUM(dt.jumlah) as total_volume'),
        db.raw('SUM(dt.subtotal) as total_omset')
      );

    // Hitung ringkasan
    const totalLayanan = rows.length;
    const layananTerlaku = rows.length > 0 ? rows.reduce((max, r) =>
      Number(r.total_order) > Number(max.total_order) ? r : max
    ) : null;
    const layananOmsetTertinggi = rows.length > 0 ? rows.reduce((max, r) =>
      Number(r.total_omset) > Number(max.total_omset) ? r : max
    ) : null;

    const totalVolumeKiloan = rows
      .filter(r => r.satuan === 'kg')
      .reduce((sum, r) => sum + Number(r.total_volume), 0);

    res.json({
      periode: { start, end },
      layanan: rows.map(r => ({
        nama: r.nama,
        kategori: r.kategori,
        satuan: r.satuan,
        total_order: Number(r.total_order),
        total_volume: Number(r.total_volume),
        total_omset: Number(r.total_omset),
        rata_per_order: Math.round(Number(r.total_omset) / Number(r.total_order))
      })),
      ringkasan: {
        total_layanan: totalLayanan,
        layanan_terlaku: layananTerlaku ? {
          nama: layananTerlaku.nama,
          total_order: Number(layananTerlaku.total_order)
        } : null,
        layanan_omset_tertinggi: layananOmsetTertinggi ? {
          nama: layananOmsetTertinggi.nama,
          total_omset: Number(layananOmsetTertinggi.total_omset)
        } : null,
        total_volume_kiloan: totalVolumeKiloan
      }
    });
  } catch (err) {
    console.error('[laporan:layanan]', err);
    res.status(500).json({ error: 'Gagal mengambil laporan layanan' });
  }
};

// ── GET /api/v1/laporan/layanan/export ────────────────────────────────────────
exports.exportLayanan = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const kategoriId = req.query.kategori_id;

    let query = db('detail_transaksi as dt')
      .leftJoin('layanan as l', 'l.id', 'dt.layanan_id')
      .leftJoin('kategori_layanan as k', 'k.id', 'l.kategori_id')
      .leftJoin('transaksi as t', 't.id', 'dt.transaksi_id')
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') >= ?", [start])
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') <= ?", [end])
      .whereNotIn('t.status', ['dibatalkan']);

    if (kategoriId) {
      query = query.where('l.kategori_id', kategoriId);
    }

    const rows = await query
      .groupBy('l.id')
      .orderByRaw('SUM(dt.subtotal) DESC')
      .select(
        'l.nama',
        'k.nama as kategori',
        'l.satuan',
        db.raw('COUNT(DISTINCT dt.transaksi_id) as total_order'),
        db.raw('SUM(dt.jumlah) as total_volume'),
        db.raw('SUM(dt.subtotal) as total_omset'),
        db.raw('CAST(SUM(dt.subtotal) AS REAL) / COUNT(DISTINCT dt.transaksi_id) as rata_per_order')
      );

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const BOM = '﻿';
    const header = [
      'Nama Layanan', 'Kategori', 'Satuan', 'Total Order',
      'Total Volume', 'Total Omset', 'Rata-rata/Order'
    ];

    const csv = BOM + [
      header.map(escape).join(','),
      ...rows.map(r => [
        r.nama, r.kategori, r.satuan,
        r.total_order, r.total_volume, r.total_omset,
        Math.round(r.rata_per_order)
      ].map(escape).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-layanan-${start}-sd-${end}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[laporan:exportLayanan]', err);
    res.status(500).json({ error: 'Gagal mengekspor laporan layanan' });
  }
};

// ── GET /api/v1/laporan/pelanggan ─────────────────────────────────────────────
exports.pelanggan = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const search = req.query.search || '';

    // Gunakan CASE untuk filter kondisi di dalam agregasi
    let query = db('pelanggan as p')
      .leftJoin('transaksi as t', 't.pelanggan_id', 'p.id')
      .groupBy('p.id')
      .select(
        'p.id',
        'p.nama',
        'p.telepon',
        'p.total_poin',
        db.raw(`COUNT(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.id END) as total_order`, [start, end]),
        db.raw(`COALESCE(SUM(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.total_bayar END), 0) as total_belanja`, [start, end]),
        db.raw(`COALESCE(AVG(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.total_bayar END), 0) as rata_order`, [start, end]),
        db.raw(`MAX(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.tanggal_masuk END) as terakhir_order`, [start, end])
      );

    if (search) {
      query = query.where('p.nama', 'like', `%${search}%`);
    }

    // Hanya pelanggan yang punya transaksi di periode ini
    const rows = await query.having('total_order', '>', 0).orderBy('total_belanja', 'desc');

    // Hitung pelanggan baru di periode ini
    let pelangganBaruQuery = db('pelanggan')
      .whereRaw("date(created_at/1000,'unixepoch') >= ?", [start])
      .whereRaw("date(created_at/1000,'unixepoch') <= ?", [end])
      .count('id as total')
      .first();

    if (search) {
      pelangganBaruQuery = pelangganBaruQuery.where('nama', 'like', `%${search}%`);
    }

    const pelangganBaru = await pelangganBaruQuery;

    // Ringkasan
    const totalPelangganAktif = rows.length;
    const pelangganTersetia = rows.length > 0 ? rows.reduce((max, r) =>
      Number(r.total_order) > Number(max.total_order) ? r : max
    ) : null;
    const pelangganTopSpender = rows.length > 0 ? rows[0] : null;

    // Helper untuk level poin
    const getPoinLevel = (poin) => {
      if (poin >= 1000) return 'Gold';
      if (poin >= 500) return 'Silver';
      return 'Bronze';
    };

    res.json({
      periode: { start, end },
      pelanggan: rows.map(r => ({
        id: r.id,
        nama: r.nama,
        telepon: r.telepon,
        total_order: Number(r.total_order),
        total_belanja: Number(r.total_belanja),
        rata_order: Math.round(Number(r.rata_order)),
        terakhir_order: r.terakhir_order,
        total_poin: Number(r.total_poin || 0),
        level_poin: getPoinLevel(Number(r.total_poin || 0))
      })),
      ringkasan: {
        total_pelanggan_aktif: totalPelangganAktif,
        pelanggan_tersetia: pelangganTersetia ? {
          nama: pelangganTersetia.nama,
          total_order: Number(pelangganTersetia.total_order)
        } : null,
        pelanggan_top_spender: pelangganTopSpender ? {
          nama: pelangganTopSpender.nama,
          total_belanja: Number(pelangganTopSpender.total_belanja)
        } : null,
        pelanggan_baru: Number(pelangganBaru?.total ?? 0)
      }
    });
  } catch (err) {
    console.error('[laporan:pelanggan]', err);
    res.status(500).json({ error: 'Gagal mengambil laporan pelanggan' });
  }
};

// ── GET /api/v1/laporan/pelanggan/:id/detail ──────────────────────────────────
exports.pelangganDetail = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const pelangganId = req.params.id;

    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
      .where('t.pelanggan_id', pelangganId)
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') >= ?", [start])
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') <= ?", [end])
      .orderBy('t.tanggal_masuk', 'desc')
      .select(
        't.id',
        't.nomor_transaksi',
        't.tanggal_masuk',
        't.status',
        't.total_harga',
        't.total_bayar',
        'p.nama as pelanggan_nama',
        db.raw(`(SELECT GROUP_CONCAT(nama_layanan || ' (' || jumlah || ' ' ||
                 CASE WHEN layanan_id IN (SELECT id FROM layanan WHERE satuan='kg') THEN 'kg' ELSE 'pcs' END
                 || ')', ', ')
                 FROM detail_transaksi WHERE transaksi_id = t.id) as layanan`)
      );

    res.json({
      periode: { start, end },
      pelanggan_id: pelangganId,
      riwayat: rows.map(r => ({
        id: r.id,
        nomor_transaksi: r.nomor_transaksi,
        tanggal: r.tanggal_masuk,
        status: r.status,
        layanan: r.layanan || '–',
        total_harga: Number(r.total_harga),
        total_bayar: Number(r.total_bayar)
      }))
    });
  } catch (err) {
    console.error('[laporan:pelangganDetail]', err);
    res.status(500).json({ error: 'Gagal mengambil detail pelanggan' });
  }
};

// ── GET /api/v1/laporan/pelanggan/export ──────────────────────────────────────
exports.exportPelanggan = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);
    const search = req.query.search || '';

    // Gunakan CASE untuk filter kondisi di dalam agregasi
    let query = db('pelanggan as p')
      .leftJoin('transaksi as t', 't.pelanggan_id', 'p.id')
      .groupBy('p.id')
      .select(
        'p.nama',
        'p.telepon',
        'p.total_poin',
        db.raw(`COUNT(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.id END) as total_order`, [start, end]),
        db.raw(`COALESCE(SUM(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.total_bayar END), 0) as total_belanja`, [start, end]),
        db.raw(`COALESCE(AVG(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.total_bayar END), 0) as rata_order`, [start, end]),
        db.raw(`MAX(CASE
          WHEN t.status != 'dibatalkan'
            AND date(t.tanggal_masuk/1000,'unixepoch') >= ?
            AND date(t.tanggal_masuk/1000,'unixepoch') <= ?
          THEN t.tanggal_masuk END) as terakhir_order`, [start, end])
      );

    if (search) {
      query = query.where('p.nama', 'like', `%${search}%`);
    }

    const rows = await query.having('total_order', '>', 0).orderBy('total_belanja', 'desc');

    const getPoinLevel = (poin) => {
      if (poin >= 1000) return 'Gold';
      if (poin >= 500) return 'Silver';
      return 'Bronze';
    };

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const BOM = '﻿';
    const header = [
      'Nama Pelanggan', 'Telepon', 'Total Order', 'Total Belanja',
      'Rata-rata/Order', 'Terakhir Order', 'Total Poin', 'Level Poin'
    ];

    const csv = BOM + [
      header.map(escape).join(','),
      ...rows.map(r => {
        const terakhir = r.terakhir_order ? new Date(r.terakhir_order).toLocaleDateString('id-ID') : '–';
        return [
          r.nama, r.telepon, r.total_order, r.total_belanja,
          Math.round(r.rata_order), terakhir, r.total_poin || 0,
          getPoinLevel(r.total_poin || 0)
        ].map(escape).join(',');
      })
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-pelanggan-${start}-sd-${end}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[laporan:exportPelanggan]', err);
    res.status(500).json({ error: 'Gagal mengekspor laporan pelanggan' });
  }
};

// ── GET /api/v1/laporan/export ────────────────────────────────────────────────
exports.exportCsv = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p',    'p.id',  't.pelanggan_id')
      .leftJoin('users as u',        'u.id',  't.user_id')
      .leftJoin('paket_promo as pr', 'pr.id', 't.paket_promo_id')
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') >= ?", [start])
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') <= ?", [end])
      .orderBy('t.tanggal_masuk')
      .select(
        't.nomor_transaksi',
        // tanggal_masuk tersimpan ms-epoch → format jadi tanggal terbaca untuk CSV
        db.raw("datetime(t.tanggal_masuk/1000,'unixepoch') as tanggal_masuk"),
        't.status',
        'p.nama as pelanggan', 'p.telepon as telepon_pelanggan',
        't.total_harga', 't.diskon', 't.poin_digunakan',
        't.total_bayar', 't.metode_bayar',
        'pr.nama as promo', 'u.nama as kasir',
        db.raw(`(SELECT GROUP_CONCAT(nama_layanan || ' (' || jumlah || ')', ', ')
                 FROM detail_transaksi WHERE transaksi_id = t.id) as layanan`)
      );

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const BOM    = '﻿';
    const header = [
      'No Transaksi', 'Tanggal', 'Status', 'Pelanggan', 'Telepon',
      'Total Harga', 'Diskon', 'Poin Digunakan', 'Total Bayar',
      'Metode Bayar', 'Promo', 'Kasir', 'Layanan'
    ];

    const csv = BOM + [
      header.map(escape).join(','),
      ...rows.map(r => [
        r.nomor_transaksi, r.tanggal_masuk, r.status,
        r.pelanggan || '', r.telepon_pelanggan || '',
        r.total_harga, r.diskon, r.poin_digunakan, r.total_bayar,
        r.metode_bayar, r.promo || '', r.kasir || '', r.layanan || ''
      ].map(escape).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-${start}-sd-${end}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[laporan:export]', err);
    res.status(500).json({ error: 'Gagal mengekspor laporan' });
  }
};
