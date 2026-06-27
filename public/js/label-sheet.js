// ── Label Sheet: pilih layanan yang mau dicetak ─────────────────────────────
(function() {
  // Inject CSS sekali saja
  if (!document.getElementById('label-sheet-css')) {
    const s = document.createElement('style');
    s.id = 'label-sheet-css';
    s.textContent = `
      .bs-overlay {
        display: none;
        position: fixed; inset: 0;
        background: rgba(0,0,0,.5);
        z-index: 9000;
      }
      .bs-overlay.open { display: block; }
      .bs-sheet {
        position: fixed;
        left: 0; right: 0; bottom: 0;
        background: #fff;
        border-radius: 18px 18px 0 0;
        max-height: 90vh;
        overflow-y: auto;
        z-index: 9001;
        transform: translateY(100%);
        transition: transform .25s cubic-bezier(.4,0,.2,1);
        padding-bottom: env(safe-area-inset-bottom, 12px);
        box-shadow: 0 -4px 24px rgba(0,0,0,.18);
      }
      .bs-sheet.open { transform: translateY(0); }
      .bs-header {
        padding: 10px 16px 12px;
        border-bottom: 1px solid #e2e8f0;
        position: sticky; top: 0;
        background: #fff; z-index: 1;
      }
      .bs-pill {
        width: 40px; height: 4px;
        background: #e2e8f0; border-radius: 99px;
        margin: 0 auto 10px;
      }
      .bs-title {
        font-size: 16px; font-weight: 800;
        color: #111827; margin-bottom: 4px;
      }
      .bs-subtitle {
        font-size: 12px; color: #64748b;
      }
      .bs-body { padding: 14px 16px; }
      .bs-btn {
        width: 100%; min-height: 48px;
        padding: 12px 16px; border-radius: 10px;
        font-size: 14px; font-weight: 700;
        cursor: pointer; border: 1px solid transparent;
        font-family: inherit; transition: opacity .15s;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      }
      .bs-btn:active { opacity: .85; }
      .bs-btn:disabled { opacity: .4; cursor: not-allowed; }
      .bs-btn-primary { background: #2563eb; color: #fff; }
      .bs-btn-outline { background: #fff; border-color: #e2e8f0; color: #374151; }
      .bs-btn-outline:hover { background: #f8fafc; }
      @media (min-width: 768px) {
        .bs-sheet {
          left: 50%; right: auto; bottom: auto; top: 50%;
          width: 440px; max-height: 85vh;
          border-radius: 14px;
          transform: translate(-50%, -45%) scale(.96);
          opacity: 0;
          transition: transform .2s ease, opacity .2s ease;
        }
        .bs-sheet.open { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        .bs-pill { display: none; }
      }
    `;
    document.head.appendChild(s);
  }

  let currentOrderId = null;
  let currentItems = [];
  let sheet = null;
  let overlay = null;

  function createSheet() {
    if (sheet) return;

    // Overlay
    overlay = document.createElement('div');
    overlay.className = 'bs-overlay';
    overlay.onclick = closeSheet;
    document.body.appendChild(overlay);

    // Sheet
    sheet = document.createElement('div');
    sheet.className = 'bs-sheet';
    sheet.innerHTML = `
      <div class="bs-header">
        <div class="bs-pill"></div>
        <div class="bs-title">🏷️ Cetak Label</div>
        <div class="bs-subtitle" id="labelOrderInfo"></div>
      </div>
      <div class="bs-body" id="labelBody">
        <div style="text-align:center;padding:30px;color:var(--gray-5)">Memuat...</div>
      </div>
    `;
    document.body.appendChild(sheet);

    // Swipe down to close
    let startY = 0;
    sheet.addEventListener('touchstart', (e) => {
      if (e.target.closest('.bs-header')) startY = e.touches[0].clientY;
    });
    sheet.addEventListener('touchmove', (e) => {
      if (!startY) return;
      const delta = e.touches[0].clientY - startY;
      if (delta > 0) {
        sheet.style.transform = `translateY(${delta}px)`;
        overlay.style.opacity = Math.max(0, 1 - delta / 300);
      }
    });
    sheet.addEventListener('touchend', (e) => {
      if (!startY) return;
      const delta = e.changedTouches[0].clientY - startY;
      if (delta > 100) {
        closeSheet();
      } else {
        sheet.style.transform = '';
        overlay.style.opacity = '';
      }
      startY = 0;
    });
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove('open');
    overlay.classList.remove('open');
    setTimeout(() => {
      if (sheet) sheet.remove();
      if (overlay) overlay.remove();
      sheet = null;
      overlay = null;
      currentOrderId = null;
      currentItems = [];
    }, 200);
  }

  async function openSheet(orderId) {
    currentOrderId = orderId;

    try {
      const r = await fetch(`/api/v1/transaksi/${orderId}/detail`, { credentials: 'include' });
      if (!r.ok) throw new Error('Gagal memuat data');
      const response = await r.json();
      const data = response.data || response;

      currentItems = data.items || [];

      // 1 layanan → langsung cetak tanpa sheet
      if (currentItems.length <= 1) {
        if (currentItems.length === 0) {
          if (window.showToast) window.showToast('Tidak ada layanan');
          return;
        }
        await cetakLabel([currentItems[0].id]);
        return;
      }

      // 2+ layanan → tampilkan sheet pilihan
      createSheet();
      const orderInfo = `${data.nomor_transaksi} · ${data.pelanggan_nama || 'Non-member'}`;
      document.getElementById('labelOrderInfo').textContent = orderInfo;
      renderItems();

      setTimeout(() => {
        overlay.classList.add('open');
        sheet.classList.add('open');
      }, 10);
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Gagal: ' + err.message);
    }
  }

  function renderItems() {
    const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    let html = `
      <div style="margin-bottom:14px;color:var(--gray-7);font-size:13px;font-weight:600;">
        Pilih layanan yang mau dicetak:
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;" id="itemCheckboxes">
    `;

    currentItems.forEach((item, idx) => {
      const label = `${item.nama_layanan} ${item.jumlah} ${item.satuan || ''}`;
      html += `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--gray-1);border-radius:8px;cursor:pointer;user-select:none;">
          <input type="checkbox" data-item-id="${item.id}" data-idx="${idx}"
                 style="width:18px;height:18px;cursor:pointer;" onchange="updateLabelButtons()">
          <span style="flex:1;font-size:13px;color:var(--gray-9);">${escHtml(label)}</span>
        </label>
      `;
    });

    html += `
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="bs-btn bs-btn-outline" onclick="toggleAllLabels(true)" style="flex:1;">Pilih Semua</button>
        <button class="bs-btn bs-btn-outline" onclick="toggleAllLabels(false)" style="flex:1;">Batal Semua</button>
      </div>
      <button id="cetakLabelBtn" class="bs-btn bs-btn-primary" onclick="submitLabelSheet()" disabled>
        Cetak Label Terpilih
      </button>
    `;

    document.getElementById('labelBody').innerHTML = html;
  }

  window.toggleAllLabels = function(checked) {
    document.querySelectorAll('#itemCheckboxes input[type=checkbox]').forEach(cb => {
      cb.checked = checked;
    });
    updateLabelButtons();
  };

  window.updateLabelButtons = function() {
    const checked = document.querySelectorAll('#itemCheckboxes input[type=checkbox]:checked');
    const btn = document.getElementById('cetakLabelBtn');
    if (btn) {
      btn.disabled = checked.length === 0;
    }
  };

  window.submitLabelSheet = async function() {
    const checkedBoxes = document.querySelectorAll('#itemCheckboxes input[type=checkbox]:checked');
    const layananIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.itemId));

    if (layananIds.length === 0) {
      if (window.showToast) window.showToast('Pilih minimal 1 layanan');
      return;
    }

    closeSheet();
    await cetakLabel(layananIds);
  };

  async function cetakLabel(layananIds) {
    if (window.showToast) window.showToast('Mencetak label...');

    try {
      const r = await fetch(`/api/v1/transaksi/${currentOrderId}/label`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layanan_ids: layananIds })
      });
      const data = await r.json();

      if (!r.ok) {
        if (window.showToast) window.showToast('Gagal: ' + (data.error || 'Unknown error'));
        return;
      }

      if (window.showToast) window.showToast('✓ Label berhasil dicetak');
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Koneksi gagal');
    }
  }

  window.openLabelSheet = openSheet;
  window.closeLabelSheet = closeSheet;
})();
