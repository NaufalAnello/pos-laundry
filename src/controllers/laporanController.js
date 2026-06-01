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
        .whereRaw("date(tanggal_masuk) >= ?", [start])
        .whereRaw("date(tanggal_masuk) <= ?", [end])
        .select(
          db.raw('COALESCE(SUM(total_bayar), 0) as total_omset'),
          db.raw('COUNT(*) as jumlah_transaksi'),
          db.raw('COALESCE(AVG(total_bayar), 0) as rata_rata'),
          db.raw('COALESCE(SUM(diskon), 0) as total_diskon')
        ).first(),

      db('transaksi')
        .whereRaw("date(tanggal_masuk) >= ?", [start])
        .whereRaw("date(tanggal_masuk) <= ?", [end])
        .groupBy('status')
        .select('status', db.raw('COUNT(*) as jumlah')),

      db('pelanggan')
        .whereRaw("date(created_at) >= ?", [start])
        .whereRaw("date(created_at) <= ?", [end])
        .count('id as total').first(),

      db('detail_transaksi as d')
        .leftJoin('transaksi as t', 't.id', 'd.transaksi_id')
        .leftJoin('layanan as l', 'l.id', 'd.layanan_id')
        .whereNotIn('t.status', ['dibatalkan'])
        .whereRaw("date(t.tanggal_masuk) >= ?", [start])
        .whereRaw("date(t.tanggal_masuk) <= ?", [end])
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
          ON date(t.tanggal_masuk)=dates.d AND t.status NOT IN ('dibatalkan')
        GROUP BY dates.d
        ORDER BY dates.d ASC
      `, [start, end]),

      db('riwayat_poin')
        .whereRaw("date(created_at) >= ?", [start])
        .whereRaw("date(created_at) <= ?", [end])
        .select(
          db.raw("COALESCE(SUM(CASE WHEN jenis='tambah' THEN jumlah_poin ELSE 0 END),0) as poin_diberikan"),
          db.raw("COALESCE(SUM(CASE WHEN jenis='redeem' THEN jumlah_poin ELSE 0 END),0) as poin_ditukarkan")
        ).first(),

      db('transaksi')
        .whereNotNull('paket_promo_id')
        .whereNotIn('status', ['dibatalkan'])
        .whereRaw("date(tanggal_masuk) >= ?", [start])
        .whereRaw("date(tanggal_masuk) <= ?", [end])
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
              .whereRaw("date(created_at) >= ?", [start])
              .whereRaw("date(created_at) <= ?", [end])
              .sum('nominal as total').first(),
            db('mutasi_deposit').where('jenis', 'bayar')
              .whereRaw("date(created_at) >= ?", [start])
              .whereRaw("date(created_at) <= ?", [end])
              .sum('nominal as total').first(),
            db('mutasi_deposit').where('jenis', 'kelebihan')
              .whereRaw("date(created_at) >= ?", [start])
              .whereRaw("date(created_at) <= ?", [end])
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

// ── GET /api/v1/laporan/export ────────────────────────────────────────────────
exports.exportCsv = async (req, res) => {
  try {
    const { start, end } = getDateRange(req);

    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p',    'p.id',  't.pelanggan_id')
      .leftJoin('users as u',        'u.id',  't.user_id')
      .leftJoin('paket_promo as pr', 'pr.id', 't.paket_promo_id')
      .whereRaw("date(t.tanggal_masuk) >= ?", [start])
      .whereRaw("date(t.tanggal_masuk) <= ?", [end])
      .orderBy('t.tanggal_masuk')
      .select(
        't.nomor_transaksi', 't.tanggal_masuk', 't.status',
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
