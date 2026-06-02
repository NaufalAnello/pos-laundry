const xlsx = require('xlsx');
const Papa = require('papaparse');
const fs = require('fs');

// Kolom wajib yang harus ada di file
const KOLOM_WAJIB = ['nama'];

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

    // Cek duplikat berdasarkan nama (case insensitive)
    const existing = semuaPelanggan.find(
      p => p.nama.toLowerCase() === String(row.nama).toLowerCase()
    );

    // Siapkan data pelanggan
    const dataPelanggan = {
      nama: String(row.nama).trim(),
      telepon: row.telepon ? String(row.telepon).trim() : null,
      alamat: row.alamat ? String(row.alamat).trim() : null,
      email: row.email ? String(row.email).trim() : null,
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
    // Insert baru
    if (preview.baru.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO pelanggan (nama, telepon, alamat, email, total_poin, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `);

      preview.baru.forEach(p => {
        try {
          stmt.run(p.nama, p.telepon, p.alamat, p.email);
          hasil.berhasil++;
        } catch (err) {
          console.error('[import-pelanggan] Insert error:', err.message);
          hasil.gagal++;
        }
      });
    }

    // Handle duplikat
    if (preview.duplikat.length > 0) {
      const stmtUpdate = db.prepare(`
        UPDATE pelanggan
        SET telepon = ?, alamat = ?, email = ?, updated_at = datetime('now')
        WHERE id = ?
      `);

      preview.duplikat.forEach(p => {
        const aksi = aksiDuplikat[p.nama] || p.aksi || 'skip';

        if (aksi === 'update') {
          try {
            stmtUpdate.run(p.telepon, p.alamat, p.email, p.existing_id);
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
