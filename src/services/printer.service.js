const { spawn } = require('child_process');
const path = require('path');
const db   = require('../database/connection');
const { DEFAULT_STRUK, DEFAULT_LABEL, parseConfig } = require('../utils/print-template');

const LEBAR = 32;
const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/print.py');
const ESC = 0x1b;

// Jeda drain setelah cetak supaya buffer printer kosong sebelum job berikutnya
// (mencegah bytes pertama job kedua hilang saat printer masih mekanik mencetak job 1)
const PRINT_DRAIN_MS = 700;

// Mutex sederhana: cetak dijalankan serial supaya tidak ada race di USB endpoint.
// Bug sebelumnya: ORDER kadang hilang di label kedua saat operator klik 2x cepat.
let printQueue = Promise.resolve();
function withPrintLock(fn) {
  const next = printQueue.then(() => fn());
  printQueue = next.then(
    () => new Promise((r) => setTimeout(r, PRINT_DRAIN_MS)),
    () => new Promise((r) => setTimeout(r, PRINT_DRAIN_MS))
  );
  return next;
}

const fmtRp = (n) => Number(n || 0).toLocaleString('id-ID');

// Ambil config template (struk/label) dari pengaturan. Return null kalau belum ada
// supaya pemanggil bisa fallback ke renderer default yang lama (zero-regression).
async function loadTemplateConfig(jenis) {
  if (jenis !== 'struk' && jenis !== 'label') return null;
  try {
    const row = await db('pengaturan').where({ kunci: `template_${jenis}` }).first();
    if (!row || !row.nilai) return null;
    return parseConfig(row.nilai, jenis);
  } catch {
    return null;
  }
}

