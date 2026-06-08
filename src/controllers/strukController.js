const transaksiModel = require('../models/transaksiModel');
const depositModel   = require('../models/deposit.model');
const { getSettings, getPoinEarned, fmtRp, fmtDate } = require('../services/wa.service');

const WIDTH_MAP = { '58mm': '58mm', '80mm': '80mm', 'A5': '148mm' };

// ── GET /api/v1/transaksi/:id/struk ─────────────────────────────────────────
exports.show = async (req, res) => {
  try {
    const t = await transaksiModel.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    // Ambil info mutasi deposit untuk transaksi ini (jika ada)
    const depositMutasi = t.pelanggan_id
      ? await require('../database/connection')('mutasi_deposit')
          .where({ transaksi_id: t.id })
          .orderBy('id', 'asc')
          .select('jenis', 'nominal', 'saldo_sebelum', 'saldo_sesudah')
      : [];

    const [s, poinEarned] = await Promise.all([
      getSettings(),
      getPoinEarned(t.id)
    ]);

    const lebar = WIDTH_MAP[req.query.lebar] ? req.query.lebar : (s.struk_lebar || '80mm');
    const width = WIDTH_MAP[lebar] || '80mm';
    const isNarrow = lebar === '58mm';
    const fs  = isNarrow ? '10px' : '12px';
    const fsH = isNarrow ? '12px' : '14px';

    const divider = isNarrow
      ? '─'.repeat(30)
      : '─'.repeat(40);

    const itemsRows = (t.items || []).map((it, i) => {
      let row = `
      <tr class="item-row">
        <td>${i + 1}. ${escHtml(it.nama_layanan)}</td>
        <td class="num">${it.jumlah}&nbsp;${escHtml(it.satuan || '')}</td>
        <td class="num">Rp&nbsp;${fmtRp(it.harga_satuan)}</td>
        <td class="num">Rp&nbsp;${fmtRp(it.subtotal)}</td>
      </tr>`;

      // Tambahkan rincian item jika ada
      if (it.rincian && it.rincian.length > 0) {
        const rincianRows = it.rincian.map(r => `
      <tr class="rincian-row">
        <td colspan="4" style="padding-left:16px;font-size:${isNarrow ? '8px' : '10px'};color:#555;">
          - ${escHtml(r.nama_item)} ${r.jumlah} ${escHtml(r.satuan)}
        </td>
      </tr>`).join('');
        row += rincianRows;
      }

      return row;
    }).join('');

    const biayaTambahanRows = (t.biaya_tambahan || []).map((bt) => `
      <tr class="item-row">
        <td colspan="3">+ ${escHtml(bt.keterangan)}</td>
        <td class="num">Rp&nbsp;${fmtRp(bt.nominal)}</td>
      </tr>`).join('');

    const adaDiskon   = (t.diskon || 0) > 0;
    const adaPoin     = (t.poin_digunakan || 0) > 0;
    const adaWa       = t.kirim_wa;
    const lunas       = (t.bayar || 0) >= t.total_bayar;
    const isDeposit   = t.metode_bayar === 'deposit';
    const mutasiBayar = depositMutasi.find(m => m.jenis === 'bayar');
    const mutasiKeleb = depositMutasi.find(m => m.jenis === 'kelebihan');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Struk ${escHtml(t.nomor_transaksi)}</title>
<style>
  @page { size: ${width} auto; margin: 4mm; }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fs};
    width: ${width};
    max-width: 100%;
    background: #fff;
    color: #111;
    padding: 6px 4px;
  }

  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .divider { border: none; border-top: 1px dashed #555; margin: 5px 0; }
  .divider-solid { border: none; border-top: 1px solid #000; margin: 5px 0; }

  .header h1 { font-size: ${fsH}; font-weight: bold; letter-spacing: 1px; }
  .header p  { font-size: ${isNarrow ? '8px' : '10px'}; line-height: 1.4; }

  .meta-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .meta-table td { vertical-align: top; padding: 1px 0; font-size: ${fs}; }
  .meta-table .lbl { white-space: nowrap; padding-right: 4px; }
  .meta-table .val { word-break: break-all; }

  .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .items-table th {
    font-size: ${isNarrow ? '8px' : '10px'};
    text-align: left; border-bottom: 1px solid #555;
    padding: 2px 0;
  }
  .items-table th.num, .items-table td.num { text-align: right; }
  .item-row td { padding: 2px 0; vertical-align: top; font-size: ${isNarrow ? '9px' : '11px'}; }
  .item-row td:first-child { padding-right: 4px; }

  .totals-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .totals-table td { padding: 2px 0; font-size: ${fs}; }
  .totals-table .lbl { padding-right: 6px; }
  .totals-table .amt { text-align: right; white-space: nowrap; }
  .totals-table .grand td { font-size: ${fsH}; font-weight: bold;
    border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; }

  .poin-box {
    border: 1px dashed #555; border-radius: 3px;
    padding: 4px 6px; margin: 4px 0; text-align: center;
    font-size: ${isNarrow ? '9px' : '11px'};
  }

  .status-badge {
    display: inline-block; padding: 1px 8px;
    border-radius: 3px; font-size: ${isNarrow ? '8px' : '10px'};
    font-weight: bold; text-transform: uppercase; letter-spacing: .5px;
  }
  .status-pending  { border: 1px solid #d97706; color: #d97706; }
  .status-proses   { border: 1px solid #2563eb; color: #2563eb; }
  .status-selesai  { border: 1px solid #16a34a; color: #16a34a; }
  .status-diambil  { border: 1px solid #9ca3af; color: #9ca3af; }
  .status-dibatalkan { border: 1px solid #dc2626; color: #dc2626; }

  .footer { text-align: center; font-size: ${isNarrow ? '8px' : '10px'};
            line-height: 1.5; margin-top: 6px; }

  /* ── Print-only overrides ── */
  @media print {
    .no-print { display: none !important; }
    body { padding: 0; }
    html, body { height: auto; }
  }

  /* ── Screen-only (preview) ── */
  @media screen {
    body { margin: 16px auto; box-shadow: 0 4px 20px rgba(0,0,0,.15);
           padding: 12px 10px; border-radius: 4px; }
    .print-bar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #1e40af; color: #fff; padding: 8px 16px;
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      font-family: sans-serif; font-size: 14px; z-index: 99;
      min-height: 52px;
    }
    .print-bar button {
      padding: 6px 14px; border: none; border-radius: 6px;
      background: #fff; color: #1e40af; font-weight: 700;
      cursor: pointer; font-size: 13px; transition: opacity .15s;
    }
    .print-bar button:hover:not(:disabled) { opacity: .85; }
    .print-bar button:disabled { opacity: .45; cursor: not-allowed; }
    .print-bar .sel-lebar { padding: 5px 10px; border-radius: 6px; border: none;
                             font-size: 13px; cursor: pointer; }
    .btn-thermal {
      background: #16a34a !important; color: #fff !important;
      display: flex; align-items: center; gap: 5px;
    }
    .btn-browser {
      background: #64748b !important; color: #fff !important;
    }
    .printer-dot {
      width: 9px; height: 9px; border-radius: 50%;
      display: inline-block; flex-shrink: 0;
      background: #6b7280;
    }
    .printer-dot.on  { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
    .printer-dot.off { background: #f87171; }
    .printer-status  { display: flex; align-items: center; gap: 5px;
                       font-size: 12px; opacity: .85; }
    body { margin-top: 60px !important; }
  }
</style>
</head>
<body>

<!-- Print toolbar (screen only) -->
<div class="print-bar no-print">
  <span style="font-weight:700">🧾 ${escHtml(t.nomor_transaksi)}</span>
  <div class="printer-status">
    <span class="printer-dot" id="printerDot"></span>
    <span id="printerStatusTxt">Cek printer...</span>
  </div>
  <button class="btn-thermal" id="btnThermal" onclick="printThermal()" disabled>
    🖨️ Print Thermal
  </button>
  <select class="sel-lebar" onchange="setWidth(this.value)">
    <option value="58mm" ${lebar === '58mm' ? 'selected' : ''}>58mm</option>
    <option value="80mm" ${lebar === '80mm' ? 'selected' : ''}>80mm</option>
    <option value="A5"   ${lebar === 'A5'   ? 'selected' : ''}>A5</option>
  </select>
  <button class="btn-browser" onclick="window.print()">🖥️ Print Browser</button>
  <button onclick="window.close()" style="background:#fee2e2;color:#b91c1c;margin-left:auto">✕ Tutup</button>
</div>

<!-- ════ STRUK CONTENT ════ -->

<div class="header center">
  <h1>${escHtml(s.nama_toko || 'LAUNDRY')}</h1>
  <p>${escHtml(s.alamat_toko || '')}</p>
  ${s.telepon_toko ? `<p>Telp: ${escHtml(s.telepon_toko)}</p>` : ''}
</div>

<hr class="divider-solid"/>

<table class="meta-table">
  <tr><td class="lbl">No. Order</td><td>:</td><td class="val bold">${escHtml(t.nomor_transaksi)}</td></tr>
  <tr><td class="lbl">Tanggal</td><td>:</td><td class="val">${fmtDate(t.tanggal_masuk)}</td></tr>
  <tr><td class="lbl">Kasir</td><td>:</td><td class="val">${escHtml(t.kasir_nama || '—')}</td></tr>
  <tr><td class="lbl">Status</td><td>:</td>
    <td><span class="status-badge status-${t.status}">${t.status}</span></td>
  </tr>
</table>

${t.pelanggan_nama ? `
<hr class="divider"/>
<table class="meta-table">
  <tr><td class="lbl">Pelanggan</td><td>:</td><td class="val">${escHtml(t.pelanggan_nama)}</td></tr>
  ${t.pelanggan_telepon ? `<tr><td class="lbl">Telepon</td><td>:</td><td class="val">${escHtml(t.pelanggan_telepon)}</td></tr>` : ''}
</table>` : ''}

<hr class="divider-solid"/>

<table class="items-table">
  <thead>
    <tr>
      <th>Layanan</th>
      <th class="num">Qty</th>
      <th class="num">Harga</th>
      <th class="num">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${itemsRows}
    ${(t.biaya_tambahan && t.biaya_tambahan.length > 0) ? `<tr><td colspan="4"><hr class="divider"/></td></tr>${biayaTambahanRows}` : ''}
  </tbody>
</table>

<hr class="divider-solid"/>

<table class="totals-table">
  <tr>
    <td class="lbl">Subtotal</td>
    <td class="amt">Rp ${fmtRp(t.total_harga)}</td>
  </tr>
  ${adaDiskon ? `<tr>
    <td class="lbl">Diskon${t.promo_nama ? ' (' + escHtml(t.promo_nama) + ')' : (t.diskon_tipe === 'persen' && t.diskon_persen > 0) ? ` (${t.diskon_persen}%)` : ''}</td>
    <td class="amt">- Rp ${fmtRp(t.diskon)}</td>
  </tr>` : ''}
  ${adaPoin ? `<tr>
    <td class="lbl">Diskon Poin (${t.poin_digunakan} poin)</td>
    <td class="amt">- Rp ${fmtRp(t.poin_digunakan * (parseInt(s.nilai_tukar_poin) || 100))}</td>
  </tr>` : ''}
  <tr class="grand">
    <td class="lbl">TOTAL BAYAR</td>
    <td class="amt">Rp ${fmtRp(t.total_bayar)}</td>
  </tr>
  ${isDeposit && mutasiBayar ? `
  <tr>
    <td class="lbl">Metode Bayar</td>
    <td class="amt">DEPOSIT</td>
  </tr>
  <tr>
    <td class="lbl">Saldo Sebelum</td>
    <td class="amt">Rp ${fmtRp(mutasiBayar.saldo_sebelum)}</td>
  </tr>
  <tr>
    <td class="lbl">Dipotong</td>
    <td class="amt">- Rp ${fmtRp(mutasiBayar.nominal)}</td>
  </tr>
  <tr>
    <td class="lbl bold">Saldo Sesudah</td>
    <td class="amt bold">Rp ${fmtRp(mutasiBayar.saldo_sesudah)}</td>
  </tr>` : `
  <tr>
    <td class="lbl">Bayar (${escHtml(t.metode_bayar || 'tunai')})</td>
    <td class="amt">Rp ${fmtRp(t.bayar)}</td>
  </tr>
  ${mutasiKeleb ? `
  <tr>
    <td class="lbl">+Deposit</td>
    <td class="amt">Rp ${fmtRp(mutasiKeleb.nominal)}</td>
  </tr>
  <tr>
    <td class="lbl">Saldo Deposit</td>
    <td class="amt bold">Rp ${fmtRp(mutasiKeleb.saldo_sesudah)}</td>
  </tr>` : `
  <tr>
    <td class="lbl">Kembalian</td>
    <td class="amt bold">Rp ${fmtRp(t.kembalian)}</td>
  </tr>`}
  `}
</table>

<hr class="divider"/>

<table class="meta-table">
  <tr>
    <td class="lbl">Est. Selesai</td>
    <td>:</td>
    <td class="val bold">${fmtDate(t.tanggal_selesai)}</td>
  </tr>
  ${t.antar_jemput ? `<tr><td class="lbl">Antar/Jemput</td><td>:</td><td class="val">✓ Ya</td></tr>` : ''}
  ${t.alamat_jemput ? `<tr><td class="lbl">Alamat</td><td>:</td><td class="val">${escHtml(t.alamat_jemput)}</td></tr>` : ''}
</table>

${poinEarned > 0 || t.pelanggan_nama ? `
<hr class="divider"/>
<div class="poin-box">
  <span class="bold">⭐ Poin Loyalty</span><br/>
  Poin didapat  : +${poinEarned} poin<br/>
  Total poin   : ${t.pelanggan_poin ?? '—'} poin
</div>` : ''}

<hr class="divider"/>

<div class="footer">
  <p>${escHtml(s.footer_struk || 'Terima kasih telah menggunakan layanan kami!')}</p>
  <p style="margin-top:4px">Dicetak: ${new Date().toLocaleString('id-ID')}</p>
</div>

<script>
  const TX_ID = ${t.id};

  // ── Lebar kertas ──────────────────────────────────────────────
  function setWidth(v) {
    const url = new URL(window.location.href);
    url.searchParams.set('lebar', v);
    window.location.href = url.toString();
  }

  // ── Status printer ────────────────────────────────────────────
  async function cekStatusPrinter() {
    try {
      const r   = await fetch('/api/v1/printer/status', { credentials: 'include' });
      const d   = await r.json();
      const dot = document.getElementById('printerDot');
      const txt = document.getElementById('printerStatusTxt');
      const btn = document.getElementById('btnThermal');
      if (d.connected) {
        dot.className = 'printer-dot on';
        txt.textContent = 'Printer terhubung';
        btn.disabled = false;
      } else {
        dot.className = 'printer-dot off';
        txt.textContent = 'Printer tidak terhubung';
        btn.disabled = true;
      }
    } catch {
      document.getElementById('printerDot').className = 'printer-dot off';
      document.getElementById('printerStatusTxt').textContent = 'Gagal cek printer';
    }
  }

  // ── Print Thermal ─────────────────────────────────────────────
  async function printThermal() {
    const btn = document.getElementById('btnThermal');
    btn.disabled = true;
    btn.textContent = '⏳ Mencetak...';
    try {
      const r = await fetch('/api/v1/transaksi/' + TX_ID + '/print', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const d = await r.json();
      if (d.success) {
        showToast('✓ Struk berhasil dicetak!', '#16a34a');
      } else {
        showToast('Gagal: ' + (d.error || 'Error tidak diketahui'), '#dc2626');
      }
    } catch (e) {
      showToast('Koneksi gagal: ' + e.message, '#dc2626');
    } finally {
      btn.textContent = '🖨️ Print Thermal';
      cekStatusPrinter();
    }
  }

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(msg, bg = '#1e293b') {
    const t = document.getElementById('struToast');
    t.textContent = msg;
    t.style.background = bg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(60px)';
    }, 3500);
  }

  // ── Init ──────────────────────────────────────────────────────
  cekStatusPrinter();
  setInterval(cekStatusPrinter, 10000);

  // Auto print browser jika ada ?print=1
  if (new URLSearchParams(window.location.search).get('print') === '1') {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  }
</script>

<!-- Toast (screen only) -->
<div id="struToast" class="no-print" style="
  position:fixed; bottom:20px; left:50%;
  transform:translateX(-50%) translateY(60px);
  background:#1e293b; color:#fff; padding:10px 20px;
  border-radius:8px; font-family:sans-serif; font-size:14px;
  font-weight:600; z-index:999; opacity:0;
  transition:opacity .3s, transform .3s; white-space:nowrap;
"></div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[struk:show]', err);
    res.status(500).json({ error: 'Gagal generate struk' });
  }
};

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
