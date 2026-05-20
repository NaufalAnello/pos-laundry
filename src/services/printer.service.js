const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');

const LEBAR = 32;
const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/print.py');

const ESC = 0x1B;
const LF  = 0x0A;

const CMD = {
  INIT:         Buffer.from([ESC, 0x40]),
  ALIGN_LEFT:   Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  BOLD_ON:      Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:     Buffer.from([ESC, 0x45, 0x00]),
  FEED_LINE:    Buffer.from([LF]),
};

const feedLines = (n) => Buffer.from([ESC, 0x64, n]);
const textBuf   = (s)  => Buffer.from(String(s) + '\n', 'latin1');
const drawLine  = ()   => textBuf('-'.repeat(LEBAR));

function leftRight(left, right) {
  const pad = LEBAR - left.length - right.length;
  return textBuf(left + ' '.repeat(Math.max(1, pad)) + right);
}

function buildEscpos(buildFn) {
  const parts = [CMD.INIT];
  const p = {
    alignLeft:   ()      => parts.push(CMD.ALIGN_LEFT),
    alignCenter: ()      => parts.push(CMD.ALIGN_CENTER),
    bold:        (on)    => parts.push(on ? CMD.BOLD_ON : CMD.BOLD_OFF),
    println:     (str)   => parts.push(textBuf(str)),
    drawLine:    ()      => parts.push(drawLine()),
    leftRight:   (l, r)  => parts.push(leftRight(String(l), String(r))),
    newLine:     ()      => parts.push(CMD.FEED_LINE),
  };
  buildFn(p);
  parts.push(feedLines(4));
  return Buffer.concat(parts);
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
  try {
    const result = execSync(
      'python3 -c "import usb.core; d=usb.core.find(idVendor=0x0fe6,idProduct=0x811e); print(\'found\' if d else \'not_found\')"',
      { timeout: 5000, encoding: 'utf8' }
    ).trim();
    const connected = result === 'found';
    return {
      connected,
      port: 'USB 0x0fe6:0x811e',
      error: connected ? undefined : 'Printer tidak ditemukan di USB',
    };
  } catch (err) {
    return { connected: false, port: 'USB 0x0fe6:0x811e', error: err.message };
  }
}

const fmtRp = (n) => Number(n || 0).toLocaleString('id-ID');

async function cetakStruk(transaksi, pengaturan, poinEarned = 0) {
  const buf = buildEscpos((p) => {
    // Header
    p.alignCenter();
    p.bold(true);
    p.println(pengaturan.nama_toko || 'MEMPAWAH LAUNDRY');
    p.bold(false);
    if (pengaturan.alamat_toko) p.println(pengaturan.alamat_toko);
    if (pengaturan.telepon_toko) p.println('WA: ' + pengaturan.telepon_toko);
    p.drawLine();

    // Info order
    p.alignLeft();
    p.println('No: ' + transaksi.nomor_transaksi);
    p.println('Tgl: ' + new Date(transaksi.tanggal_masuk)
      .toLocaleString('id-ID', { timeZone: 'Asia/Makassar',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit' }));
    p.println('Plg: ' + (transaksi.pelanggan_nama || 'Non-member'));
    if (transaksi.pelanggan_telepon) p.println('WA : ' + transaksi.pelanggan_telepon);
    if (transaksi.kasir_nama) p.println('Kasir: ' + transaksi.kasir_nama);
    p.drawLine();

    // Items
    p.println('LAYANAN:');
    (transaksi.items || []).forEach(item => {
      p.println(String(item.nama_layanan || '').substring(0, LEBAR));
      const qty = `  ${item.jumlah} ${item.satuan || ''} x Rp${fmtRp(item.harga_satuan)}`;
      p.leftRight(qty, `Rp${fmtRp(item.subtotal)}`);
      if (item.catatan) p.println('  *' + item.catatan);
    });
    p.drawLine();

    // Total
    if ((transaksi.diskon || 0) > 0) {
      p.leftRight('Subtotal', 'Rp' + fmtRp(transaksi.total_harga));
      p.leftRight('Diskon', '-Rp' + fmtRp(transaksi.diskon));
    }
    if (transaksi.antar_jemput) p.leftRight('Antar/Jemput', 'termasuk');
    p.bold(true);
    p.leftRight('TOTAL BAYAR', 'Rp' + fmtRp(transaksi.total_bayar));
    p.bold(false);
    p.drawLine();

    // Pembayaran
    const lunas = (transaksi.bayar || 0) >= transaksi.total_bayar;
    const statusBayar = lunas ? 'LUNAS' : ((transaksi.bayar || 0) > 0 ? 'DP/CICILAN' : 'BELUM BAYAR');
    p.println('Bayar : ' + (transaksi.metode_bayar || 'tunai').toUpperCase());
    p.println('Status: ' + statusBayar);
    if (!lunas && (transaksi.bayar || 0) > 0) {
      p.println('Dibayar : Rp' + fmtRp(transaksi.bayar));
      p.println('Sisa    : Rp' + fmtRp(transaksi.total_bayar - transaksi.bayar));
    } else if (lunas) {
      p.println('Dibayar : Rp' + fmtRp(transaksi.bayar));
      if ((transaksi.kembalian || 0) > 0) p.println('Kembali : Rp' + fmtRp(transaksi.kembalian));
    }
    p.drawLine();

    // Estimasi selesai
    if (transaksi.tanggal_selesai) {
      p.println('Estimasi selesai:');
      p.alignCenter();
      p.bold(true);
      p.println(new Date(transaksi.tanggal_selesai)
        .toLocaleString('id-ID', { timeZone: 'Asia/Makassar',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit' }));
      p.bold(false);
      p.alignLeft();
      p.drawLine();
    }

    // Poin
    if (poinEarned > 0) {
      p.alignCenter();
      p.println('+' + poinEarned + ' poin didapat');
      if (transaksi.pelanggan_poin != null) p.println('Total poin: ' + transaksi.pelanggan_poin);
      p.alignLeft();
      p.drawLine();
    }

    // Footer
    p.alignCenter();
    p.println(pengaturan.footer_struk || 'Terima kasih!');
    p.println('Tunjukkan struk saat ambil.');
  });

  await sendToPrinter(buf);
}

async function cetakTest() {
  const buf = buildEscpos((p) => {
    p.alignCenter();
    p.bold(true);
    p.println('=== TEST PRINT ===');
    p.bold(false);
    p.println('Xantri BT-58D OK');
    p.println('POS Laundry Ready');
    p.drawLine();
    p.println(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }));
  });

  await sendToPrinter(buf);
}

module.exports = { cekPrinter, cetakStruk, cetakTest };
