// Fitur Paket Layanan — service layer.
//
// Konsep:
// - Pelanggan beli paket kuota kg di muka dengan masa berlaku (default 30 hari).
// - Saat order dibuat, pelanggan bisa memilih memakai kuota paket aktifnya.
// - Kuota dipotong FIFO by tanggal_kadaluarsa (paling cepat habis dulu) supaya
//   tidak ada kuota yang hangus percuma.
// - Kalau kuota tidak cukup untuk seluruh berat order, sisa berat dihitung
//   harga normal seperti biasa.
// - Kalau masa berlaku lewat dan masih ada sisa kuota, sisa itu HANGUS.
// - Owner/karyawan (owner-only) bisa memberi toleransi hari tambahan.

const db = require('../database/connection');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Effective expiration (termasuk toleransi) ─────────────────────────────────
// tanggal_kadaluarsa DB SUDAH termasuk toleransi karena berikanToleransi()
// mengubah kolom itu langsung. Function ini disediakan sebagai satu-satunya
// titik hitung supaya kalau kemudian mau kita pisahkan (base + toleransi),
// tidak perlu ubah caller-nya.
const effectiveExpired = (paket) => new Date(paket.tanggal_kadaluarsa);

// ── Hitung sisa hari (bisa negatif kalau sudah lewat) ─────────────────────────
const sisaHari = (paket, now = new Date()) => {
  const exp = effectiveExpired(paket);
  const diffMs = exp.getTime() - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
};

// ── CRUD Template ─────────────────────────────────────────────────────────────
exports.listTemplate = async ({ includeInactive = false } = {}) => {
  const q = db('paket_layanan_template').orderBy('nama', 'asc');
  if (!includeInactive) q.where('aktif', 1);
  const rows = await q;
  return rows.map((r) => ({
    ...r,
    kuota_kg: Number(r.kuota_kg),
    harga: Number(r.harga)
  }));
};

exports.getTemplate = async (id) => {
  const row = await db('paket_layanan_template').where('id', id).first();
  if (!row) return null;
  return { ...row, kuota_kg: Number(row.kuota_kg), harga: Number(row.harga) };
};

exports.createTemplate = async (data) => {
  const now = new Date();
  const [id] = await db('paket_layanan_template').insert({
    nama:              data.nama,
    deskripsi:         data.deskripsi || null,
    kuota_kg:          data.kuota_kg,
    harga:             data.harga,
    masa_berlaku_hari: data.masa_berlaku_hari,
    estimasi_min_hari: data.estimasi_min_hari,
    estimasi_max_hari: data.estimasi_max_hari,
    aktif:             data.aktif === 0 ? 0 : 1,
    created_at:        now,
    updated_at:        now
  });
  return exports.getTemplate(id);
};

exports.updateTemplate = async (id, data) => {
  const patch = { updated_at: new Date() };
  for (const k of ['nama','deskripsi','kuota_kg','harga','masa_berlaku_hari','estimasi_min_hari','estimasi_max_hari','aktif']) {
    if (data[k] !== undefined) patch[k] = data[k];
  }
  await db('paket_layanan_template').where('id', id).update(patch);
  return exports.getTemplate(id);
};

// Soft delete → set aktif = 0. Kalau paket masih dipakai di paket_pelanggan
// (snapshot masih tersimpan), template tidak dihapus fisik.
exports.deleteTemplate = async (id) => {
  await db('paket_layanan_template').where('id', id).update({
    aktif:      0,
    updated_at: new Date()
  });
  return { soft: true };
};

