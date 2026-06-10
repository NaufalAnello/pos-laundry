/* ════════════════════════════════════════════════════════════
   POS Laundry — Universal Bottom Sheet "Lunasi"
   Pakai: window.openLunasiSheet({ id, nomor, nama, total, dibayar, pelanggan_id })
   Lalu listen window.addEventListener('lunasi:done', e => { ... })
   ════════════════════════════════════════════════════════════ */
(function () {
  if (window.__lunasiSheetLoaded) return;
  window.__lunasiSheetLoaded = true;

  const fmtRp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

  /* ── Inject styles ─────────────────────────────────────── */
  const css = `
.ls-overlay {
  display:none; position:fixed; inset:0; background:rgba(0,0,0,.45);
  z-index:9000;
}
.ls-overlay.open { display:block; }
.ls-sheet {
  position:fixed; left:0; right:0; bottom:0;
  background:#fff; border-radius:18px 18px 0 0;
  z-index:9001; max-height:92vh; overflow-y:auto;
  transform:translateY(100%); transition:transform .25s cubic-bezier(.4,0,.2,1);
  padding-bottom:env(safe-area-inset-bottom, 12px);
  box-shadow:0 -6px 24px rgba(0,0,0,.18);
}
.ls-sheet.open { transform:none; }
.ls-handle { width:40px; height:4px; background:#cbd5e1; border-radius:99px; margin:10px auto 6px; }
.ls-head {
  padding:6px 18px 12px; border-bottom:1px solid #e2e8f0;
}
.ls-title { font-size:16px; font-weight:800; color:#111827; display:flex; align-items:center; gap:8px; }
.ls-sub { font-size:12px; color:#64748b; margin-top:4px; }
.ls-body { padding:14px 18px; display:flex; flex-direction:column; gap:14px; }
.ls-total-card {
  background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px;
  padding:12px 14px; display:flex; justify-content:space-between; align-items:center;
}
.ls-total-card .lbl { font-size:12px; color:#374151; font-weight:600; }
.ls-total-card .amt { font-size:20px; font-weight:800; color:#2563eb; }
.ls-row { display:flex; flex-direction:column; gap:6px; }
.ls-row label { font-size:12px; font-weight:700; color:#374151; }
.ls-methods {
  display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;
}
.ls-method-btn {
  padding:12px 8px; border:2px solid #e2e8f0; border-radius:10px;
  background:#fff; cursor:pointer; font-size:13px; font-weight:700;
  color:#374151; transition:all .15s; display:flex; flex-direction:column;
  align-items:center; gap:4px; min-height:60px; justify-content:center;
}
.ls-method-btn .ic { font-size:20px; }
.ls-method-btn.active { border-color:#2563eb; background:#eff6ff; color:#2563eb; }
.ls-method-btn:disabled { opacity:.45; cursor:not-allowed; }
.ls-method-btn .saldo { font-size:10px; font-weight:600; color:#64748b; margin-top:2px; }
.ls-method-btn.active .saldo { color:#2563eb; }
.ls-input {
  width:100%; padding:12px 14px; font-size:18px; font-weight:700;
  border:2px solid #e2e8f0; border-radius:10px; outline:none;
  text-align:right;
}
.ls-input:focus { border-color:#2563eb; }
.ls-quick-noms { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.ls-quick-noms button {
  padding:7px 12px; border:1px solid #e2e8f0; border-radius:99px;
  background:#fff; font-size:12px; font-weight:700; cursor:pointer;
  color:#374151;
}
.ls-quick-noms button:hover { background:#f1f5f9; }
.ls-info {
  display:flex; justify-content:space-between;
  font-size:13px; padding:4px 0;
}
.ls-info .v { font-weight:700; }
.ls-info.kembalian .v { color:#16a34a; }
.ls-info.kurang .v { color:#dc2626; }
.ls-checkbox-row {
  display:flex; align-items:center; gap:8px; font-size:13px; color:#374151;
  padding:8px 10px; background:#f8fafc; border-radius:8px;
}
.ls-checkbox-row input { width:18px; height:18px; }
.ls-foot {
  padding:12px 18px 18px;
  border-top:1px solid #e2e8f0;
  position:sticky; bottom:0; background:#fff;
}
.ls-btn-submit {
  width:100%; padding:14px; border:none; border-radius:10px;
  background:#16a34a; color:#fff; font-size:15px; font-weight:800;
  cursor:pointer; min-height:48px;
}
.ls-btn-submit:disabled { opacity:.5; cursor:not-allowed; }
.ls-btn-submit:hover:not(:disabled) { background:#15803d; }
.ls-err {
  padding:10px 12px; background:#fef2f2; border:1px solid #fecaca;
  color:#dc2626; border-radius:8px; font-size:12px; font-weight:600;
}
@media (max-width: 480px) {
  .ls-methods { grid-template-columns:repeat(2, 1fr); }
  .ls-method-btn { font-size:12px; }
}
`;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Inject markup ─────────────────────────────────────── */
  const html = `
<div class="ls-overlay" id="lsOverlay" onclick="closeLunasiSheet()"></div>
<div class="ls-sheet" id="lsSheet">
  <div class="ls-handle"></div>
  <div class="ls-head">
    <div class="ls-title">💰 <span>Lunasi Pembayaran</span></div>
    <div class="ls-sub" id="lsSub">—</div>
  </div>
  <div class="ls-body">
    <div class="ls-total-card">
      <span class="lbl">Sisa Tagihan</span>
      <span class="amt" id="lsSisa">Rp 0</span>
    </div>

    <div class="ls-row">
      <label>Metode Pembayaran</label>
      <div class="ls-methods" id="lsMethods">
        <button type="button" class="ls-method-btn active" data-method="tunai"><span class="ic">💵</span>Tunai</button>
        <button type="button" class="ls-method-btn" data-method="transfer"><span class="ic">🏦</span>Transfer</button>
        <button type="button" class="ls-method-btn" data-method="qris"><span class="ic">📱</span>QRIS</button>
        <button type="button" class="ls-method-btn" data-method="deposit" id="lsBtnDeposit">
          <span class="ic">💳</span>Deposit
          <span class="saldo" id="lsDepositSaldo">—</span>
        </button>
      </div>
    </div>

    <div class="ls-row" id="lsRowNominal">
      <label>Nominal Diterima</label>
      <input type="number" inputmode="numeric" class="ls-input" id="lsNominal" placeholder="0" min="0"/>
      <div class="ls-quick-noms" id="lsQuickNoms"></div>
    </div>

    <div class="ls-info" id="lsKembalianRow" style="display:none">
      <span>Kembalian</span>
      <span class="v" id="lsKembalian">Rp 0</span>
    </div>
    <div class="ls-info kurang" id="lsKurangRow" style="display:none">
      <span>Kurang Bayar (jadi cicilan)</span>
      <span class="v" id="lsKurang">Rp 0</span>
    </div>

    <div class="ls-checkbox-row" id="lsRowDeposit" style="display:none">
      <input type="checkbox" id="lsKelebihanDeposit"/>
      <label for="lsKelebihanDeposit">Simpan kelebihan ke deposit pelanggan</label>
    </div>

    <div class="ls-err" id="lsErr" style="display:none"></div>
  </div>
  <div class="ls-foot">
    <button class="ls-btn-submit" id="lsBtnSubmit">Simpan Pelunasan</button>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  /* ── State ─────────────────────────────────────────────── */
  let ctx = null; // { id, nomor, nama, total, dibayar, pelanggan_id }
  let metode = 'tunai';
  let depositSaldo = 0;

  const $ = id => document.getElementById(id);

  function updateKembalian() {
    if (!ctx) return;
    const sisa = Math.max(0, Number(ctx.total) - Number(ctx.dibayar || 0));
    const nominal = Number($('lsNominal').value) || 0;
    const kembalian = nominal - sisa;

    $('lsKembalianRow').style.display = (kembalian > 0 && metode !== 'deposit') ? '' : 'none';
    $('lsKurangRow').style.display = (nominal > 0 && nominal < sisa) ? '' : 'none';

    if (kembalian > 0) $('lsKembalian').textContent = fmtRp(kembalian);
    if (nominal > 0 && nominal < sisa) $('lsKurang').textContent = fmtRp(sisa - nominal);

    // Tampilkan opsi simpan kelebihan ke deposit jika ada pelanggan & kembalian > 0
    const showDep = kembalian > 0 && ctx.pelanggan_id && metode !== 'deposit';
    $('lsRowDeposit').style.display = showDep ? '' : 'none';
  }

  function selectMethod(m) {
    metode = m;
    document.querySelectorAll('#lsMethods .ls-method-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.method === m);
    });
    // Untuk deposit: auto-fill nominal = sisa, sembunyikan quick noms
    if (m === 'deposit') {
      const sisa = Math.max(0, Number(ctx.total) - Number(ctx.dibayar || 0));
      $('lsNominal').value = sisa;
      $('lsNominal').disabled = true;
      $('lsQuickNoms').style.display = 'none';
    } else {
      $('lsNominal').disabled = false;
      $('lsQuickNoms').style.display = '';
    }
    updateKembalian();
  }

  function renderQuickNoms(sisa) {
    const noms = [
      sisa,
      Math.ceil(sisa / 1000) * 1000,
      Math.ceil(sisa / 5000) * 5000,
      Math.ceil(sisa / 10000) * 10000,
      Math.ceil(sisa / 50000) * 50000,
      Math.ceil(sisa / 100000) * 100000,
    ];
    const uniq = [...new Set(noms.filter(n => n > 0))].sort((a, b) => a - b).slice(0, 5);
    $('lsQuickNoms').innerHTML = uniq.map(n =>
      `<button type="button" onclick="document.getElementById('lsNominal').value=${n};document.getElementById('lsNominal').dispatchEvent(new Event('input'))">${fmtRp(n)}</button>`
    ).join('');
  }

  async function fetchDepositSaldo(pelangganId) {
    if (!pelangganId) {
      depositSaldo = 0;
      $('lsBtnDeposit').disabled = true;
      $('lsDepositSaldo').textContent = '—';
      return;
    }
    try {
      const r = await fetch(`/api/v1/deposit/${pelangganId}`, { credentials: 'include' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      depositSaldo = Number(d?.data?.saldo || 0);
      $('lsDepositSaldo').textContent = fmtRp(depositSaldo);
      const sisa = Math.max(0, Number(ctx.total) - Number(ctx.dibayar || 0));
      $('lsBtnDeposit').disabled = depositSaldo < sisa;
    } catch {
      depositSaldo = 0;
      $('lsBtnDeposit').disabled = true;
      $('lsDepositSaldo').textContent = '—';
    }
  }

  /* ── Open / close ─────────────────────────────────────── */
  window.openLunasiSheet = (data) => {
    ctx = Object.assign({ dibayar: 0 }, data);
    const sisa = Math.max(0, Number(ctx.total) - Number(ctx.dibayar || 0));
    if (sisa <= 0) {
      alert('Order sudah lunas');
      return;
    }
    $('lsSub').textContent = `${ctx.nama || 'Non-member'} · ${ctx.nomor}`;
    $('lsSisa').textContent = fmtRp(sisa);
    $('lsNominal').value = sisa;
    $('lsNominal').disabled = false;
    $('lsQuickNoms').style.display = '';
    $('lsErr').style.display = 'none';
    $('lsKelebihanDeposit').checked = false;
    metode = 'tunai';
    document.querySelectorAll('#lsMethods .ls-method-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.method === 'tunai');
    });
    renderQuickNoms(sisa);
    fetchDepositSaldo(ctx.pelanggan_id);
    updateKembalian();

    $('lsOverlay').classList.add('open');
    $('lsSheet').classList.add('open');
  };

  window.closeLunasiSheet = () => {
    $('lsOverlay').classList.remove('open');
    $('lsSheet').classList.remove('open');
  };

  /* ── Submit ───────────────────────────────────────────── */
  async function submitLunasi() {
    if (!ctx) return;
    const nominal = Number($('lsNominal').value) || 0;
    if (nominal <= 0) {
      $('lsErr').textContent = 'Nominal harus lebih dari 0';
      $('lsErr').style.display = '';
      return;
    }
    const btn = $('lsBtnSubmit');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
    $('lsErr').style.display = 'none';
    try {
      const r = await fetch(`/api/v1/transaksi/${ctx.id}/lunasi`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metode_bayar: metode,
          nominal_diterima: nominal,
          kelebihan_ke_deposit: $('lsKelebihanDeposit').checked
        })
      });
      const d = await r.json();
      if (!r.ok) {
        $('lsErr').textContent = d.error || 'Gagal memproses pelunasan';
        $('lsErr').style.display = '';
        return;
      }
      window.dispatchEvent(new CustomEvent('lunasi:done', { detail: { id: ctx.id, result: d } }));
      if (typeof window.posRefreshBadges === 'function') window.posRefreshBadges();
      closeLunasiSheet();
    } catch {
      $('lsErr').textContent = 'Koneksi gagal';
      $('lsErr').style.display = '';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan Pelunasan';
    }
  }

  /* ── Hooks ─────────────────────────────────────────────── */
  $('lsNominal').addEventListener('input', updateKembalian);
  $('lsBtnSubmit').addEventListener('click', submitLunasi);
  document.querySelectorAll('#lsMethods .ls-method-btn').forEach(b => {
    b.addEventListener('click', () => selectMethod(b.dataset.method));
  });
})();
