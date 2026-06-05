const db = require('../database/connection');

// ── Ambil settings poin dari DB ─────────────────────────────────────────────
// Terima koneksi opsional (trx) agar bisa dipanggil DI DALAM transaction tanpa
// memicu deadlock pool (better-sqlite3 pool tidak bisa beri koneksi ke-2 saat
// satu trx sedang aktif).
const getPoinSettings = async (conn = db) => {
  const rows = await conn('pengaturan')
    .whereIn('kunci', ['poin_per_nominal', 'nilai_tukar_poin', 'min_poin_redeem']);
  const s = Object.fromEntries(rows.map(r => [r.kunci, parseInt(r.nilai) || 0]));
  return {
    perNominal:  s.poin_per_nominal  || 10000,
    nilaiPerPoin: s.nilai_tukar_poin || 100,
    minRedeem:   s.min_poin_redeem   || 100
  };
};

// ── Hitung total dari items + promo + poin + diskon manual ──────────────────
const hitungTotal = (items, promo, poinDigunakan, nilaiPerPoin, diskonManual = null) => {
  const totalHarga = items.reduce((sum, it) => sum + it.subtotal, 0);

  let diskon = 0;
  let diskonPersen = 0;
  let diskonTipe = 'nominal';

  // Prioritas: diskon manual > diskon promo
  if (diskonManual) {
    diskonTipe = diskonManual.tipe || 'nominal';
    if (diskonManual.tipe === 'nominal') {
      diskon = diskonManual.nilai || 0;
    } else if (diskonManual.tipe === 'persen') {
      diskonPersen = diskonManual.nilai || 0;
      diskon = Math.round(totalHarga * diskonPersen / 100);
    }
  } else if (promo) {
    if (promo.diskon_persen > 0) {
      diskon = Math.round(totalHarga * promo.diskon_persen / 100);
      diskonPersen = promo.diskon_persen;
      diskonTipe = 'persen';
    } else if (promo.diskon_nominal > 0) {
      diskon = promo.diskon_nominal;
      diskonTipe = 'nominal';
    }
    if (promo.min_pembelian > 0 && totalHarga < promo.min_pembelian) {
      diskon = 0; // promo tidak berlaku
      diskonPersen = 0;
    }
  }

  const diskonPoin = (poinDigunakan || 0) * nilaiPerPoin;
  const totalBayar = Math.max(0, totalHarga - diskon - diskonPoin);

  return { totalHarga, diskon, diskonPoin, totalBayar, diskonTipe, diskonPersen };
};

// ── Tambah/kurang poin pelanggan ────────────────────────────────────────────
const upsertPoinPelanggan = async (pelangganId, delta, transaksiId, jenis, keterangan) => {
  await db.transaction(async (trx) => {
    // SUMBER KEBENARAN tunggal = pelanggan.total_poin (selalu ada, dipakai seluruh app).
    // poin_pelanggan dijaga sinkron sebagai cache, JANGAN dipakai sbg basis hitung
    // (bisa kosong/desync utk pelanggan yg poinnya diubah via penyesuaian manual).
    const pel  = await trx('pelanggan').where('id', pelangganId).first();
    const base = Number(pel?.total_poin) || 0;
    const newTotal = Math.max(0, base + delta);

    await trx('pelanggan').where('id', pelangganId).update({
      total_poin:  newTotal,
      updated_at:  new Date()
    });

    // Jaga cache poin_pelanggan tetap sinkron (upsert)
    const existing = await trx('poin_pelanggan').where('pelanggan_id', pelangganId).first();
    if (existing) {
      await trx('poin_pelanggan').where('pelanggan_id', pelangganId)
        .update({ total_poin: newTotal, updated_at: new Date() });
    } else {
      await trx('poin_pelanggan').insert({
        pelanggan_id: pelangganId, total_poin: newTotal, updated_at: new Date()
      });
    }

    await trx('riwayat_poin').insert({
      pelanggan_id: pelangganId,
      transaksi_id: transaksiId,
      jenis,
      jumlah_poin:  Math.abs(delta),
      keterangan,
      created_at:   new Date()
    });
  });
};

// ── Beri poin earned HANYA jika lunas (idempotent / anti-dobel) ─────────────
// Dipakai saat create (jika langsung lunas) & saat order menjadi lunas kemudian.
const awardPoinJikaLunas = async (transaksi, perNominal) => {
  if (!transaksi?.pelanggan_id) return 0;
  const lunas = (Number(transaksi.bayar) || 0) >= Number(transaksi.total_bayar)
                && Number(transaksi.total_bayar) > 0;
  if (!lunas) return 0;

  // Dedup: jangan beri poin earned dua kali untuk transaksi yang sama
  const sudah = await db('riwayat_poin')
    .where({ transaksi_id: transaksi.id, jenis: 'tambah' })
    .andWhere('keterangan', 'like', 'Poin dari%')
    .first();
  if (sudah) return 0;

  const poinEarned = Math.floor(Number(transaksi.total_bayar) / perNominal);
  if (poinEarned > 0) {
    await upsertPoinPelanggan(
      transaksi.pelanggan_id, poinEarned, transaksi.id,
      'tambah', `Poin dari ${transaksi.nomor_transaksi}`
    );
  }
  return poinEarned;
};

// ── Buat entri kas pemasukan ────────────────────────────────────────────────
const buatEntriKas = async ({ nomor_transaksi, id, total_bayar, user_id, tanggal_masuk }) => {
  const existing = await db('kas').where('transaksi_id', id).first();
  if (existing) return; // sudah ada, skip

  // Gunakan tanggal_masuk transaksi (untuk backdate), bukan tanggal saat ini
  const tanggalKas = tanggal_masuk
    ? new Date(tanggal_masuk).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  await db('kas').insert({
    tanggal:      tanggalKas,
    jenis:        'masuk',
    kategori:     'transaksi',
    keterangan:   `Pembayaran ${nomor_transaksi}`,
    jumlah:       total_bayar,
    transaksi_id: id,
    user_id,
    created_at:   new Date(),
    updated_at:   new Date()
  });
};

// ── Log WA (tanpa kirim, kirim implementasi di luar scope) ──────────────────
const logWa = async (telepon, pesan, transaksiId) => {
  if (!telepon) return;
  await db('wa_log').insert({
    telepon,
    pesan,
    status:       'pending',
    transaksi_id: transaksiId,
    created_at:   new Date()
  });
};

module.exports = { getPoinSettings, hitungTotal, upsertPoinPelanggan, awardPoinJikaLunas, buatEntriKas, logWa };
