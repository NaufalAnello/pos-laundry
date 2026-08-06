const xlsx = require('xlsx');
const Papa = require('papaparse');
const fs = require('fs');

// Kolom wajib yang harus ada di file
const KOLOM_WAJIB = ['nama'];

// Normalisasi nomor telepon ke format 08xxx (konvensi display Indonesia).
// - Strip semua karakter non-digit dulu (spasi, tanda +, dash, kurung, dll).
// - 62xxx  → ubah ke 0xxx
// - 08xxx  → tetap
// - lainnya → prefix '0' (asumsi user lupa awalan)
// Return null kalau input kosong / setelah strip tidak tersisa digit.
function normalizeTelepon(nomor) {
  if (nomor == null) return null;
  const clean = String(nomor).replace(/\D/g, '');
  if (!clean) return null;
  if (clean.startsWith('62')) return '0' + clean.slice(2);
  if (clean.startsWith('0'))  return clean;
  return '0' + clean;
}

/**
 * Baca file CSV atau Excel dan return array of objects
 */
function bacaFile(filePath, mimeType) {
  let rows = [];

  if (mimeType === 'text/csv' || filePath.endsWith('.csv')) {
    // CSV
    const isi = fs.readFileSync(filePath, 'utf8');
    const hasil = Papa.parse(isi, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
      transform: (val) => String(val).trim()
    });
    rows = hasil.data;
  } else {
    // Excel
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    // Trim semua string values
    rows = rows.map(row => {
      const cleaned = {};
      Object.keys(row).forEach(key => {
        const val = row[key];
        cleaned[key.trim()] = typeof val === 'string' ? val.trim() : val;
      });
      return cleaned;
    });
  }

  return rows;
}

/**
 * Validasi satu baris data
 */
function validasiRow(row, index) {
  const errors = [];
  const no = index + 2; // +2 karena header di baris 1 dan index mulai dari 0

  // Cek kolom wajib
  KOLOM_WAJIB.forEach(k => {
    if (!row[k] || String(row[k]).trim() === '') {
      errors.push(`Baris ${no}: kolom '${k}' wajib diisi`);
    }
  });

  return errors;
}

/**
 * Proses file import dan return preview (baru, duplikat, error)
 */
async function prosesImport(filePath, mimeType, semuaPelanggan) {
  const rows = bacaFile(filePath, mimeType);

  const hasil = {
    baru: [],
    duplikat: [],
    error: []
  };

  // Bikin lookup peta telepon normalized untuk dedup — pelanggan yang sama
  // kemungkinan besar punya nomor telepon sama, meski nama diketik beda-beda.
  const teleponMap = new Map();
  for (const p of semuaPelanggan) {
    const norm = normalizeTelepon(p.telepon);
    if (norm) teleponMap.set(norm, p);
  }

  rows.forEach((row, index) => {
    // Validasi
    const errors = validasiRow(row, index);
    if (errors.length > 0) {
      hasil.error.push({
        baris: index + 2,
        nama: row.nama || '(kosong)',
        errors
      });
      return;
    }

    // Normalisasi telepon ke 08xxx sebelum disimpan (spec konvensi display).
    const teleponNorm = normalizeTelepon(row.telepon);

    // Cek duplikat: prioritas telepon (lebih unik), fallback ke nama.
    let existing = null;
    if (teleponNorm) existing = teleponMap.get(teleponNorm) || null;
    if (!existing) {
      existing = semuaPelanggan.find(
        p => p.nama.toLowerCase() === String(row.nama).toLowerCase()
      ) || null;
    }

    // Siapkan data pelanggan — include field opsional dari file
    // (total_poin, jarak_workshop_km, parfum, instruksi_khusus, catatan)
    // supaya round-trip export→import preserve data.
    const dataPelanggan = {
      nama:              String(row.nama).trim(),
      telepon:           teleponNorm,
      alamat:            row.alamat            ? String(row.alamat).trim()           : null,
      email:             row.email             ? String(row.email).trim()            : null,
      total_poin:        row.total_poin        != null && row.total_poin !== '' ? Number(row.total_poin) || 0 : 0,
      jarak_workshop_km: row.jarak_workshop_km != null && row.jarak_workshop_km !== '' ? Number(row.jarak_workshop_km) || 0 : 0,
      parfum:            row.parfum            ? String(row.parfum).trim()           : null,
      instruksi_khusus:  row.instruksi_khusus  ? String(row.instruksi_khusus).trim() : null,
      catatan:           row.catatan           ? String(row.catatan).trim()          : null,
    };

    if (existing) {
      hasil.duplikat.push({
        ...dataPelanggan,
        existing_id: existing.id,
        existing_telepon: existing.telepon,
        aksi: 'skip', // default skip
      });
    } else {
      hasil.baru.push(dataPelanggan);
    }
  });

  return hasil;
}

/**
 * Eksekusi import ke database
 */
async function eksekusiImport(db, preview, aksiDuplikat = {}) {
  const hasil = {
    berhasil: 0,
    diupdate: 0,
    diskip: 0,
    gagal: 0
  };

  try {
    // Insert baru — include kolom personalisasi (parfum, instruksi, catatan,
    // jarak_workshop_km, total_poin) supaya round-trip preserve data.
    if (preview.baru.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO pelanggan (
          nama, telepon, alamat, email,
          total_poin, jarak_workshop_km, parfum, instruksi_khusus, catatan,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      preview.baru.forEach(p => {
        try {
          stmt.run(
            p.nama, p.telepon, p.alamat, p.email,
            p.total_poin || 0, p.jarak_workshop_km || 0,
            p.parfum, p.instruksi_khusus, p.catatan
          );
          hasil.berhasil++;
        } catch (err) {
          console.error('[import-pelanggan] Insert error:', err.message);
          hasil.gagal++;
        }
      });
    }

    // Handle duplikat — kalau operator pilih 'update', overwrite semua field
    // opsional (bukan cuma telepon/alamat/email). total_poin sengaja NOT
    // di-overwrite supaya tidak reset poin loyalitas pelanggan existing.
    if (preview.duplikat.length > 0) {
      const stmtUpdate = db.prepare(`
        UPDATE pelanggan
        SET telepon = ?, alamat = ?, email = ?,
            jarak_workshop_km = ?, parfum = ?, instruksi_khusus = ?, catatan = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `);

      preview.duplikat.forEach(p => {
        const aksi = aksiDuplikat[p.nama] || p.aksi || 'skip';

        if (aksi === 'update') {
          try {
            stmtUpdate.run(
              p.telepon, p.alamat, p.email,
              p.jarak_workshop_km || 0, p.parfum, p.instruksi_khusus, p.catatan,
              p.existing_id
            );
            hasil.diupdate++;
          } catch (err) {
            console.error('[import-pelanggan] Update error:', err.message);
            hasil.gagal++;
          }
        } else {
          hasil.diskip++;
        }
      });
    }
  } catch (error) {
    console.error('[import-pelanggan] Error:', error);
    throw error;
  }

  return hasil;
}

module.exports = {
  bacaFile,
  validasiRow,
  prosesImport,
  eksekusiImport
};
