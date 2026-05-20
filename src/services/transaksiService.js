const db = require('../database/connection');

// ── Ambil settings poin dari DB ─────────────────────────────────────────────
const getPoinSettings = async () => {
  const rows = await db('pengaturan')
    .whereIn('kunci', ['poin_per_nominal', 'nilai_tukar_poin', 'min_poin_redeem']);
  const s = Object.fromEntries(rows.map(r => [r.kunci, parseInt(r.nilai) || 0]));
  return {
    perNominal:  s.poin_per_nominal  || 10000,
    nilaiPerPoin: s.nilai_tukar_poin || 100,
    minRedeem:   s.min_poin_redeem   || 100
  };
};

// ── Hitung total dari items + promo + poin ──────────────────────────────────
const hitungTotal = (items, promo, poinDigunakan, nilaiPerPoin) => {
  const totalHarga = items.reduce((sum, it) => sum + it.subtotal, 0);

  let diskon = 0;
  if (promo) {
    if (promo.diskon_persen > 0) {
      diskon = Math.round(totalHarga * promo.diskon_persen / 100);
    } else if (promo.diskon_nominal > 0) {
      diskon = promo.diskon_nominal;
    }
    if (promo.min_pembelian > 0 && totalHarga < promo.min_pembelian) {
      diskon = 0; // promo tidak berlaku
    }
  }

  const diskonPoin = (poinDigunakan || 0) * nilaiPerPoin;
  const totalBayar = Math.max(0, totalHarga - diskon - diskonPoin);

  return { totalHarga, diskon, diskonPoin, totalBayar };
};

// ── Tambah/kurang poin pelanggan ────────────────────────────────────────────
const upsertPoinPelanggan = async (pelangganId, delta, transaksiId, jenis, keterangan) => {
  await db.transaction(async (trx) => {
    const existing = await trx('poin_pelanggan').where('pelanggan_id', pelangganId).first();
    const newTotal = Math.max(0, (existing?.total_poin || 0) + delta);

    if (existing) {
      await trx('poin_pelanggan')
        .where('pelanggan_id', pelangganId)
        .update({ total_poin: newTotal, updated_at: new Date() });
    } else {
      await trx('poin_pelanggan').insert({
        pelanggan_id: pelangganId,
        total_poin:   Math.max(0, delta),
        updated_at:   new Date()
      });
    }

    await trx('pelanggan').where('id', pelangganId).update({
      total_poin:  newTotal,
      updated_at:  new Date()
    });

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

// ── Buat entri kas pemasukan ────────────────────────────────────────────────
const buatEntriKas = async ({ nomor_transaksi, id, total_bayar, user_id }) => {
  const existing = await db('kas').where('transaksi_id', id).first();
  if (existing) return; // sudah ada, skip

  await db('kas').insert({
    tanggal:      new Date().toISOString().slice(0, 10),
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

module.exports = { getPoinSettings, hitungTotal, upsertPoinPelanggan, buatEntriKas, logWa };