// ── Beli paket ────────────────────────────────────────────────────────────────
exports.beliPaket = async ({ pelangganId, templateId, metodeBayar = 'tunai', userId }) => {
  const template = await exports.getTemplate(templateId);
  if (!template) throw new Error('Template paket tidak ditemukan');
  if (!template.aktif) throw new Error('Template paket sudah tidak aktif');

  const pelanggan = await db('pelanggan').where('id', pelangganId).first();
  if (!pelanggan) throw new Error('Pelanggan tidak ditemukan');

  const now = new Date();
  const expired = new Date(now);
  expired.setDate(expired.getDate() + Number(template.masa_berlaku_hari));

  return await db.transaction(async (trx) => {
    const [id] = await trx('paket_pelanggan').insert({
      pelanggan_id:        pelangganId,
      paket_template_id:   template.id,
      nama_paket_snapshot: template.nama,
      kuota_awal_kg:       template.kuota_kg,
      kuota_sisa_kg:       template.kuota_kg,
      harga_dibayar:       template.harga,
      metode_bayar:        metodeBayar,
      tanggal_beli:        now,
      tanggal_kadaluarsa:  expired,
      status:              'aktif',
      created_by:          userId || null,
      created_at:          now,
      updated_at:          now
    });

    await trx('mutasi_paket_pelanggan').insert({
      paket_pelanggan_id: id,
      jenis:              'pembelian',
      kuota_sebelum:      0,
      kuota_sesudah:      template.kuota_kg,
      keterangan:         `Beli paket "${template.nama}" (${template.kuota_kg} kg, ${template.masa_berlaku_hari} hari)`,
      created_by:         userId || null,
      created_at:         now
    });

    // Catat kas pemasukan (best-effort — non-blocking)
    try {
      await trx('kas').insert({
        tanggal:       now,
        jenis:         'pemasukan',
        kategori:      'paket_layanan',
        keterangan:    `Jual paket "${template.nama}" ke ${pelanggan.nama} (${metodeBayar})`,
        jumlah:        template.harga,
        user_id:       userId || null,
        created_at:    now,
        updated_at:    now
      });
    } catch (e) { console.warn('[paket:beli] gagal insert kas:', e.message); }

    const row = await trx('paket_pelanggan').where('id', id).first();
    return {
      ...row,
      kuota_awal_kg: Number(row.kuota_awal_kg),
      kuota_sisa_kg: Number(row.kuota_sisa_kg),
      harga_dibayar: Number(row.harga_dibayar)
    };
  });
};

// ── Cek & tandai paket yang kadaluarsa ────────────────────────────────────────
// Jalan otomatis di beberapa entry point (lihat pemanggil). Idempoten.
exports.cekDanTandaiKadaluarsa = async () => {
  const now = new Date();
  const kadaluarsa = await db('paket_pelanggan')
    .where('status', 'aktif')
    .where('tanggal_kadaluarsa', '<=', now);

  for (const p of kadaluarsa) {
    const sisa = Number(p.kuota_sisa_kg);
    await db('paket_pelanggan').where('id', p.id).update({
      status:     'kadaluarsa',
      updated_at: now
    });
    await db('mutasi_paket_pelanggan').insert({
      paket_pelanggan_id: p.id,
      jenis:              'hangus',
      kg_terpakai:        sisa,
      kuota_sebelum:      sisa,
      kuota_sesudah:      sisa, // fisik masih ada, tapi tidak bisa dipakai
      keterangan:         `Masa berlaku habis; ${sisa} kg tidak terpakai (hangus)`,
      created_at:         now
    });
  }
  return { jumlah: kadaluarsa.length };
};

// ── Ambil paket aktif pelanggan (sorted FIFO by expired) ──────────────────────
exports.getPaketAktifPelanggan = async (pelangganId) => {
  // Bersihkan yang kadaluarsa dulu supaya list akurat
  await exports.cekDanTandaiKadaluarsa();

  const rows = await db('paket_pelanggan')
    .where('pelanggan_id', pelangganId)
    .where('status', 'aktif')
    .where('kuota_sisa_kg', '>', 0)
    .orderBy('tanggal_kadaluarsa', 'asc');

  return rows.map((r) => ({
    ...r,
    kuota_awal_kg: Number(r.kuota_awal_kg),
    kuota_sisa_kg: Number(r.kuota_sisa_kg),
    harga_dibayar: Number(r.harga_dibayar),
    sisa_hari:     sisaHari(r)
  }));
};

// ── Ambil SEMUA paket pelanggan (untuk histori) ───────────────────────────────
exports.getSemuaPaketPelanggan = async ({ pelangganId, status } = {}) => {
  const q = db('paket_pelanggan as p')
    .leftJoin('pelanggan as pel', 'pel.id', 'p.pelanggan_id')
    .select(
      'p.*',
      'pel.nama as pelanggan_nama',
      'pel.telepon as pelanggan_telepon'
    )
    .orderBy('p.tanggal_kadaluarsa', 'desc');
  if (pelangganId) q.where('p.pelanggan_id', pelangganId);
  if (status) q.where('p.status', status);
  const rows = await q;
  return rows.map((r) => ({
    ...r,
    kuota_awal_kg: Number(r.kuota_awal_kg),
    kuota_sisa_kg: Number(r.kuota_sisa_kg),
    harga_dibayar: Number(r.harga_dibayar),
    sisa_hari:     sisaHari(r)
  }));
};

