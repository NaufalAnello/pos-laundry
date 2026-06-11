const db = require('../database/connection');
const ajService = require('../services/antarJemputService');
const Joi = require('joi');

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
      lewatWaktu,
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
          'p.id as pelanggan_id', 'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
          'u.nama as kasir_nama'
        ),

      // selesai_hari_ini — order yang estimasi = hari ini DAN masih pending/proses
      db('transaksi as t')
        .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
        .leftJoin('users as u', 'u.id', 't.user_id')
        .whereRaw("date(t.tanggal_selesai/1000,'unixepoch') = ?", [today])
        .whereIn('t.status', ['pending', 'proses'])
        .orderBy('t.tanggal_selesai', 'asc')
        .limit(50)
        .select(
          't.id', 't.nomor_transaksi', 't.status',
          't.total_bayar', 't.bayar', 't.total_dibayar',
          't.tanggal_masuk', 't.tanggal_selesai', 't.updated_at',
          'p.id as pelanggan_id', 'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
          'u.nama as kasir_nama'
        ),

      // lewat_waktu — order yang estimasi < hari ini DAN masih pending/proses
      db('transaksi as t')
        .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
        .leftJoin('users as u', 'u.id', 't.user_id')
        .whereRaw("date(t.tanggal_selesai/1000,'unixepoch') < ?", [today])
        .whereIn('t.status', ['pending', 'proses'])
        .orderBy('t.tanggal_selesai', 'asc')
        .limit(50)
        .select(
          't.id', 't.nomor_transaksi', 't.status',
          't.total_bayar', 't.bayar', 't.total_dibayar',
          't.tanggal_masuk', 't.tanggal_selesai', 't.updated_at',
          'p.id as pelanggan_id', 'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
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

    // Attach items untuk antrian aktif, selesai hari ini, dan lewat waktu
    const allIds = [...antrianAktif.map(r => r.id), ...selesaiHariIni.map(r => r.id), ...lewatWaktu.map(r => r.id)];
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

    const lewat = lewatWaktu.map(r => ({
      ...r,
      items: itemsByTrx[r.id] || []
    }));

    // ── Antar Jemput hari ini — counter untuk badge ─────────────────────────
    // Order AJ hari ini yang belum diterapkan tarifnya.
    const ajCountRow = await db('transaksi')
      .whereRaw("date(tanggal_masuk/1000,'unixepoch') = ?", [today])
      .where('antar_jemput', 1)
      .where(function () {
        this.whereNull('tarif_jemput_diterapkan').orWhere('tarif_jemput_diterapkan', 0);
      })
      .whereNot('status', 'dibatalkan')
      .count('id as total')
      .first();

    // ── Reservasi penjemputan hari ini — counter untuk badge ───────────────
    // Pakai try-catch supaya kalau migration belum jalan, dashboard tetap load.
    let reservasiCount = 0;
    try {
      const reservasiRow = await db('reservasi_jemput')
        .where('tanggal_jemput', today)
        .where('status', 'terjadwal')
        .count('id as total')
        .first();
      reservasiCount = Number(reservasiRow?.total ?? 0);
    } catch (_e) { /* tabel belum ada */ }

    res.json({
      order_hari_ini:      Number(orderHariIni?.total  ?? 0),
      antar_jemput_belum_diproses: Number(ajCountRow?.total ?? 0),
      reservasi_jemput_hari_ini: reservasiCount,
      omset_hari_ini:      Number(omsetHariIni?.total  ?? 0),
      wa_terkirim_hari_ini: Number(waHariIni?.total    ?? 0),
      tagihan_belum_lunas: Number(tagihanBelumLunas?.total ?? 0),
      antrian_aktif:       antrian,
      selesai_hari_ini:    selesai,
      lewat_waktu:         lewat,
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

// ── GET /api/v1/dashboard/antar-jemput-hari-ini ──────────────────────────────
// Auto-detect order AJ hari ini, kelompokkan & hitung HPP otomatis.
exports.antarJemputHariIni = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
      .whereRaw("date(t.tanggal_masuk/1000,'unixepoch') = ?", [today])
      .where('t.antar_jemput', 1)
      .whereNot('t.status', 'dibatalkan')
      .orderBy('t.id', 'asc')
      .select(
        't.id as order_id',
        't.nomor_transaksi',
        't.pelanggan_id',
        't.jarak_jemput_km',
        't.tarif_jemput_diterapkan',
        't.alamat_jemput',
        'p.nama as pelanggan_nama',
        'p.jarak_workshop_km as pelanggan_jarak'
      );

    if (rows.length === 0) {
      return res.json({
        ada_order_aj: false,
        order_list: [],
        semua_ada_jarak: true,
        sudah_diterapkan: 0,
        belum_diterapkan: 0,
        kalkulasi: null,
      });
    }

    const orderList = rows.map(r => {
      // Prioritas: jarak per-order (walk-in/override) → jarak profil pelanggan
      const jarak = r.jarak_jemput_km != null && Number(r.jarak_jemput_km) > 0
        ? Number(r.jarak_jemput_km)
        : Number(r.pelanggan_jarak || 0);
      return {
        order_id: r.order_id,
        nomor:    r.nomor_transaksi,
        pelanggan_id: r.pelanggan_id,
        nama_pelanggan: r.pelanggan_nama || (r.alamat_jemput ? 'Walk-in' : 'Tanpa nama'),
        jarak_km: jarak,
        has_jarak: jarak > 0,
        sudah_diterapkan: !!r.tarif_jemput_diterapkan,
      };
    });

    const sudahDiterapkan  = orderList.filter(o => o.sudah_diterapkan).length;
    const belumDiterapkan  = orderList.filter(o => !o.sudah_diterapkan);
    const semuaAdaJarak    = belumDiterapkan.every(o => o.has_jarak);

    let kalkulasi = null;
    if (belumDiterapkan.length > 0 && semuaAdaJarak) {
      // Hitung HPP gabungan dari order yang belum diterapkan
      const pelangganList = belumDiterapkan.map(o => ({
        id: o.order_id, // pakai order_id sebagai pengenal di rute
        nama: o.nama_pelanggan,
        jarak_km: o.jarak_km
      }));
      const hasil = await ajService.hitungHPP(pelangganList, db);
      // Tarif rekomendasi: HPP + 25%, dibulatkan ke 500
      const tarifRekomendasi = Math.ceil((hasil.hppPerPelanggan * 1.25) / 500) * 500;
      kalkulasi = {
        rute_optimal: hasil.ruteOptimal,
        total_jarak:  hasil.totalJarak,
        hpp_per_pelanggan: hasil.hppPerPelanggan,
        tarif_rekomendasi: tarifRekomendasi,
        breakdown: {
          bbm:   hasil.biayaBBM,
          waktu: hasil.biayaWaktu,
          aus:   hasil.biayaAus,
          total: hasil.totalHPP,
        },
        snapshot: hasil.snapshot,
      };
    }

    res.json({
      ada_order_aj:     true,
      order_list:       orderList,
      semua_ada_jarak:  semuaAdaJarak,
      sudah_diterapkan: sudahDiterapkan,
      belum_diterapkan: belumDiterapkan.length,
      kalkulasi,
    });
  } catch (err) {
    console.error('[dashboard:antarJemputHariIni]', err);
    res.status(500).json({ error: 'Gagal memuat data antar jemput', detail: err.message });
  }
};

// ── POST /api/v1/dashboard/antar-jemput/ai-saran ─────────────────────────────
// Konsultasi AI untuk rute AJ hari ini.
exports.antarJemputAISaran = async (req, res) => {
  try {
    const { order_ids } = req.body || {};
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids wajib diisi' });
    }

    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
      .whereIn('t.id', order_ids)
      .select(
        't.id', 't.jarak_jemput_km',
        'p.nama as pelanggan_nama', 'p.jarak_workshop_km as pelanggan_jarak'
      );

    const pelangganList = rows.map(r => ({
      id: r.id,
      nama: r.pelanggan_nama || 'Walk-in',
      jarak_km: r.jarak_jemput_km != null && Number(r.jarak_jemput_km) > 0
        ? Number(r.jarak_jemput_km)
        : Number(r.pelanggan_jarak || 0)
    })).filter(p => p.jarak_km > 0);

    if (pelangganList.length === 0) {
      return res.status(400).json({ error: 'Tidak ada order dengan jarak valid' });
    }

    const hasil = await ajService.hitungHPP(pelangganList, db);
    const saran = await ajService.konsultasiAI(hasil, pelangganList, db);

    if (!saran) {
      return res.status(400).json({ error: 'AI Assistant belum aktif atau API key belum diisi di Pengaturan' });
    }

    res.json({ saran_ai: saran, kalkulasi: hasil });
  } catch (err) {
    console.error('[dashboard:antarJemputAISaran]', err);
    res.status(500).json({ error: 'Gagal mengambil saran AI', detail: err.message });
  }
};

