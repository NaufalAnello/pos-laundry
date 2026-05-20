const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const fs = require('fs');

const PRINTER_PORT = () => process.env.PRINTER_PORT || '/dev/usb/lp0';

function buatPrinter() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: PRINTER_PORT(),
    characterSet: CharacterSet.PC852_LATIN2,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 5000 }
  });
}

async function cekPrinter() {
  const port = PRINTER_PORT();
  try {
    if (!fs.existsSync(port)) {
      return { connected: false, port, error: `Device ${port} tidak ditemukan` };
    }
    const printer = buatPrinter();
    const connected = await printer.isPrinterConnected();
    return { connected, port };
  } catch (err) {
    return { connected: false, port, error: err.message };
  }
}

const fmtRp = (n) => Number(n || 0).toLocaleString('id-ID');

async function cetakStruk(transaksi, pengaturan, poinEarned = 0) {
  const port = PRINTER_PORT();
  if (!fs.existsSync(port)) throw new Error(`Device ${port} tidak ditemukan. Pastikan printer terhubung via USB.`);
  const printer = buatPrinter();
  const connected = await printer.isPrinterConnected();
  if (!connected) throw new Error('Printer Xantri BT-58D tidak terhubung di ' + port);

  const LEBAR = 32;

  // ── HEADER ────────────────────────────────────────────────────
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(0, 0);
  printer.println(pengaturan.nama_toko || 'MEMPAWAH LAUNDRY');
  printer.bold(false);
  if (pengaturan.alamat_toko) printer.println(pengaturan.alamat_toko);
  if (pengaturan.telepon_toko) printer.println('WA: ' + pengaturan.telepon_toko);
  printer.drawLine();

  // ── INFO ORDER ────────────────────────────────────────────────
  printer.alignLeft();
  printer.println('No: ' + transaksi.nomor_transaksi);
  printer.println('Tgl: ' + new Date(transaksi.tanggal_masuk)
    .toLocaleString('id-ID', { timeZone: 'Asia/Makassar',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit' }));
  printer.println('Plg: ' + (transaksi.pelanggan_nama || 'Non-member'));
  if (transaksi.pelanggan_telepon) printer.println('WA : ' + transaksi.pelanggan_telepon);
  if (transaksi.kasir_nama) printer.println('Kasir: ' + transaksi.kasir_nama);
  printer.drawLine();

  // ── ITEM ──────────────────────────────────────────────────────
  printer.println('LAYANAN:');
  (transaksi.items || []).forEach(item => {
    const nama = String(item.nama_layanan || '').substring(0, LEBAR);
    printer.println(nama);
    const qty = `  ${item.jumlah} ${item.satuan || ''} x Rp${fmtRp(item.harga_satuan)}`;
    const sub = `Rp${fmtRp(item.subtotal)}`;
    printer.leftRight(qty, sub);
    if (item.catatan) printer.println('  *' + item.catatan);
  });
  printer.drawLine();

  // ── TOTAL ─────────────────────────────────────────────────────
  const adaDiskon = (transaksi.diskon || 0) > 0;
  if (adaDiskon) {
    printer.leftRight('Subtotal', 'Rp' + fmtRp(transaksi.total_harga));
    printer.leftRight('Diskon', '-Rp' + fmtRp(transaksi.diskon));
  }
  if (transaksi.antar_jemput) {
    printer.leftRight('Antar/Jemput', 'termasuk');
  }
  printer.bold(true);
  printer.leftRight('TOTAL BAYAR', 'Rp' + fmtRp(transaksi.total_bayar));
  printer.bold(false);
  printer.drawLine();

  // ── PEMBAYARAN ────────────────────────────────────────────────
  const lunas = (transaksi.bayar || 0) >= transaksi.total_bayar;
  const statusBayar = lunas ? 'LUNAS' : ((transaksi.bayar || 0) > 0 ? 'DP/CICILAN' : 'BELUM BAYAR');
  printer.println('Bayar : ' + (transaksi.metode_bayar || 'tunai').toUpperCase());
  printer.println('Status: ' + statusBayar);
  if (!lunas && (transaksi.bayar || 0) > 0) {
    printer.println('Dibayar : Rp' + fmtRp(transaksi.bayar));
    printer.println('Sisa    : Rp' + fmtRp(transaksi.total_bayar - transaksi.bayar));
  } else if (lunas) {
    printer.println('Dibayar : Rp' + fmtRp(transaksi.bayar));
    if ((transaksi.kembalian || 0) > 0) {
      printer.println('Kembali : Rp' + fmtRp(transaksi.kembalian));
    }
  }
  printer.drawLine();

  // ── ESTIMASI SELESAI ──────────────────────────────────────────
  if (transaksi.tanggal_selesai) {
    printer.println('Estimasi selesai:');
    printer.alignCenter();
    printer.bold(true);
    printer.println(new Date(transaksi.tanggal_selesai)
      .toLocaleString('id-ID', { timeZone: 'Asia/Makassar',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit' }));
    printer.bold(false);
    printer.alignLeft();
    printer.drawLine();
  }

  // ── POIN ──────────────────────────────────────────────────────
  if (poinEarned > 0) {
    printer.alignCenter();
    printer.println('+' + poinEarned + ' poin didapat');
    if (transaksi.pelanggan_poin != null) {
      printer.println('Total poin: ' + transaksi.pelanggan_poin);
    }
    printer.alignLeft();
    printer.drawLine();
  }

  // ── FOOTER ────────────────────────────────────────────────────
  printer.alignCenter();
  printer.println(pengaturan.footer_struk || 'Terima kasih!');
  printer.println('Tunjukkan struk saat ambil.');

  // XANTRI BT-58D TIDAK PUNYA AUTO CUTTER — gunakan feed untuk robekan rapi
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();

  await printer.execute();
  printer.clear();
}

async function cetakTest() {
  const port = PRINTER_PORT();
  if (!fs.existsSync(port)) throw new Error(`Device ${port} tidak ditemukan. Pastikan printer terhubung via USB.`);
  const printer = buatPrinter();
  const connected = await printer.isPrinterConnected();
  if (!connected) throw new Error('Printer tidak terhubung di ' + port);

  printer.alignCenter();
  printer.bold(true);
  printer.println('=== TEST PRINT ===');
  printer.bold(false);
  printer.println('Xantri BT-58D OK');
  printer.println('POS Laundry Ready');
  printer.drawLine();
  printer.println(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }));
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();

  await printer.execute();
  printer.clear();
}

module.exports = { cekPrinter, cetakStruk, cetakTest };
