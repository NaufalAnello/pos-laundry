const db = require('../database/connection');

// ── Helper: hitung total volume dari items order per satuan_rasio ──────────────
// items = array of { layanan_id, jumlah, satuan } — satuan diambil dari layanan
// per_kg  → jumlahkan jumlah items dengan satuan 'kg'
// per_pcs → jumlahkan jumlah items dengan satuan selain 'kg' (pcs/item/pasang/dll)
function hitungVolume(items, satuanRasio) {
  let total = 0;
  for (const it of items) {
    const satuan = String(it.satuan || '').toLowerCase();
    const qty    = Number(it.jumlah) || 0;
    if (satuanRasio === 'per_kg' && satuan === 'kg') total += qty;
    else if (satuanRasio === 'per_pcs' && satuan !== 'kg') total += qty;
  }
  return total;
}

// ── Kurangi stok otomatis setelah order dibuat ────────────────────────────────
// Dipanggil setelah insert detail_transaksi berhasil di transaksiController.store.
// Non-blocking secara desain: caller bungkus try/catch, error hanya di-log.
exports.kurangiStokOtomatis = async function kurangiStokOtomatis(transaksiId, items) {
  const bahanAktif = await db('bahan_baku')
    .where('aktif', 1)
    .where('rasio_pemakaian', '>', 0);

  for (const bahan of bahanAktif) {
    const volume = hitungVolume(items, bahan.satuan_rasio || 'per_kg');
    if (volume <= 0) continue;

    const pakai = Number((volume * Number(bahan.rasio_pemakaian)).toFixed(2));
    if (pakai <= 0) continue;

    const stokSebelum = Number(bahan.stok_sekarang);
    const stokSesudah = Number((stokSebelum - pakai).toFixed(2));

    if (stokSesudah < 0) {
      console.warn(`[stokBahan] Bahan "${bahan.nama}" jadi minus (${stokSesudah} ${bahan.satuan}) setelah order #${transaksiId}`);
    }

    await db('bahan_baku').where('id', bahan.id).update({
      stok_sekarang: stokSesudah,
      updated_at:    new Date()
    });

    await db('mutasi_stok_bahan').insert({
      bahan_id:      bahan.id,
      jenis:         'keluar_otomatis',
      jumlah:        pakai,
      stok_sebelum:  stokSebelum,
      stok_sesudah:  stokSesudah,
      transaksi_id:  transaksiId,
      keterangan:    `Pemakaian otomatis: ${volume} × ${bahan.rasio_pemakaian} ${bahan.satuan}`,
      created_at:    new Date()
    });
  }
};

// ── Tambah stok manual (restock) ─────────────────────────────────────────────
exports.tambahStokManual = async function tambahStokManual(bahanId, jumlah, keterangan, userId) {
  const bahan = await db('bahan_baku').where('id', bahanId).first();
  if (!bahan) throw new Error('Bahan tidak ditemukan');
  if (Number(jumlah) <= 0) throw new Error('Jumlah harus lebih dari 0');

  const stokSebelum = Number(bahan.stok_sekarang);
  const stokSesudah = Number((stokSebelum + Number(jumlah)).toFixed(2));

  await db.transaction(async (trx) => {
    await trx('bahan_baku').where('id', bahanId).update({
      stok_sekarang: stokSesudah,
      updated_at:    new Date()
    });

    await trx('mutasi_stok_bahan').insert({
      bahan_id:     bahanId,
      jenis:        'masuk',
      jumlah:       Number(jumlah),
      stok_sebelum: stokSebelum,
      stok_sesudah: stokSesudah,
      transaksi_id: null,
      keterangan:   keterangan || 'Restock manual',
      created_by:   userId || null,
      created_at:   new Date()
    });
  });

  return { stok_sebelum: stokSebelum, stok_sesudah: stokSesudah };
};

// ── Koreksi stok (stok opname) ────────────────────────────────────────────────
exports.koreksiStok = async function koreksiStok(bahanId, stokBaru, keterangan, userId) {
  const bahan = await db('bahan_baku').where('id', bahanId).first();
  if (!bahan) throw new Error('Bahan tidak ditemukan');
  if (Number(stokBaru) < 0) throw new Error('Stok baru tidak boleh negatif');

  const stokSebelum = Number(bahan.stok_sekarang);
  const stokSesudah = Number(Number(stokBaru).toFixed(2));
  const selisih     = Number((stokSesudah - stokSebelum).toFixed(2));

  await db.transaction(async (trx) => {
    await trx('bahan_baku').where('id', bahanId).update({
      stok_sekarang: stokSesudah,
      updated_at:    new Date()
    });

    await trx('mutasi_stok_bahan').insert({
      bahan_id:     bahanId,
      jenis:        'koreksi',
      jumlah:       selisih,
      stok_sebelum: stokSebelum,
      stok_sesudah: stokSesudah,
      transaksi_id: null,
      keterangan:   keterangan || 'Koreksi stok opname',
      created_by:   userId || null,
      created_at:   new Date()
    });
  });

  return { stok_sebelum: stokSebelum, stok_sesudah: stokSesudah, selisih };
};