// ── Simulasi (peek tanpa modifikasi DB) — dipakai transaksiController untuk
//     hitung harga akhir SEBELUM commit transaksi. Setelah transaksi berhasil
//     dibuat, controller memanggil pakaiKuotaPaket() untuk benar-benar potong
//     kuota + catat mutasi_paket_pelanggan dengan transaksi_id yang valid.
exports.simulateKuotaPaket = async (pelangganId, kgDipakai) => {
  if (!(Number(kgDipakai) > 0)) return { kg_tercover: 0, kg_selisih: 0, potongan: [] };
  await exports.cekDanTandaiKadaluarsa();
  const paket = await db('paket_pelanggan')
    .where('pelanggan_id', pelangganId)
    .where('status', 'aktif')
    .where('kuota_sisa_kg', '>', 0)
    .orderBy('tanggal_kadaluarsa', 'asc');
  let sisa = round2(kgDipakai);
  const potongan = [];
  for (const p of paket) {
    if (sisa <= 0) break;
    const ambil = Math.min(Number(p.kuota_sisa_kg), sisa);
    if (ambil <= 0) continue;
    potongan.push({ paket_pelanggan_id: p.id, kg: ambil });
    sisa = round2(sisa - ambil);
  }
  return { kg_tercover: round2(kgDipakai - sisa), kg_selisih: round2(sisa), potongan };
};

// ── Pakai kuota paket untuk order (FIFO) ──────────────────────────────────────
// Return: { kg_tercover: number, kg_selisih: number, potongan: Array<{ paket_pelanggan_id, kg }> }
// Caller: transaksiController.store — dijalankan di dalam transaction supaya
// atomic dengan pembuatan transaksi.
exports.pakaiKuotaPaket = async ({ pelangganId, kgDipakai, transaksiId, userId, trx }) => {
  const dbi = trx || db;
  if (!(Number(kgDipakai) > 0)) return { kg_tercover: 0, kg_selisih: 0, potongan: [] };

  // Cek kadaluarsa dulu (di luar trx — pure update, aman kalau dobel)
  await exports.cekDanTandaiKadaluarsa();

  const paket = await dbi('paket_pelanggan')
    .where('pelanggan_id', pelangganId)
    .where('status', 'aktif')
    .where('kuota_sisa_kg', '>', 0)
    .orderBy('tanggal_kadaluarsa', 'asc');

  let sisa = round2(kgDipakai);
  const potongan = [];

  for (const p of paket) {
    if (sisa <= 0) break;
    const kuotaAda = Number(p.kuota_sisa_kg);
    const ambil = Math.min(kuotaAda, sisa);
    if (ambil <= 0) continue;

    const kuotaSetelah = round2(kuotaAda - ambil);
    const patch = {
      kuota_sisa_kg: kuotaSetelah,
      updated_at:    new Date()
    };
    if (kuotaSetelah <= 0) patch.status = 'habis_kuota';

    await dbi('paket_pelanggan').where('id', p.id).update(patch);

    await dbi('mutasi_paket_pelanggan').insert({
      paket_pelanggan_id: p.id,
      jenis:              'pemakaian',
      kg_terpakai:        ambil,
      transaksi_id:       transaksiId || null,
      kuota_sebelum:      kuotaAda,
      kuota_sesudah:      kuotaSetelah,
      keterangan:         `Pakai ${ambil} kg untuk order`,
      created_by:         userId || null,
      created_at:         new Date()
    });

    potongan.push({ paket_pelanggan_id: p.id, kg: ambil });
    sisa = round2(sisa - ambil);
  }

  const kgTercover = round2(kgDipakai - sisa);
  return {
    kg_tercover: kgTercover,
    kg_selisih:  round2(sisa),
    potongan
  };
};

