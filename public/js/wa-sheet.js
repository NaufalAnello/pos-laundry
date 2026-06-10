/* ════════════════════════════════════════════════════════════
   POS Laundry — Universal Bottom Sheet "Kirim WA"
   Pakai: window.openWaSheet({ id, nomor, nama, telepon })
   Bisa dipanggil dari halaman manapun.
   ════════════════════════════════════════════════════════════ */
(function () {
  if (window.__waSheetLoaded) return;
  window.__waSheetLoaded = true;

  /* ── Inject styles ─────────────────────────────────────── */
  const css = `
.ws-overlay {
  display:none; position:fixed; inset:0; background:rgba(0,0,0,.45);
  z-index:9000;
}
.ws-overlay.open { display:block; }
.ws-sheet {
  position:fixed; left:0; right:0; bottom:0;
  background:#fff; border-radius:18px 18px 0 0;
  z-index:9001; max-height:92vh; overflow-y:auto;
  transform:translateY(100%); transition:transform .25s cubic-bezier(.4,0,.2,1);
  padding-bottom:env(safe-area-inset-bottom, 12px);
  box-shadow:0 -6px 24px rgba(0,0,0,.18);
}
.ws-sheet.open { transform:none; }
.ws-handle { width:40px; height:4px; background:#cbd5e1; border-radius:99px; margin:10px auto 6px; }
.ws-head { padding:6px 18px 12px; border-bottom:1px solid #e2e8f0; }
.ws-title { font-size:16px; font-weight:800; color:#111827; display:flex; align-items:center; gap:8px; }
.ws-sub { font-size:12px; color:#64748b; margin-top:4px; }
.ws-body { padding:14px 18px; display:flex; flex-direction:column; gap:12px; }

.ws-toggle-row {
  display:flex; gap:6px; padding:4px; background:#f1f5f9; border-radius:10px;
}
.ws-toggle-btn {
  flex:1; padding:8px 10px; border:none; background:transparent; cursor:pointer;
  font-size:12px; font-weight:700; color:#64748b; border-radius:7px; transition:all .15s;
  font-family:inherit;
}
.ws-toggle-btn.active { background:#fff; color:#16a34a; box-shadow:0 1px 3px rgba(0,0,0,.08); }

.ws-options { display:flex; flex-direction:column; gap:8px; }
.ws-opt {
  display:flex; align-items:center; gap:12px; padding:14px;
  border:1.5px solid #e2e8f0; border-radius:10px; background:#fff;
  cursor:pointer; transition:all .15s; width:100%; text-align:left;
  font-family:inherit;
}
.ws-opt:hover { background:#f8fafc; border-color:#25d366; }
.ws-opt .ic {
  width:42px; height:42px; border-radius:10px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center; font-size:22px;
}
.ws-opt.nota .ic    { background:#eff6ff; color:#2563eb; }
.ws-opt.tagihan .ic { background:#fef2f2; color:#dc2626; }
.ws-opt.notif .ic   { background:#f0fdf4; color:#16a34a; }
.ws-opt .txt { flex:1; min-width:0; }
.ws-opt .txt .lbl { font-size:14px; font-weight:700; color:#111827; }
.ws-opt .txt .desc { font-size:11px; color:#64748b; margin-top:2px; }
.ws-opt .arrow { color:#94a3b8; font-size:18px; }

.ws-err {
  padding:10px 12px; background:#fef2f2; border:1px solid #fecaca;
  color:#dc2626; border-radius:8px; font-size:12px; font-weight:600;
  display:none;
}

@media (min-width: 768px) {
  .ws-sheet {
    left:50%; right:auto; top:50%; bottom:auto;
    width:440px; max-height:85vh;
    border-radius:16px;
    transform:translate(-50%, -45%) scale(.96); opacity:0;
    transition:transform .2s, opacity .2s;
  }
  .ws-sheet.open { transform:translate(-50%,-50%) scale(1); opacity:1; }
  .ws-handle { display:none; }
}
`;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Inject markup ─────────────────────────────────────── */
  const html = `
<div class="ws-overlay" id="wsOverlay" onclick="closeWaSheet()"></div>
<div class="ws-sheet" id="wsSheet">
  <div class="ws-handle"></div>
  <div class="ws-head">
    <div class="ws-title">💬 <span>Kirim WhatsApp</span></div>
    <div class="ws-sub" id="wsSub">—</div>
  </div>
  <div class="ws-body">
    <div class="ws-toggle-row">
      <button type="button" class="ws-toggle-btn active" data-mode="wa" id="wsBtnWa">📱 WA Biasa</button>
      <button type="button" class="ws-toggle-btn" data-mode="wabiz" id="wsBtnBiz">💼 WA Business</button>
    </div>
    <div class="ws-options">
      <button type="button" class="ws-opt nota" data-type="nota">
        <span class="ic">🧾</span>
        <span class="txt">
          <span class="lbl">Kirim Nota Order</span>
          <span class="desc">Detail layanan + total tagihan</span>
        </span>
        <span class="arrow">›</span>
      </button>
      <button type="button" class="ws-opt tagihan" data-type="tagihan">
        <span class="ic">💰</span>
        <span class="txt">
          <span class="lbl">Tagih Pembayaran</span>
          <span class="desc">Pengingat pelunasan</span>
        </span>
        <span class="arrow">›</span>
      </button>
      <button type="button" class="ws-opt notif" data-type="notif">
        <span class="ic">✅</span>
        <span class="txt">
          <span class="lbl">Siap Diambil</span>
          <span class="desc">Notif laundry sudah selesai</span>
        </span>
        <span class="arrow">›</span>
      </button>
    </div>
    <div class="ws-err" id="wsErr"></div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  /* ── State ─────────────────────────────────────────────── */
  let ctx = null;
  let mode = 'wa'; // 'wa' atau 'wabiz'
  const $ = id => document.getElementById(id);

  /* ── Open / close ─────────────────────────────────────── */
  window.openWaSheet = (data) => {
    ctx = Object.assign({}, data);
    if (!ctx.telepon) {
      alert('Pelanggan ini tidak punya nomor telepon');
      return;
    }
    $('wsSub').textContent = `${ctx.nama || 'Non-member'} · ${ctx.telepon}`;
    $('wsErr').style.display = 'none';
    mode = 'wa';
    $('wsBtnWa').classList.add('active');
    $('wsBtnBiz').classList.remove('active');

    $('wsOverlay').classList.add('open');
    $('wsSheet').classList.add('open');
  };

  window.closeWaSheet = () => {
    $('wsOverlay').classList.remove('open');
    $('wsSheet').classList.remove('open');
  };

  /* ── Mode toggle ──────────────────────────────────────── */
  document.querySelectorAll('#wsSheet .ws-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      document.querySelectorAll('#wsSheet .ws-toggle-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
    });
  });

  /* ── Send ─────────────────────────────────────────────── */
  async function sendWa(type) {
    if (!ctx) return;
    const errEl = $('wsErr');
    errEl.style.display = 'none';
    try {
      const r = await fetch(`/api/v1/transaksi/${ctx.id}/wa/${type}`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) {
        errEl.textContent = 'Gagal: ' + (d.error || 'Tidak diketahui');
        errEl.style.display = '';
        return;
      }
      // Buka URL — pakai api.whatsapp.com (biasa) atau wa.me/business
      // d.url biasanya https://wa.me/...?text=... — bisa dipakai untuk keduanya
      // Tapi untuk WA Business, kita coba pakai whatsapp://send
      let url = d.url;
      if (mode === 'wabiz') {
        // WA Business pakai protokol khusus. Banyak HP membuka WA default jika ini gagal.
        // Coba pakai whatsapp:// — kalau tidak ada, fallback ke wa.me
        url = url.replace('https://wa.me/', 'whatsapp://send?phone=')
                 .replace('https://api.whatsapp.com/send?phone=', 'whatsapp://send?phone=')
                 .replace('?text=', '&text=');
      }
      window.open(url, '_blank');

      // Log WA
      fetch('/api/v1/wa/log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telepon: d.telepon,
          pesan: d.teks,
          transaksi_id: ctx.id,
          status: 'terkirim'
        })
      }).catch(() => {});

      closeWaSheet();
      if (typeof window.showToast === 'function') {
        window.showToast('💬 WA dibuka');
      }
    } catch (e) {
      errEl.textContent = 'Koneksi gagal';
      errEl.style.display = '';
    }
  }

  document.querySelectorAll('#wsSheet .ws-opt').forEach(b => {
    b.addEventListener('click', () => sendWa(b.dataset.type));
  });
})();
