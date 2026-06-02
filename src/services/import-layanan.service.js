const xlsx = require('xlsx');
const Papa = require('papaparse');
const fs = require('fs');

// Kolom wajib yang harus ada di file
const KOLOM_WAJIB = ['nama', 'kategori', 'harga', 'satuan'];
const SATUAN_VALID = ['kg', 'pcs'];

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

  // Cek satuan valid
  if (row.satuan && !SATUAN_VALID.includes(String(row.satuan).toLowerCase())) {
    errors.push(`Baris ${no}: satuan '${row.satuan}' tidak valid. Gunakan: kg/pcs`);
  }

  // Cek harga angka
  if (row.harga && isNaN(Number(row.harga))) {
    errors.push(`Baris ${no}: harga harus berupa angka`);
  }

  // Cek estimasi_jam jika ada
  if (row.estimasi_jam && row.estimasi_jam !== '' && isNaN(Number(row.estimasi_jam))) {
    errors.push(`Baris ${no}: estimasi_jam harus berupa angka`);
  }

  // Cek hpp jika ada
  if (row.hpp && row.hpp !== '' && isNaN(Number(row.hpp))) {
    errors.push(`Baris ${no}: hpp harus berupa angka`);
  }

  // Cek margin_persen jika ada
  if (row.margin_persen && row.margin_persen !== '' && isNaN(Number(row.margin_persen))) {
    errors.push(`Baris ${no}: margin_persen harus berupa angka`);
  }

  return errors;
}

/**
 * Proses file import dan return preview (baru, duplikat, error)
 */
async function prosesImport(filePath, mimeType, semuaKategori, semuaLayanan) {
  const rows = bacaFile(filePath, mimeType);
  const hasil = {
    total: rows.length,
    baru: [],
    duplikat: [],
    error: [],
  };

  rows.forEach((row, i) => {
    const errors = validasiRow(row, i);
    if (errors.length > 0) {
      hasil.error.push({
        row,
        errors,
        no: i + 2
      });
      return;
    }

    // Cek kategori ada (case-insensitive)
    const kategori = semuaKategori.find(
      k => k.nama.toLowerCase() === String(row.kategori).toLowerCase()
    );

    if (!kategori) {
      hasil.error.push({
        row,
        errors: [`Baris ${i + 2}: kategori '${row.kategori}' tidak ditemukan di sistem`],
        no: i + 2
      });
      return;
    }

    // Cek duplikat nama layanan (case-insensitive)
    const existing = semuaLayanan.find(
      l => l.nama.toLowerCase() === String(row.nama).toLowerCase()
    );

    // Siapkan data layanan
    const dataLayanan = {
      nama: String(row.nama).trim(),
      kategori_id: kategori.id,
      kategori_nama: kategori.nama,
      harga: Number(row.harga),
      satuan: String(row.satuan).toLowerCase(),
      estimasi_jam: row.estimasi_jam ? Number(row.estimasi_jam) : 48,
      deskripsi: row.deskripsi || row.keterangan || '',
      hpp: row.hpp ? Number(row.hpp) : 0,
      margin_persen: row.margin_persen ? Number(row.margin_persen) : 0,
      aktif: row.aktif !== undefined ? Number(row.aktif) : 1,
      harga_auto: 0, // default non-auto
    };

    if (existing) {
      hasil.duplikat.push({
        ...dataLayanan,
        existing_id: existing.id,
        harga_lama: existing.harga,
        aksi: 'skip', // default skip
      });
    } else {
      hasil.baru.push(dataLayanan);
    }
  });

  return hasil;
}

module.exports = { prosesImport, bacaFile };