// ── POST /api/v1/dashboard/terapkan-tarif-aj ─────────────────────────────────
// Body: { tarif, order_ids, tanggal? }
// - Tambah biaya_tambahan ke tiap order_id
// - Update total_harga & total_bayar
// - Tandai tarif_jemput_diterapkan = 1
// - Simpan snapshot ke rute_antar_jemput (untuk historical pricing)
exports.terapkanTarifAJ = async (req, res) => {
  const schema = Joi.object({
    tarif:      Joi.number().min(0).required(),
    order_ids:  Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    tanggal:    Joi.string().optional(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const rows = await db('transaksi as t')
      .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
      .whereIn('t.id', value.order_ids)
      .select(
        't.id', 't.tarif_jemput_diterapkan',
        't.jarak_jemput_km', 't.status',
        'p.id as pelanggan_id', 'p.nama as pelanggan_nama',
        'p.jarak_workshop_km as pelanggan_jarak'
      );

    const valid = rows.filter(r =>
      !r.tarif_jemput_diterapkan && !['dibatalkan'].includes(r.status)
    );

    if (valid.length === 0) {
      return res.status(400).json({ error: 'Tidak ada order yang valid untuk diterapkan tarifnya' });
    }

    const pelangganList = valid.map(r => ({
      id: r.id,
      nama: r.pelanggan_nama || 'Walk-in',
      jarak_km: r.jarak_jemput_km != null && Number(r.jarak_jemput_km) > 0
        ? Number(r.jarak_jemput_km)
        : Number(r.pelanggan_jarak || 0)
    }));

    const semuaAdaJarak = pelangganList.every(p => p.jarak_km > 0);
    if (!semuaAdaJarak) {
      return res.status(400).json({ error: 'Sebagian order belum punya data jarak' });
    }

    const hasil = await ajService.hitungHPP(pelangganList, db);
    const tanggal = value.tanggal || new Date().toISOString().slice(0, 10);

    let ruteId;
    let biayaTerpasang = 0;

    await db.transaction(async (trx) => {
      // Snapshot rute_antar_jemput
      const pelangganDataJson = JSON.stringify(
        pelangganList.map(p => ({
          id: p.id, nama: p.nama, jarak_km: p.jarak_km, order_id: p.id
        }))
      );
      const urutanRuteJson = JSON.stringify(hasil.ruteOptimal.map(p => p.nama));

      const [id] = await trx('rute_antar_jemput').insert({
        tanggal,
        pelanggan_data: pelangganDataJson,
        urutan_rute:    urutanRuteJson,
        snapshot_harga_bbm:    hasil.snapshot.harga_bbm,
        snapshot_konsumsi_bbm: hasil.snapshot.konsumsi_bbm,
        snapshot_biaya_aus:    hasil.snapshot.biaya_aus,
        snapshot_kecepatan:    hasil.snapshot.kecepatan,
        snapshot_nilai_waktu:  hasil.snapshot.nilai_waktu,
        total_jarak_km:    hasil.totalJarak,
        biaya_bbm:         hasil.biayaBBM,
        biaya_waktu:       hasil.biayaWaktu,
        biaya_aus:         hasil.biayaAus,
        total_hpp:         hasil.totalHPP,
        hpp_per_pelanggan: hasil.hppPerPelanggan,
        tarif_dikenakan:   value.tarif,
        saran_ai:          null,
        created_at:        new Date(),
      });
      ruteId = id;

      // Pasang biaya_tambahan ke tiap order + tandai tarif_jemput_diterapkan
      for (const r of valid) {
        await trx('biaya_tambahan').insert({
          transaksi_id: r.id,
          keterangan:   `Antar Jemput (rute #${ruteId})`,
          nominal:      value.tarif,
          created_by:   req.session?.userId || null,
          created_at:   new Date()
        });

        const trxRow = await trx('transaksi').where({ id: r.id }).first();
        if (trxRow) {
          const totalHarga = Number(trxRow.total_harga || 0) + Number(value.tarif);
          const totalBayar = Number(trxRow.total_bayar || 0) + Number(value.tarif);
          await trx('transaksi').where({ id: r.id }).update({
            total_harga: totalHarga,
            total_bayar: totalBayar,
            tarif_jemput_diterapkan: 1,
            updated_at: new Date()
          });
        }
        biayaTerpasang++;
      }
    });

    res.json({
      success: true,
      rute_id: ruteId,
      biaya_terpasang: biayaTerpasang,
    });
  } catch (err) {
    console.error('[dashboard:terapkanTarifAJ]', err);
    res.status(500).json({ error: 'Gagal menerapkan tarif AJ', detail: err.message });
  }
};