// ── Beri toleransi (extend masa berlaku) ──────────────────────────────────────
exports.berikanToleransi = async ({ paketPelangganId, tambahHari, catatan, userId }) => {
  const paket = await db('paket_pelanggan').where('id', paketPelangganId).first();
  if (!paket) throw new Error('Paket tidak ditemukan');

  const now = new Date();
  const oldExp = new Date(paket.tanggal_kadaluarsa);
  const newExp = new Date(oldExp);
  newExp.setDate(newExp.getDate() + Number(tambahHari));

  const patch = {
    tanggal_kadaluarsa:      newExp,
    toleransi_hari_tambahan: (Number(paket.toleransi_hari_tambahan) || 0) + Number(tambahHari),
    catatan_toleransi:       catatan || null,
    updated_at:              now
  };
  // Kalau statusnya sudah 'kadaluarsa' dan diberi toleransi & masih ada kuota,
  // aktifkan kembali. Kalau kuota habis, tetap habis_kuota.
  if (paket.status === 'kadaluarsa' && Number(paket.kuota_sisa_kg) > 0) {
    patch.status = 'aktif';
  }
  await db('paket_pelanggan').where('id', paketPelangganId).update(patch);

  await db('mutasi_paket_pelanggan').insert({
    paket_pelanggan_id: paketPelangganId,
    jenis:              'toleransi',
    hari_toleransi:     tambahHari,
    kuota_sebelum:      Number(paket.kuota_sisa_kg),
    kuota_sesudah:      Number(paket.kuota_sisa_kg),
    keterangan:         `Toleransi ${tambahHari} hari${catatan ? ` — ${catatan}` : ''}`,
    created_by:         userId || null,
    created_at:         now
  });

  return await db('paket_pelanggan').where('id', paketPelangganId).first();
};

// ── Paket mendekati kadaluarsa (H-N) ──────────────────────────────────────────
exports.getPaketMendekatiKadaluarsa = async (ambangHari = null) => {
  // Ambang bisa dikonfigurasi via pengaturan.paket_reminder_ambang_hari
  let ambang = Number(ambangHari);
  if (!ambang) {
    const s = await db('pengaturan').where('kunci', 'paket_reminder_ambang_hari').first();
    ambang = Number(s?.nilai) || 3;
  }

  await exports.cekDanTandaiKadaluarsa();

  const now = new Date();
  const batasAtas = new Date(now);
  batasAtas.setDate(batasAtas.getDate() + ambang);

  const rows = await db('paket_pelanggan as p')
    .leftJoin('pelanggan as pel', 'pel.id', 'p.pelanggan_id')
    .select(
      'p.*',
      'pel.nama as pelanggan_nama',
      'pel.telepon as pelanggan_telepon'
    )
    .where('p.status', 'aktif')
    .where('p.kuota_sisa_kg', '>', 0)
    .where('p.tanggal_kadaluarsa', '<=', batasAtas)
    .orderBy('p.tanggal_kadaluarsa', 'asc');

  return rows.map((r) => ({
    ...r,
    kuota_awal_kg: Number(r.kuota_awal_kg),
    kuota_sisa_kg: Number(r.kuota_sisa_kg),
    harga_dibayar: Number(r.harga_dibayar),
    sisa_hari:     sisaHari(r)
  }));
};

// ── Ambil mutasi paket ────────────────────────────────────────────────────────
exports.getMutasiPaket = async (paketPelangganId) => {
  const rows = await db('mutasi_paket_pelanggan as m')
    .leftJoin('users as u', 'u.id', 'm.created_by')
    .leftJoin('transaksi as t', 't.id', 'm.transaksi_id')
    .select(
      'm.*',
      'u.nama as user_nama',
      't.nomor_transaksi as transaksi_nomor'
    )
    .where('m.paket_pelanggan_id', paketPelangganId)
    .orderBy('m.id', 'desc');
  return rows.map((r) => ({
    ...r,
    kg_terpakai:   r.kg_terpakai != null ? Number(r.kg_terpakai) : null,
    kuota_sebelum: r.kuota_sebelum != null ? Number(r.kuota_sebelum) : null,
    kuota_sesudah: r.kuota_sesudah != null ? Number(r.kuota_sesudah) : null
  }));
};

// Public export untuk caller lain
exports.sisaHari = sisaHari;
exports.effectiveExpired = effectiveExpired;
