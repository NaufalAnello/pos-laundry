const { spawn } = require('child_process');
const path = require('path');

const LEBAR = 32;
const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/print.py');
const ESC = 0x1b;

const fmtRp = (n) => Number(n || 0).toLocaleString('id-ID');

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
  });
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
        reject(new Error(stdout.trim() || stderr.trim() || `print.py keluar dengan kode ${code}`));
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
      resolve({
        connected,
        port: 'USB 0x0fe6:0x811e',
        error: connected ? undefined : (err.trim() || 'Printer tidak ditemukan di USB'),
      });
    });
    proc.on('error', () => resolve({
      connected: false, port: 'USB 0x0fe6:0x811e', error: 'python3 tidak tersedia'
    }));
  });
}

async function cetakStruk(transaksi, pengaturan, poinEarned = 0) {
  const buf = generateEscPos(transaksi, pengaturan, poinEarned);
  await sendToPrinter(buf);
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
  await sendToPrinter(buf);
}

module.exports = { cekPrinter, cetakStruk, cetakTest };