// Generate ESC/POS bytes untuk Xantri BT-58D 58mm
function generateEscPos(transaksi, pengaturan, poinEarned = 0) {
  const bytes = [];
  const push   = (s)  => Buffer.from(String(s), 'utf8').forEach(b => bytes.push(b));
  const nl     = ()   => bytes.push(0x0a);
  const bold   = (on) => bytes.push(ESC, 0x45, on ? 1 : 0);
  const center = ()   => bytes.push(ESC, 0x61, 0x01);
  const left   = ()   => bytes.push(ESC, 0x61, 0x00);
  const line   = ()   => { push('-'.repeat(LEBAR)); nl(); };
  const lr = (l, r) => {
    const sp = LEBAR - l.length - r.length;
    push(l + ' '.repeat(Math.max(1, sp)) + r); nl();
  };

  // Init printer
  bytes.push(ESC, 0x40);

  // Header
  center();
  bold(true);
  push(pengaturan.nama_toko || 'MEMPAWAH LAUNDRY'); nl();
  bold(false);
  if (pengaturan.alamat_toko) { push(pengaturan.alamat_toko); nl(); }
  if (pengaturan.telepon_toko) { push('WA: ' + pengaturan.telepon_toko); nl(); }
  line();

  // Info order
  left();
  push('No : ' + transaksi.nomor_transaksi); nl();
  push('Tgl: ' + new Date(transaksi.tanggal_masuk).toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  })); nl();
  push('Plg: ' + (transaksi.pelanggan_nama || 'Non-member')); nl();
  if (transaksi.pelanggan_telepon) { push('WA : ' + transaksi.pelanggan_telepon); nl(); }
  if (transaksi.kasir_nama) { push('Kasir: ' + transaksi.kasir_nama); nl(); }
  line();

  // Items
  push('LAYANAN:'); nl();
  (transaksi.items || []).forEach(item => {
    push(String(item.nama_layanan || '').substring(0, LEBAR)); nl();
    const qty = '  ' + item.jumlah + ' ' + (item.satuan || '') + ' x Rp' + fmtRp(item.harga_satuan);
    lr(qty, 'Rp' + fmtRp(item.subtotal));
    if (item.catatan) { push('  *' + item.catatan); nl(); }

    // Tampilkan rincian item jika ada
    if (item.rincian && item.rincian.length > 0) {
      item.rincian.forEach(r => {
        push('    - ' + r.nama_item + ' ' + r.jumlah + ' ' + r.satuan); nl();
      });
    }
  });

  // Biaya Tambahan
  if (transaksi.biaya_tambahan && transaksi.biaya_tambahan.length > 0) {
    line();
    push('Biaya Tambahan:'); nl();
    (transaksi.biaya_tambahan || []).forEach(bt => {
      lr(' ' + String(bt.keterangan).substring(0, LEBAR - 10), 'Rp' + fmtRp(bt.nominal));
    });
  }

  line();

  // Total
  if ((transaksi.diskon || 0) > 0) {
    lr('Subtotal', 'Rp' + fmtRp(transaksi.total_harga));
    lr('Diskon', '-Rp' + fmtRp(transaksi.diskon));
  }
  bold(true);
  lr('TOTAL BAYAR', 'Rp' + fmtRp(transaksi.total_bayar));
  bold(false);
  line();

  // Pembayaran
  const lunas = (transaksi.bayar || 0) >= transaksi.total_bayar;
  const statusBayar = lunas ? 'LUNAS' : ((transaksi.bayar || 0) > 0 ? 'DP/CICILAN' : 'BELUM BAYAR');
  push('Bayar : ' + (transaksi.metode_bayar || 'tunai').toUpperCase()); nl();
  push('Status: ' + statusBayar); nl();
  if (!lunas && (transaksi.bayar || 0) > 0) {
    push('Dibayar : Rp' + fmtRp(transaksi.bayar)); nl();
    push('Sisa    : Rp' + fmtRp(transaksi.total_bayar - transaksi.bayar)); nl();
  } else if (lunas) {
    push('Dibayar : Rp' + fmtRp(transaksi.bayar)); nl();
    if ((transaksi.kembalian || 0) > 0) { push('Kembali : Rp' + fmtRp(transaksi.kembalian)); nl(); }
  }

  // Deposit info jika relevan
  if (transaksi.metode_bayar === 'deposit' && transaksi.saldo_deposit_sesudah != null) {
    push('Saldo Dep: Rp' + fmtRp(transaksi.saldo_deposit_sesudah)); nl();
  }
  if ((transaksi.kelebihan_ke_deposit || 0) > 0) {
    push('+Deposit : Rp' + fmtRp(transaksi.kelebihan_ke_deposit)); nl();
  }
  line();

  // Estimasi selesai
  if (transaksi.tanggal_selesai) {
    center();
    push('Estimasi selesai:'); nl();
    bold(true);
    push(new Date(transaksi.tanggal_selesai).toLocaleString('id-ID', {
      timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    })); nl();
    bold(false);
    left();
    line();
  }

  // Poin
  if (poinEarned > 0) {
    center();
    push('+' + poinEarned + ' poin didapat'); nl();
    if (transaksi.pelanggan_poin != null) { push('Total poin: ' + transaksi.pelanggan_poin); nl(); }
    left();
    line();
  }

  // Footer
  center();
  push(pengaturan.footer_struk || 'Terima kasih!'); nl();
  push('Tunjukkan struk saat ambil.'); nl();

  // XANTRI BT-58D: TIDAK ADA AUTO CUTTER
  // Feed 5 baris untuk robekan manual
  for (let i = 0; i < 5; i++) nl();

  return Buffer.from(bytes);
}

