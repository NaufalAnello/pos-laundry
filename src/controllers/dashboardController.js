const db = require('../database/connection');

exports.index = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [
      orderHariIni,
      omsetHariIni,
      waHariIni,
      tagihanBelumLunas,
      antrianAktif,
      selesaiHariIni,
      chart7Hari,
      promoAktif,
      stokHampirHabis,
      depositStats
    ] = await Promise.all([
      // order_hari_ini
      db('transaksi')
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') = ?", [today])
        .whereNot('status', 'dibatalkan')
        .count('id as total')
        .first(),

      // omset_hari_ini — hanya dari transaksi yang sudah ada pembayaran (bayar > 0)
      db('transaksi')
        .whereRaw("date(tanggal_masuk/1000,'unixepoch') = ?", [today])
        .whereIn('status', ['selesai', 'diambil'])
        .sum('total_bayar as total')
        .first(),

      // wa_terkirim_hari_ini
      db('wa_log')
        .whereRaw("date(created_at/1000,'unixepoch') = ?", [today])
        .where('status', 'terkirim')
        .count('id as total')
        .first(),

      // tagihan_belum_lunas (count)
      db('transaksi as t')
        .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
        .whereRaw('t.bayar < t.total_bayar')
        .whereNotIn('t.status', ['dibatalkan', 'diambil'])
        .count('t.id as total')
        .first(),

      // antrian_aktif — pending + proses, max 30
      db('transaksi as t')
        .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
        .leftJoin('users as u', 'u.id', 't.user_id')
        .whereIn('t.status', ['pending', 'proses'])
        .orderBy('t.id', 'asc')
        .limit(30)
        .select(
          't.id', 't.nomor_transaksi', 't.status',
          't.total_bayar', 't.bayar', 't.tanggal_masuk', 't.tanggal_selesai',
          't.antar_jemput', 't.metode_bayar',
          'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
          'u.nama as kasir_nama'
        ),

      // selesai_hari_ini — order yang tanggal_selesai hari ini ATAU status=selesai dan updated_at hari ini
      db('transaksi as t')
        .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
        .leftJoin('users as u', 'u.id', 't.user_id')
        .where(function() {
          this.whereRaw("date(t.tanggal_selesai/1000,'unixepoch') = ?", [today])
            .orWhere(function() {
              this.where('t.status', 'selesai')
                .whereRaw("date(t.updated_at/1000,'unixepoch') = ?", [today]);
            });
        })
        .orderBy('t.updated_at', 'desc')
        .limit(50)
        .select(
          't.id', 't.nomor_transaksi', 't.status',
          't.total_bayar', 't.bayar', 't.total_dibayar',
          't.tanggal_masuk', 't.tanggal_selesai', 't.updated_at',
          'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
          'u.nama as kasir_nama'
        ),

      // bar_chart_7hari — omset per hari 7 hari terakhir (termasuk hari ini)
      // Axis tanggal & bucketing sama-sama UTC (konsisten dgn `today`=toISOString & kas.tanggal)
      db.raw(`
        WITH RECURSIVE dates(d) AS (
          SELECT date('now', '-6 days')
          UNION ALL
          SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
        )
        SELECT
          dates.d AS tanggal,
          COALESCE(SUM(t.total_bayar), 0) AS omset
        FROM dates
        LEFT JOIN transaksi t
          ON date(t.tanggal_masuk/1000,'unixepoch') = dates.d
          AND t.status IN ('selesai','diambil')
        GROUP BY dates.d
        ORDER BY dates.d ASC
      `),

      // promo_aktif_hari_ini
      db('paket_promo')
        .where('aktif', true)
        .where(function () {
          this.whereNull('berlaku_sampai').orWhere('berlaku_sampai', '>=', today);
        })
        .where(function () {
          this.whereNull('berlaku_mulai').orWhere('berlaku_mulai', '<=', today);
        })
        .orderBy('nama')
        .select('id', 'nama', 'diskon_persen', 'diskon_nominal', 'berlaku_sampai'),

      // stok_hampir_habis
      db('stok_bahan')
        .whereRaw('stok_saat_ini <= stok_minimum')
        .orderBy('stok_saat_ini', 'asc')
        .select('id', 'nama', 'satuan', 'stok_saat_ini', 'stok_minimum'),

      // deposit stats
      (async () => {
        try {
          const threshold = await db('pengaturan').where('kunci', 'deposit_notif_threshold').first();
          const thresholdVal = Number(threshold?.nilai || 20000);
          const [totalRow, tipisRow] = await Promise.all([
            db('deposit_pelanggan').sum('saldo as total').first(),
            db('deposit_pelanggan').where('saldo', '<', thresholdVal).where('saldo', '>', 0).count('id as total').first()
          ]);
          return {
            total_saldo:           Number(totalRow?.total  ?? 0),
            pelanggan_saldo_tipis: Number(tipisRow?.total  ?? 0),
            threshold:             thresholdVal
          };
        } catch { return { total_saldo: 0, pelanggan_saldo_tipis: 0, threshold: 20000 }; }
      })()
    ]);

    // Attach items untuk antrian aktif dan selesai hari ini
    const allIds = [...antrianAktif.map(r => r.id), ...selesaiHariIni.map(r => r.id)];
    let itemsByTrx = {};
    if (allIds.length) {
      const rows = await db('detail_transaksi')
        .whereIn('transaksi_id', allIds)
        .select('transaksi_id', 'nama_layanan', 'jumlah', 'satuan');
      rows.forEach(r => {
        if (!itemsByTrx[r.transaksi_id]) itemsByTrx[r.transaksi_id] = [];
        itemsByTrx[r.transaksi_id].push(r);
      });
    }

    const antrian = antrianAktif.map(r => ({
      ...r,
      items: itemsByTrx[r.id] || []
    }));

    const selesai = selesaiHariIni.map(r => ({
      ...r,
      items: itemsByTrx[r.id] || []
    }));

    res.json({
      order_hari_ini:      Number(orderHariIni?.total  ?? 0),
      omset_hari_ini:      Number(omsetHariIni?.total  ?? 0),
      wa_terkirim_hari_ini: Number(waHariIni?.total    ?? 0),
      tagihan_belum_lunas: Number(tagihanBelumLunas?.total ?? 0),
      antrian_aktif:       antrian,
      selesai_hari_ini:    selesai,
      bar_chart_7hari:     chart7Hari,
      promo_aktif_hari_ini: promoAktif,
      stok_hampir_habis:   stokHampirHabis,
      deposit:             depositStats
    });
  } catch (err) {
    console.error('[dashboard:index]', err);
    res.status(500).json({ error: 'Gagal memuat data dashboard' });
  }
};
