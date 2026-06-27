// ── Label Sheet: pilih layanan yang mau dicetak ─────────────────────────────
(function() {
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
    createSheet();

    try {
      const r = await fetch(`/api/v1/transaksi/${orderId}/detail`, { credentials: 'include' });
      if (!r.ok) throw new Error('Gagal memuat data');
      const response = await r.json();
      const data = response.data || response;

      currentItems = data.items || [];

      const orderInfo = `${data.nomor_transaksi} · ${data.pelanggan_nama || 'Non-member'}`;
      document.getElementById('labelOrderInfo').textContent = orderInfo;

      if (currentItems.length === 0) {
        document.getElementById('labelBody').innerHTML = `
          <div style="text-align:center;padding:30px;color:var(--gray-5)">
            Tidak ada layanan
          </div>
        `;
      } else if (currentItems.length === 1) {
        // Langsung cetak jika hanya 1 layanan
        closeSheet();
        await cetakLabel([currentItems[0].id]);
      } else {
        renderItems();
      }

      setTimeout(() => {
        overlay.classList.add('open');
        sheet.classList.add('open');
      }, 10);
    } catch (err) {
      console.error(err);
      if (sheet) {
        document.getElementById('labelBody').innerHTML = `
          <div style="text-align:center;padding:30px;color:var(--danger)">
            Gagal memuat data: ${err.message}
          </div>
        `;
      }
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