function sendToPrinter(buf) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [PYTHON_SCRIPT]);
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Printer timeout setelah 10 detik'));
    }, 10000);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trimStart().startsWith('OK')) {
        resolve(stdout.trim());
      } else {
        // Ringkas error umum agar pesan ke pengguna jelas
        const raw = (stderr + stdout);
        let msg;
        if (/No module named ['"]?usb/.test(raw))   msg = 'Library pyusb belum terpasang di server';
        else if (/Printer tidak ditemukan/.test(raw)) msg = 'Printer tidak terhubung';
        else if (/Access|Permission/i.test(raw))    msg = 'Akses USB ditolak (cek izin/privileged)';
        else msg = (stdout.trim() || stderr.trim().split('\n').pop() || `print.py keluar kode ${code}`);
        reject(new Error(msg));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Gagal menjalankan print.py: ${err.message}`));
    });

    proc.stdin.write(buf);
    proc.stdin.end();
  });
}

async function cekPrinter() {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c',
      'import usb.core; d=usb.core.find(idVendor=0x0fe6,idProduct=0x811e); print("ok" if d else "not_found")'
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('close', () => {
      const connected = out.trim() === 'ok';
      // Ringkas pesan error agar ramah ditampilkan di indikator (bukan traceback mentah)
      let error;
      if (!connected) {
        if (/No module named ['"]?usb/.test(err))      error = 'Library pyusb belum terpasang';
        else if (out.trim() === 'not_found')           error = 'Printer tidak ditemukan di USB';
        else if (/Access|Permission/i.test(err))       error = 'Akses USB ditolak (cek izin/privileged)';
        else                                           error = 'Printer tidak ditemukan di USB';
      }
      resolve({ connected, port: 'USB 0x0fe6:0x811e', error });
    });
    proc.on('error', () => resolve({
      connected: false, port: 'USB 0x0fe6:0x811e', error: 'python3 tidak tersedia'
    }));
  });
}

async function cetakStruk(transaksi, pengaturan, poinEarned = 0) {
  const config = await loadTemplateConfig('struk');
  const buf = config
    ? generateStrukFromTemplate(transaksi, pengaturan, poinEarned, config)
    : generateEscPos(transaksi, pengaturan, poinEarned);
  await withPrintLock(() => sendToPrinter(buf));
}

// ─────────────────────────────────────────────────────────────────────────────
// Template-driven renderers (dipakai HANYA jika operator simpan config custom).
// Default tetap pakai generateEscPos / generateLabelEscPos lama (zero-regression).
//
// Setiap elemen ID dimap ke salah satu opcode pada renderer di bawah. Renderer
// melakukan operasi byte yang identik dengan logic lama, hanya saja dispatched
// berdasarkan urutan & aktif/false dari config.
// ─────────────────────────────────────────────────────────────────────────────
function makeWriters(bytes) {
  const push   = (s)  => Buffer.from(String(s), 'utf8').forEach(b => bytes.push(b));
  const nl     = ()   => bytes.push(0x0a);
  const bold   = (on) => bytes.push(ESC, 0x45, on ? 1 : 0);
  const center = ()   => bytes.push(ESC, 0x61, 0x01);
  const left   = ()   => bytes.push(ESC, 0x61, 0x00);
  const line   = ()   => { push('-'.repeat(LEBAR)); nl(); };
  const dline  = ()   => { push('='.repeat(LEBAR)); nl(); };
  const lr     = (l, r) => {
    const sp = LEBAR - l.length - r.length;
    push(l + ' '.repeat(Math.max(1, sp)) + r); nl();
  };
  return { push, nl, bold, center, left, line, dline, lr };
}

function formatTeleponPelanggan(nomor) {
  if (!nomor) return '';
  const n = String(nomor).trim();
  if (n.startsWith('628')) return '08' + n.slice(3);
  if (n.startsWith('62'))  return '0'  + n.slice(2);
  return n;
}

// Group setiap elemen pada STRUK — dipakai untuk insert pemisah otomatis
// saat berpindah grup, supaya layout tetap rapi meski urutan diubah.
const STRUK_GROUP = {
  nama_toko: 'header', alamat_toko: 'header', telepon_toko: 'header',
  nomor_order: 'info', tanggal: 'info', kasir: 'info',
  nama_pelanggan: 'info', nomor_wa: 'info',
  daftar_layanan: 'items', biaya_tambahan: 'items',
  diskon: 'total', total: 'total',
  status_bayar: 'pay',
  estimasi_selesai: 'estim',
  footer: 'footer', instruksi_ambil: 'footer',
};

// Group untuk LABEL — pakai dline (===) di antara grup, kayak default label sekarang
const LABEL_GROUP = {
  nama_toko: 'header', alamat_toko: 'header', telepon_toko: 'header',
  nomor_order: 'order',
  nama_pelanggan: 'pelanggan', nomor_wa: 'pelanggan',
  tanggal: 'meta', kasir: 'meta', estimasi_selesai: 'meta',
  daftar_layanan: 'items', biaya_tambahan: 'items',
  diskon: 'total', total: 'total', status_bayar: 'total',
  footer: 'footer', instruksi_ambil: 'footer',
};

function generateStrukFromTemplate(transaksi, pengaturan, poinEarned, config) {
  const bytes = [];
  const w = makeWriters(bytes);

  // Init printer
  bytes.push(ESC, 0x40);

  const elements = config.elemen
    .filter(e => e.aktif)
    .slice()
    .sort((a, b) => a.urutan - b.urutan);

  let lastGroup = null;
  let inCenterMode = false;
  let lastWasHeader = false;

  const ensureLeft = () => { if (inCenterMode) { w.left(); inCenterMode = false; } };
  const ensureCenter = () => { if (!inCenterMode) { w.center(); inCenterMode = true; } };

  for (const el of elements) {
    const group = STRUK_GROUP[el.id] || 'other';

    // Pemisah otomatis antar grup
    if (lastGroup !== null && lastGroup !== group) {
      ensureLeft();
      w.line();
    }

    switch (el.id) {
      case 'nama_toko':
        ensureCenter();
        w.bold(true);
        w.push(pengaturan.nama_toko || 'MEMPAWAH LAUNDRY'); w.nl();
        w.bold(false);
        lastWasHeader = true;
        break;

      case 'alamat_toko':
        if (pengaturan.alamat_toko) {
          ensureCenter();
          w.push(pengaturan.alamat_toko); w.nl();
        }
        break;

      case 'telepon_toko':
        if (pengaturan.telepon_toko) {
          ensureCenter();
          w.push('WA: ' + pengaturan.telepon_toko); w.nl();
        }
        break;

      case 'nomor_order':
        ensureLeft();
        w.push('No : ' + (transaksi.nomor_transaksi || '')); w.nl();
        break;

      case 'tanggal':
        ensureLeft();
        w.push('Tgl: ' + new Date(transaksi.tanggal_masuk).toLocaleString('id-ID', {
          timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit',
          year: 'numeric', hour: '2-digit', minute: '2-digit'
        })); w.nl();
        break;

      case 'kasir':
        if (transaksi.kasir_nama) {
          ensureLeft();
          w.push('Kasir: ' + transaksi.kasir_nama); w.nl();
        }
        break;

      case 'nama_pelanggan':
        ensureLeft();
        w.push('Plg: ' + (transaksi.pelanggan_nama || 'Non-member')); w.nl();
        break;

      case 'nomor_wa':
        if (transaksi.pelanggan_telepon) {
          ensureLeft();
          w.push('WA : ' + transaksi.pelanggan_telepon); w.nl();
        }
        break;

      case 'daftar_layanan': {
        ensureLeft();
        w.push('LAYANAN:'); w.nl();
        (transaksi.items || []).forEach(item => {
          w.push(String(item.nama_layanan || '').substring(0, LEBAR)); w.nl();
          const qty = '  ' + item.jumlah + ' ' + (item.satuan || '') + ' x Rp' + fmtRp(item.harga_satuan);
          w.lr(qty, 'Rp' + fmtRp(item.subtotal));
          if (item.catatan) { w.push('  *' + item.catatan); w.nl(); }
          if (item.rincian && item.rincian.length > 0) {
            item.rincian.forEach(r => {
              w.push('    - ' + r.nama_item + ' ' + r.jumlah + ' ' + r.satuan); w.nl();
            });
          }
        });
        break;
      }

      case 'biaya_tambahan':
        if (transaksi.biaya_tambahan && transaksi.biaya_tambahan.length > 0) {
          ensureLeft();
          w.push('Biaya Tambahan:'); w.nl();
          transaksi.biaya_tambahan.forEach(bt => {
            w.lr(' ' + String(bt.keterangan).substring(0, LEBAR - 10), 'Rp' + fmtRp(bt.nominal));
          });
        }
        break;

      case 'diskon':
        if ((transaksi.diskon || 0) > 0) {
          ensureLeft();
          w.lr('Subtotal', 'Rp' + fmtRp(transaksi.total_harga));
          w.lr('Diskon', '-Rp' + fmtRp(transaksi.diskon));
        }
        break;

      case 'total':
        ensureLeft();
        w.bold(true);
        w.lr('TOTAL BAYAR', 'Rp' + fmtRp(transaksi.total_bayar));
        w.bold(false);
        break;

      case 'status_bayar': {
        ensureLeft();
        const lunas = (transaksi.bayar || 0) >= transaksi.total_bayar;
        const statusBayar = lunas ? 'LUNAS' : ((transaksi.bayar || 0) > 0 ? 'DP/CICILAN' : 'BELUM BAYAR');
        w.push('Bayar : ' + (transaksi.metode_bayar || 'tunai').toUpperCase()); w.nl();
        w.push('Status: ' + statusBayar); w.nl();
        if (!lunas && (transaksi.bayar || 0) > 0) {
          w.push('Dibayar : Rp' + fmtRp(transaksi.bayar)); w.nl();
          w.push('Sisa    : Rp' + fmtRp(transaksi.total_bayar - transaksi.bayar)); w.nl();
        } else if (lunas) {
          w.push('Dibayar : Rp' + fmtRp(transaksi.bayar)); w.nl();
          if ((transaksi.kembalian || 0) > 0) {
            w.push('Kembali : Rp' + fmtRp(transaksi.kembalian)); w.nl();
          }
        }
        if (transaksi.metode_bayar === 'deposit' && transaksi.saldo_deposit_sesudah != null) {
          w.push('Saldo Dep: Rp' + fmtRp(transaksi.saldo_deposit_sesudah)); w.nl();
        }
        if ((transaksi.kelebihan_ke_deposit || 0) > 0) {
          w.push('+Deposit : Rp' + fmtRp(transaksi.kelebihan_ke_deposit)); w.nl();
        }
        if (poinEarned > 0) {
          ensureCenter();
          w.push('+' + poinEarned + ' poin didapat'); w.nl();
          if (transaksi.pelanggan_poin != null) {
            w.push('Total poin: ' + transaksi.pelanggan_poin); w.nl();
          }
          ensureLeft();
        }
        break;
      }

      case 'estimasi_selesai':
        if (transaksi.tanggal_selesai) {
          ensureCenter();
          w.push('Estimasi selesai:'); w.nl();
          w.bold(true);
          w.push(new Date(transaksi.tanggal_selesai).toLocaleString('id-ID', {
            timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit',
            year: 'numeric', hour: '2-digit', minute: '2-digit'
          })); w.nl();
          w.bold(false);
        }
        break;

      case 'footer':
        ensureCenter();
        w.push(pengaturan.footer_struk || 'Terima kasih!'); w.nl();
        break;

      case 'instruksi_ambil':
        ensureCenter();
        w.push('Tunjukkan struk saat ambil.'); w.nl();
        break;
    }

    lastGroup = group;
  }

  ensureLeft();
  for (let i = 0; i < 5; i++) w.nl();
  return Buffer.from(bytes);
}

function generateLabelFromTemplate(transaksi, pengaturan, layanan_ids, config) {
  const bytes = [];
  const w = makeWriters(bytes);

  // Init printer
  bytes.push(ESC, 0x40);
  w.left();

  // Filter items
  let items = transaksi.items || [];
  if (layanan_ids && Array.isArray(layanan_ids) && layanan_ids.length > 0) {
    items = items.filter(item => layanan_ids.includes(item.id));
  }

  const elements = config.elemen
    .filter(e => e.aktif)
    .slice()
    .sort((a, b) => a.urutan - b.urutan);

  // Pakai dline (===) sebagai pemisah antar grup di label
  let lastGroup = null;
  let inCenterMode = false;

  const ensureLeft = () => { if (inCenterMode) { w.left(); inCenterMode = false; } };
  const ensureCenter = () => { if (!inCenterMode) { w.center(); inCenterMode = true; } };

  // dline pertama (atas) hanya jika elemen pertama ada di grup 'order' atau 'pelanggan'
  let needTopDline = elements.length > 0;

  for (const el of elements) {
    const group = LABEL_GROUP[el.id] || 'other';

    if (lastGroup === null) {
      if (needTopDline && (group === 'order' || group === 'pelanggan')) {
        ensureLeft();
        w.dline();
      }
    } else if (lastGroup !== group) {
      ensureLeft();
      // pemisah default label: dline antar grup info, line antar items/total
      if (group === 'items' || (lastGroup === 'items' && group === 'total')) {
        w.line();
      } else {
        w.dline();
      }
    }

    switch (el.id) {
      case 'nama_toko':
        ensureCenter();
        w.bold(true);
        w.push(pengaturan.nama_toko || 'MEMPAWAH LAUNDRY'); w.nl();
        w.bold(false);
        break;

      case 'alamat_toko':
        if (pengaturan.alamat_toko) {
          ensureCenter();
          w.push(pengaturan.alamat_toko); w.nl();
        }
        break;

      case 'telepon_toko':
        if (pengaturan.telepon_toko) {
          ensureCenter();
          w.push('WA: ' + pengaturan.telepon_toko); w.nl();
        }
        break;

      case 'nomor_order':
        ensureLeft();
        w.bold(true);
        w.push('ORDER: ' + (transaksi.nomor_transaksi || '')); w.nl();
        w.bold(false);
        break;

      case 'tanggal':
        ensureLeft();
        w.push('Tgl: ' + new Date(transaksi.tanggal_masuk).toLocaleString('id-ID', {
          timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit',
          year: 'numeric', hour: '2-digit', minute: '2-digit'
        })); w.nl();
        break;

      case 'kasir':
        if (transaksi.kasir_nama) {
          ensureLeft();
          w.push('Kasir: ' + transaksi.kasir_nama); w.nl();
        }
        break;

      case 'nama_pelanggan':
        ensureLeft();
        w.bold(true);
        w.push(transaksi.pelanggan_nama || 'Non-member'); w.nl();
        w.bold(false);
        break;

      case 'nomor_wa': {
        const tel = formatTeleponPelanggan(transaksi.pelanggan_telepon);
        if (tel) {
          ensureLeft();
          w.push('WA: ' + tel); w.nl();
        }
        break;
      }

      case 'estimasi_selesai':
        if (transaksi.tanggal_selesai) {
          ensureLeft();
          const tgl = new Date(transaksi.tanggal_selesai).toLocaleDateString('id-ID', {
            timeZone: 'Asia/Makassar', weekday: 'short',
            day: '2-digit', month: 'short', year: 'numeric'
          });
          w.push('Estimasi: ' + tgl); w.nl();
        }
        break;

      case 'daftar_layanan': {
        ensureLeft();
        if (items.length === 1) {
          const item = items[0];
          w.bold(true);
          w.push(String(item.nama_layanan || '').substring(0, LEBAR)); w.nl();
          w.bold(false);
          w.push('  ' + item.jumlah + ' ' + (item.satuan || '').trim()); w.nl();
        } else if (items.length > 1) {
          items.forEach((item, idx) => {
            w.bold(true);
            w.push((idx + 1) + '. ' + String(item.nama_layanan || '').substring(0, LEBAR - 3)); w.nl();
            w.bold(false);
            w.push('   ' + item.jumlah + ' ' + (item.satuan || '').trim()); w.nl();
          });
        }
        break;
      }

      case 'biaya_tambahan':
        if (transaksi.biaya_tambahan && transaksi.biaya_tambahan.length > 0) {
          ensureLeft();
          w.push('Biaya Tambahan:'); w.nl();
          transaksi.biaya_tambahan.forEach(bt => {
            const nama = '  ' + String(bt.keterangan || '').substring(0, 18);
            w.lr(nama, 'Rp' + fmtRp(bt.nominal));
          });
        }
        break;

      case 'diskon':
        if ((transaksi.diskon || 0) > 0) {
          ensureLeft();
          w.lr('Subtotal', 'Rp' + fmtRp(transaksi.total_harga));
          w.lr('Diskon', '-Rp' + fmtRp(transaksi.diskon));
        }
        break;

      case 'total':
        ensureLeft();
        w.bold(true);
        w.push('Total: Rp' + fmtRp(transaksi.total_bayar)); w.nl();
        w.bold(false);
        break;

      case 'status_bayar': {
        ensureLeft();
        const lunas = (transaksi.bayar || 0) >= transaksi.total_bayar;
        if (!lunas) {
          if ((transaksi.bayar || 0) > 0) {
            w.push('Status: DP Rp' + fmtRp(transaksi.bayar)); w.nl();
            w.push('Sisa: Rp' + fmtRp(transaksi.total_bayar - transaksi.bayar)); w.nl();
          } else {
            w.push('Status: BELUM LUNAS'); w.nl();
          }
        } else {
          w.push('Status: LUNAS'); w.nl();
        }
        break;
      }

      case 'footer':
        ensureCenter();
        w.push(pengaturan.footer_struk || 'Terima kasih!'); w.nl();
        break;

      case 'instruksi_ambil':
        ensureCenter();
        w.push('Tunjukkan label saat ambil'); w.nl();
        break;
    }

    lastGroup = group;
  }

  ensureLeft();
  // Penutup + feed
  if (lastGroup === 'footer') {
    // sudah pas, tidak perlu dline tambahan
  } else if (lastGroup !== null) {
    w.dline();
  }
  for (let i = 0; i < 3; i++) w.nl();
  return Buffer.from(bytes);
}

async function cetakTest() {
  const transaksi = {
    nomor_transaksi: 'TEST-001',
    tanggal_masuk:   new Date(),
    pelanggan_nama:  'Test Print',
    items: [{ nama_layanan: 'Test Item', jumlah: 1, satuan: 'kg', harga_satuan: 10000, subtotal: 10000 }],
    total_harga:     10000,
    total_bayar:     10000,
    diskon:          0,
    metode_bayar:    'tunai',
    bayar:           10000,
    kembalian:       0,
    tanggal_selesai: new Date(),
  };
  const pengaturan = {
    nama_toko:    'TEST PRINTER OK',
    alamat_toko:  'Mempawah Laundry',
    footer_struk: 'Test berhasil!'
  };
  const buf = generateEscPos(transaksi, pengaturan, 0);
  await withPrintLock(() => sendToPrinter(buf));
}

// Generate ESC/POS bytes untuk LABEL (hemat kertas, ringkas)
function generateLabelEscPos(transaksi, pengaturan, layanan_ids = null) {
  const bytes = [];
  const push   = (s)  => Buffer.from(String(s), 'utf8').forEach(b => bytes.push(b));
  const nl     = ()   => bytes.push(0x0a);
  const bold   = (on) => bytes.push(ESC, 0x45, on ? 1 : 0);
  const center = ()   => bytes.push(ESC, 0x61, 0x01);
  const left   = ()   => bytes.push(ESC, 0x61, 0x00);
  const line   = ()   => { push('-'.repeat(LEBAR)); nl(); };
  const dline  = ()   => { push('='.repeat(LEBAR)); nl(); };
  const lr     = (l, r) => {
    const sp = LEBAR - l.length - r.length;
    push(l + ' '.repeat(Math.max(1, sp)) + r); nl();
  };
  const formatTelepon = (nomor) => {
    if (!nomor) return '';
    const n = String(nomor).trim();
    if (n.startsWith('628')) return '08' + n.slice(3);
    if (n.startsWith('62'))  return '0'  + n.slice(2);
    return n;
  };

  // Filter items jika layanan_ids diberikan
  let items = transaksi.items || [];
  if (layanan_ids && Array.isArray(layanan_ids) && layanan_ids.length > 0) {
    items = items.filter(item => layanan_ids.includes(item.id));
  }

  // Init printer
  bytes.push(ESC, 0x40);
  left();

  // Nomor order
  dline();
  bold(true);
  push('ORDER: ' + (transaksi.nomor_transaksi || '')); nl();
  bold(false);
  dline();

  // Pelanggan
  bold(true);
  push(transaksi.pelanggan_nama || 'Non-member'); nl();
  bold(false);
  const tel = formatTelepon(transaksi.pelanggan_telepon);
  if (tel) { push('WA: ' + tel); nl(); }
  dline();

  // Estimasi selesai
  if (transaksi.tanggal_selesai) {
    const tgl = new Date(transaksi.tanggal_selesai).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    push('Estimasi: ' + tgl); nl();
    dline();
  }

  // Layanan
  if (items.length === 1) {
    const item = items[0];
    bold(true);
    push(String(item.nama_layanan || '').substring(0, LEBAR)); nl();
    bold(false);
    push('  ' + item.jumlah + ' ' + (item.satuan || '').trim()); nl();
  } else if (items.length > 1) {
    items.forEach((item, idx) => {
      bold(true);
      push((idx + 1) + '. ' + String(item.nama_layanan || '').substring(0, LEBAR - 3)); nl();
      bold(false);
      push('   ' + item.jumlah + ' ' + (item.satuan || '').trim()); nl();
    });
  }

  // Biaya Tambahan
  if (transaksi.biaya_tambahan && transaksi.biaya_tambahan.length > 0) {
    line();
    push('Biaya Tambahan:'); nl();
    transaksi.biaya_tambahan.forEach(bt => {
      const nama = '  ' + String(bt.keterangan || '').substring(0, 18);
      lr(nama, 'Rp' + fmtRp(bt.nominal));
    });
  }

  // Total & status
  line();
  bold(true);
  push('Total: Rp' + fmtRp(transaksi.total_bayar)); nl();
  bold(false);

  const lunas = (transaksi.bayar || 0) >= transaksi.total_bayar;
  if (!lunas) {
    if ((transaksi.bayar || 0) > 0) {
      push('Status: DP Rp' + fmtRp(transaksi.bayar)); nl();
      push('Sisa: Rp' + fmtRp(transaksi.total_bayar - transaksi.bayar)); nl();
    } else {
      push('Status: BELUM LUNAS'); nl();
    }
  } else {
    push('Status: LUNAS'); nl();
  }

  dline();
  center();
  push('Tunjukkan label saat ambil'); nl();

  // Feed 3 baris untuk robekan manual
  for (let i = 0; i < 3; i++) nl();

  return Buffer.from(bytes);
}

async function cetakLabel(transaksi, pengaturan, layanan_ids = null) {
  const config = await loadTemplateConfig('label');
  const buf = config
    ? generateLabelFromTemplate(transaksi, pengaturan, layanan_ids, config)
    : generateLabelEscPos(transaksi, pengaturan, layanan_ids);
  await withPrintLock(() => sendToPrinter(buf));
}

module.exports = { cekPrinter, cetakStruk, cetakTest, cetakLabel };
