// ── Import Layanan Functions ──────────────────────────────────────────────────

let previewData = null;
let konfirmasiDuplikat = [];

// Open import modal
function openImportModal() {
  document.getElementById('importModal').classList.add('open');
  resetImportModal();
}

// Close import modal
function closeImportModal() {
  document.getElementById('importModal').classList.remove('open');
  resetImportModal();
}

// Reset modal ke step awal
function resetImportModal() {
  document.getElementById('uploadStep').style.display = 'block';
  document.getElementById('previewStep').style.display = 'none';
  document.getElementById('resultStep').style.display = 'none';
  document.getElementById('btnJalankanImport').style.display = 'none';
  document.getElementById('btnSelesai').style.display = 'none';
  document.getElementById('fileInput').value = '';
  previewData = null;
  konfirmasiDuplikat = [];
}

// Handle file select
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validasi ukuran file
  if (file.size > 5 * 1024 * 1024) {
    showToast('File terlalu besar. Maksimal 5MB', 'error');
    return;
  }

  // Validasi format
  const allowedExt = ['.csv', '.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();
  const isValid = allowedExt.some(ext => fileName.endsWith(ext));
  if (!isValid) {
    showToast('Format file tidak didukung. Gunakan CSV atau Excel', 'error');
    return;
  }

  // Upload dan proses
  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('Memproses file...', 'info');
    const res = await fetch('/api/v1/layanan/import/preview', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Gagal memproses file');
    }

    previewData = await res.json();
    tampilkanPreview(previewData);
  } catch (err) {
    console.error('Error upload:', err);
    showToast(err.message || 'Gagal memproses file', 'error');
  }
}

// Tampilkan preview
function tampilkanPreview(data) {
  // Hide upload, show preview
  document.getElementById('uploadStep').style.display = 'none';
  document.getElementById('previewStep').style.display = 'block';
  document.getElementById('btnJalankanImport').style.display = 'inline-flex';

  // Set default konfirmasi duplikat semua = skip
  konfirmasiDuplikat = data.duplikat.map(d => ({
    nama: d.nama,
    aksi: 'skip'
  }));

  // Render sections
  renderSectionBaru(data.baru);
  renderSectionDuplikat(data.duplikat);
  renderSectionError(data.error);

  // Update summary
  updateRingkasan();
}

// Render section baru
function renderSectionBaru(items) {
  const section = document.getElementById('sectionBaru');
  const tbody = document.getElementById('tbodyBaru');
  const count = document.getElementById('countBaru');

  if (items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  count.textContent = items.length;

  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${item.nama}</td>
      <td>${item.kategori_nama}</td>
      <td>Rp ${item.harga.toLocaleString('id-ID')}</td>
      <td>${item.satuan}</td>
      <td>${item.hpp > 0 ? 'Rp ' + item.hpp.toLocaleString('id-ID') : '-'}</td>
      <td>${item.margin_persen > 0 ? item.margin_persen + '%' : '-'}</td>
    </tr>
  `).join('');
}

// Render section duplikat
function renderSectionDuplikat(items) {
  const section = document.getElementById('sectionDuplikat');
  const tbody = document.getElementById('tbodyDuplikat');
  const count = document.getElementById('countDuplikat');

  if (items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  count.textContent = items.length;

  tbody.innerHTML = items.map((item, idx) => {
    const conf = konfirmasiDuplikat.find(k => k.nama === item.nama);
    const aksi = conf ? conf.aksi : 'skip';
    return `
      <tr>
        <td>${item.nama}</td>
        <td>${item.kategori_nama}</td>
        <td>Rp ${item.harga_lama.toLocaleString('id-ID')}</td>
        <td>Rp ${item.harga.toLocaleString('id-ID')}</td>
        <td>
          <div class="aksi-toggle">
            <button class="aksi-btn ${aksi === 'skip' ? 'active' : ''}"
                    onclick="setAksiDuplikat('${item.nama}', 'skip')">
              Skip
            </button>
            <button class="aksi-btn ${aksi === 'update' ? 'active' : ''}"
                    onclick="setAksiDuplikat('${item.nama}', 'update')">
              Update
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render section error
function renderSectionError(items) {
  const section = document.getElementById('sectionError');
  const tbody = document.getElementById('tbodyError');
  const count = document.getElementById('countError');

  if (items.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  count.textContent = items.length;

  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${item.no}</td>
      <td>${item.row.nama || '-'}</td>
      <td style="color:var(--red)">${item.errors.join('; ')}</td>
    </tr>
  `).join('');
}

// Set aksi untuk satu duplikat
function setAksiDuplikat(nama, aksi) {
  const item = konfirmasiDuplikat.find(k => k.nama === nama);
  if (item) item.aksi = aksi;
  renderSectionDuplikat(previewData.duplikat);
  updateRingkasan();
}

// Set aksi untuk semua duplikat
function setSemuaDuplikat(aksi) {
  konfirmasiDuplikat.forEach(k => k.aksi = aksi);
  renderSectionDuplikat(previewData.duplikat);
  updateRingkasan();
}

// Update ringkasan
function updateRingkasan() {
  const countUpdate = konfirmasiDuplikat.filter(k => k.aksi === 'update').length;
  const countSkip = konfirmasiDuplikat.filter(k => k.aksi === 'skip').length;

  document.getElementById('summaryBaru').textContent = previewData.baru.length;
  document.getElementById('summaryUpdate').textContent = countUpdate;
  document.getElementById('summarySkip').textContent = countSkip;
  document.getElementById('summaryError').textContent = previewData.error.length;
}

// Toggle preview section
function togglePreviewSection(sectionId) {
  const section = document.getElementById(sectionId);
  section.classList.toggle('open');
}

// Jalankan import
async function jalankanImport() {
  const btn = document.getElementById('btnJalankanImport');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Mengimport...';

  try {
    const res = await fetch('/api/v1/layanan/import/konfirmasi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ konfirmasiDuplikat })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Gagal mengimport data');
    }

    const hasil = await res.json();
    tampilkanHasil(hasil);
  } catch (err) {
    console.error('Error import:', err);
    showToast(err.message || 'Gagal mengimport data', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Jalankan Import';
  }
}

// Tampilkan hasil import
function tampilkanHasil(hasil) {
  document.getElementById('previewStep').style.display = 'none';
  document.getElementById('resultStep').style.display = 'block';
  document.getElementById('btnJalankanImport').style.display = 'none';
  document.getElementById('btnSelesai').style.display = 'inline-flex';

  document.getElementById('resultBerhasil').textContent = hasil.berhasil || 0;
  document.getElementById('resultUpdate').textContent = hasil.diupdate || 0;
  document.getElementById('resultSkip').textContent = hasil.diskip || 0;
  document.getElementById('resultGagal').textContent = hasil.gagal || 0;
}

// Selesai import - refresh dan tutup
function selesaiImport() {
  closeImportModal();
  showToast('Data layanan berhasil diimport', 'success');
  loadData(); // Reload data layanan
}

// Export layanan
function exportLayanan(format) {
  window.location.href = `/api/v1/layanan/export?format=${format}`;
  showToast(`Export ${format.toUpperCase()} dimulai...`, 'info');
}

// Drag & drop support
document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('uploadZone');
  if (!uploadZone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => {
      uploadZone.classList.add('dragging');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => {
      uploadZone.classList.remove('dragging');
    }, false);
  });

  uploadZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      document.getElementById('fileInput').files = files;
      handleFileSelect({ target: { files } });
    }
  }, false);
});
