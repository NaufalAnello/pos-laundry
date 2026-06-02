// ══════════════════════════════════════════════════════════════════════════════
// IMPORT PELANGGAN
// ══════════════════════════════════════════════════════════════════════════════

let previewData = null;

// ── Open modal ────────────────────────────────────────────────────────────────
function openImportModal() {
  document.getElementById('importModal').classList.add('open');
  resetImportForm();
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('open');
  resetImportForm();
}

function resetImportForm() {
  previewData = null;
  document.getElementById('uploadStep').style.display = 'block';
  document.getElementById('previewStep').style.display = 'none';
  document.getElementById('resultStep').style.display = 'none';
  document.getElementById('btnJalankanImport').style.display = 'none';
  document.getElementById('btnSelesai').style.display = 'none';
  document.getElementById('fileInput').value = '';
}

// ── Upload & Preview ──────────────────────────────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragging');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragging');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect({ target: fileInput });
  }
});

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  showToast('Memproses file...');

  try {
    const res = await fetch('/api/v1/pelanggan/import/preview', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Gagal memproses file', 3000);
      return;
    }

    previewData = data.data;
    renderPreview(previewData);

    document.getElementById('uploadStep').style.display = 'none';
    document.getElementById('previewStep').style.display = 'block';
    document.getElementById('btnJalankanImport').style.display = 'block';

  } catch (error) {
    console.error('Upload error:', error);
    showToast('Terjadi kesalahan saat upload file', 3000);
  }
}

// ── Render Preview ────────────────────────────────────────────────────────────
function renderPreview(data) {
  // Baru
  const sectionBaru = document.getElementById('sectionBaru');
  const tbodyBaru = document.getElementById('tbodyBaru');

  if (data.baru.length > 0) {
    sectionBaru.style.display = 'block';
    document.getElementById('countBaru').textContent = data.baru.length;

    tbodyBaru.innerHTML = data.baru.map(p => `
      <tr>
        <td>${p.nama}</td>
        <td>${p.telepon || '-'}</td>
        <td>${p.segmen}</td>
        <td>${p.alamat || '-'}</td>
      </tr>
    `).join('');
  } else {
    sectionBaru.style.display = 'none';
  }

  // Duplikat
  const sectionDuplikat = document.getElementById('sectionDuplikat');
  const tbodyDuplikat = document.getElementById('tbodyDuplikat');

  if (data.duplikat.length > 0) {
    sectionDuplikat.style.display = 'block';
    document.getElementById('countDuplikat').textContent = data.duplikat.length;

    tbodyDuplikat.innerHTML = data.duplikat.map((p, idx) => `
      <tr>
        <td>${p.nama}</td>
        <td>${p.segmen}</td>
        <td>${p.existing_telepon || '-'} → ${p.telepon || '-'}</td>
        <td>
          <div class="aksi-toggle">
            <button class="aksi-btn active" onclick="setAksiDuplikat(${idx}, 'skip')">Skip</button>
            <button class="aksi-btn" onclick="setAksiDuplikat(${idx}, 'update')">Update</button>
          </div>
        </td>
      </tr>
    `).join('');
  } else {
    sectionDuplikat.style.display = 'none';
  }

  // Error
  const sectionError = document.getElementById('sectionError');
  const tbodyError = document.getElementById('tbodyError');

  if (data.error.length > 0) {
    sectionError.style.display = 'block';
    document.getElementById('countError').textContent = data.error.length;

    tbodyError.innerHTML = data.error.map(e => `
      <tr>
        <td>${e.baris}</td>
        <td>${e.nama}</td>
        <td style="color:var(--red)">${e.errors.join(', ')}</td>
      </tr>
    `).join('');
  } else {
    sectionError.style.display = 'none';
  }

  // Update summary
  updateSummary();
}

// ── Toggle Aksi Duplikat ──────────────────────────────────────────────────────
function setAksiDuplikat(index, aksi) {
  previewData.duplikat[index].aksi = aksi;

  const row = document.getElementById('tbodyDuplikat').children[index];
  const buttons = row.querySelectorAll('.aksi-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  if (aksi === 'skip') {
    buttons[0].classList.add('active');
  } else {
    buttons[1].classList.add('active');
  }

  updateSummary();
}

function setSemuaDuplikat(aksi) {
  previewData.duplikat.forEach((_, idx) => setAksiDuplikat(idx, aksi));
}

// ── Update Summary ────────────────────────────────────────────────────────────
function updateSummary() {
  const countBaru = previewData.baru.length;
  const countUpdate = previewData.duplikat.filter(d => d.aksi === 'update').length;
  const countSkip = previewData.duplikat.filter(d => d.aksi === 'skip').length;
  const countError = previewData.error.length;

  document.getElementById('summaryBaru').textContent = countBaru;
  document.getElementById('summaryUpdate').textContent = countUpdate;
  document.getElementById('summarySkip').textContent = countSkip;
  document.getElementById('summaryError').textContent = countError;
}

// ── Jalankan Import ───────────────────────────────────────────────────────────
async function jalankanImport() {
  const aksiDuplikat = {};
  previewData.duplikat.forEach(d => {
    aksiDuplikat[d.nama] = d.aksi;
  });

  const btn = document.getElementById('btnJalankanImport');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Importing...';

  try {
    const res = await fetch('/api/v1/pelanggan/import/konfirmasi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview: previewData,
        aksiDuplikat
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Gagal import', 3000);
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-check"></i> Jalankan Import';
      return;
    }

    // Show result
    document.getElementById('previewStep').style.display = 'none';
    document.getElementById('resultStep').style.display = 'block';
    document.getElementById('btnJalankanImport').style.display = 'none';
    document.getElementById('btnSelesai').style.display = 'block';

    document.getElementById('resultBerhasil').textContent = data.data.berhasil;
    document.getElementById('resultUpdate').textContent = data.data.diupdate;
    document.getElementById('resultSkip').textContent = data.data.diskip;
    document.getElementById('resultGagal').textContent = data.data.gagal;

    showToast('Import selesai!', 3000);

  } catch (error) {
    console.error('Import error:', error);
    showToast('Terjadi kesalahan saat import', 3000);
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Jalankan Import';
  }
}

function selesaiImport() {
  closeImportModal();
  loadPelanggan(); // Reload data
}

// ── Toggle Preview Section ────────────────────────────────────────────────────
function togglePreviewSection(sectionId) {
  const section = document.getElementById(sectionId);
  section.classList.toggle('open');
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportPelanggan(format) {
  window.location.href = `/api/v1/pelanggan/export?format=${format}`;
}
