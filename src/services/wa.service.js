const db = require('../database/connection');

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtRp   = (n)  => Number(n || 0).toLocaleString('id-ID');
const fmtDate = (d)  => d
  ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  : '—';

const formatPhone = (telepon) => {
  if (!telepon) return null;
  const clean = telepon.replace(/\D/g, '');
  if (clean.startsWith('62')) return clean;
  if (clean.startsWith('0'))  return '62' + clean.slice(1);
  return '62' + clean;
};

// ── generateURL ──────────────────────────────────────────────────────────────
/**
 * @param {string} nomor           — nomor telepon (format apapun)
 * @param {string} teks            — teks pesan
 * @param {string} [mode=regular]  — 'regular' (wa.me) | 'business' (api.whatsapp.com)
 * @returns {string|null}
 */
const generateURL = (nomor, teks, mode = 'business') => {
  const phone = formatPhone(nomor);
  if (!phone) return null;
  const encoded = encodeURIComponent(teks);
  if (mode === 'business') {
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`;
  }
  return `https://wa.me/${phone}?text=${encoded}`;
};

// ── Ambil semua pengaturan ───────────────────────────────────────────────────
const getSettings = async () => {
  const rows = await db('pengaturan').select('kunci', 'nilai');
  return Object.fromEntries(rows.map(r => [r.kunci, r.nilai ?? '']));
};

// ── Replace variabel dalam template ─────────────────────────────────────────
const render = (template, vars) =>
  template.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);

// ── Build teks item per baris ────────────────────────────────────────────────
const buildItemLines = (items = []) =>
  items.map((it, i) =>
    `${i + 1}. ${it.nama_layanan} – ${it.jumlah} ${it.satuan || ''} × Rp ${fmtRp(it.harga_satuan)} = *Rp ${fmtRp(it.subtotal)}*`
  ).join('\n');

// ── Build teks biaya tambahan per baris ──────────────────────────────────────
const buildBiayaTambahanLines = (biayaTambahan = []) => {
  if (!biayaTambahan || biayaTambahan.length === 0) return '';
  const lines = biayaTambahan.map(b => `- ${b.keterangan}: Rp${fmtRp(b.nominal)}`).join('\n');
  return `\n\n💰 *Biaya Tambahan:*\n${lines}`;
};

// ── Ambil poin yang didapat dari transaksi ───────────────────────────────────
const getPoinEarned = async (transaksiId) => {
  const row = await db('riwayat_poin')
    .where({ transaksi_id: transaksiId, jenis: 'tambah' })
    .sum('jumlah_poin as total')
    .first();
  return Number(row?.total) || 0;
};

// ── buildNota — pesan konfirmasi order baru ──────────────────────────────────
const buildNota = async (transaksi, mode = 'regular') => {
  const s = await getSettings();
  const poinEarned = await getPoinEarned(transaksi.id);

  const vars = {
    nama:            transaksi.pelanggan_nama || 'Pelanggan',
    nomor:           transaksi.nomor_transaksi,
    tanggal_masuk:   fmtDate(transaksi.tanggal_masuk),
    tanggal_selesai: fmtDate(transaksi.tanggal_selesai),
    items:           buildItemLines(transaksi.items) + buildBiayaTambahanLines(transaksi.biaya_tambahan),
    subtotal:        fmtRp(transaksi.total_harga),
    diskon:          fmtRp(transaksi.diskon),
    total:           fmtRp(transaksi.total_bayar),
    bayar:           fmtRp(transaksi.bayar),
    kembalian:       fmtRp(transaksi.kembalian),
    poin_dapat:      poinEarned,
    poin_total:      transaksi.pelanggan_poin ?? '—',
    nama_toko:       s.nama_toko    || 'Laundry',
    alamat_toko:     s.alamat_toko  || '',
    telepon_toko:    s.telepon_toko || '',
    jam_operasional: s.jam_operasional || '08.00–21.00'
  };

  const template = s.wa_template_nota || '{nama}, order {nomor} diterima. Total Rp {total}.';
  return render(template, vars);
};

