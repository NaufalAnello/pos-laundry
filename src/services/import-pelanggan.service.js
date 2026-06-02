const xlsx = require('xlsx');
const Papa = require('papaparse');
const fs = require('fs');

// Kolom wajib yang harus ada di file
const KOLOM_WAJIB = ['nama'];
const SEGMEN_VALID = ['rumahan', 'kost', 'industri'];

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

  // Cek segmen valid
  if (row.segmen && !SEGMEN_VALID.includes(String(row.segmen).toLowerCase())) {
    errors.push(`Baris ${no}: segmen '${row.segmen}' tidak valid. Gunakan: rumahan/kost/industri`);
  }

  // Cek aktif jika ada (harus 0 atau 1)
  if (row.aktif !== undefined && row.aktif !== '' && ![0, 1, '0', '1'].includes(row.aktif)) {
    errors.push(`Baris ${no}: aktif harus 0 atau 1`);
  }

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
      telepon: row.nomor_wa ? String(row.nomor_wa).trim() : null,
      alamat: row.alamat ? String(row.alamat).trim() : null,
      segmen: row.segmen ? String(row.segmen).toLowerCase() : 'rumahan',
      catatan: row.catatan ? String(row.catatan).trim() : null,
      aktif: row.aktif !== undefined ? Number(row.aktif) : 1,
    };

    if (existing) {
      hasil.duplikat.push({
        ...dataPelanggan,
        existing_id: existing.id,
        existing_telepon: existing.telepon,
        existing_segmen: existing.segmen,
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
        INSERT INTO pelanggan (nama, telepon, alamat, segmen, catatan, aktif)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      preview.baru.forEach(p => {
        try {
          stmt.run(p.nama, p.telepon, p.alamat, p.segmen, p.catatan, p.aktif);
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
        SET telepon = ?, alamat = ?, segmen = ?, catatan = ?, aktif = ?
        WHERE id = ?
      `);

      preview.duplikat.forEach(p => {
        const aksi = aksiDuplikat[p.nama] || p.aksi || 'skip';

        if (aksi === 'update') {
          try {
            stmtUpdate.run(p.telepon, p.alamat, p.segmen, p.catatan, p.aktif, p.existing_id);
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