// ── buildTagihan — pengingat tagihan belum lunas ─────────────────────────────
const buildTagihan = async (transaksi, mode = 'regular') => {
  const s = await getSettings();
  const sisa = Math.max(0, transaksi.total_bayar - (transaksi.bayar || 0));

  const vars = {
    nama:            transaksi.pelanggan_nama || 'Pelanggan',
    nomor:           transaksi.nomor_transaksi,
    tanggal_masuk:   fmtDate(transaksi.tanggal_masuk),
    tanggal_selesai: fmtDate(transaksi.tanggal_selesai),
    total:           fmtRp(sisa),
    nama_toko:       s.nama_toko    || 'Laundry',
    alamat_toko:     s.alamat_toko  || '',
    telepon_toko:    s.telepon_toko || '',
    jam_operasional: s.jam_operasional || '08.00–21.00'
  };

  const template = s.wa_template_tagihan || '{nama}, sisa tagihan {nomor}: Rp {total}.';
  return render(template, vars);
};

// ── buildNotifSelesai — laundry selesai siap diambil ────────────────────────
const buildNotifSelesai = async (transaksi, mode = 'regular') => {
  const s = await getSettings();

  const vars = {
    nama:            transaksi.pelanggan_nama || 'Pelanggan',
    nomor:           transaksi.nomor_transaksi,
    tanggal_selesai: fmtDate(transaksi.tanggal_selesai || new Date()),
    nama_toko:       s.nama_toko      || 'Laundry',
    alamat_toko:     s.alamat_toko    || '',
    telepon_toko:    s.telepon_toko   || '',
    jam_operasional: s.jam_operasional || '08.00–21.00'
  };

  const template = s.wa_template_notif_selesai || '{nama}, laundry {nomor} sudah selesai!';
  return render(template, vars);
};

// ── buildNotifDepositTipis — saldo deposit hampir habis ─────────────────────
const buildNotifDepositTipis = async (pelanggan, saldo) => {
  const s = await getSettings();
  const template = s.wa_template_deposit_tipis ||
    'Halo {nama}, saldo deposit Anda di {nama_toko} tinggal *Rp {saldo}*. Silakan lakukan top-up agar bisa digunakan untuk pembayaran berikutnya. Info: {telepon_toko}.';
  return render(template, {
    nama:       pelanggan.nama || 'Pelanggan',
    saldo:      fmtRp(saldo),
    nama_toko:  s.nama_toko    || 'Laundry',
    telepon_toko: s.telepon_toko || ''
  });
};

// Cek dan catat log notif deposit tipis (tidak kirim otomatis, hanya log)
const cekNotifDepositTipis = async (pelanggan, saldoSesudah, transaksiId) => {
  try {
    const s = await getSettings();
    const threshold = Number(s.deposit_notif_threshold || 20000);
    if (saldoSesudah >= threshold || !pelanggan?.telepon) return;

    const pesan = await buildNotifDepositTipis(pelanggan, saldoSesudah);
    const url   = generateURL(pelanggan.telepon, pesan, s.wa_mode_default || s.wa_mode || 'business');

    await db('wa_log').insert({
      telepon:      pelanggan.telepon,
      pesan,
      url,
      status:       'pending',
      jenis:        'deposit_tipis',
      transaksi_id: transaksiId || null,
      created_at:   new Date()
    });
  } catch (_) { /* non-critical */ }
};

// ── buildBroadcast — pesan broadcast ke banyak pelanggan ────────────────────
/**
 * @param {string}   pesan       — teks pesan yang akan dikirim
 * @param {Array}    pelanggan   — array { id, nama, telepon }
 * @param {string}   mode        — 'regular' | 'business'
 * @returns {Array}              — array { pelanggan, url }
 */
const buildBroadcast = (pesan, pelanggan = [], mode = 'business') =>
  pelanggan
    .filter(p => p.telepon)
    .map(p => ({
      pelanggan: { id: p.id, nama: p.nama, telepon: p.telepon },
      url:       generateURL(p.telepon, pesan, mode)
    }));

module.exports = {
  generateURL,
  buildNota,
  buildTagihan,
  buildNotifSelesai,
  buildNotifDepositTipis,
  cekNotifDepositTipis,
  buildBroadcast,
  getSettings,          // dipakai struk controller
  getPoinEarned,
  formatPhone,
  fmtRp,
  fmtDate
};
