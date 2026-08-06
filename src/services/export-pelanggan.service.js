const xlsx = require('xlsx');
const Papa = require('papaparse');

// Konversi nomor telepon ke format Indonesia 08xxx untuk display konsisten
// di file export. Sama pola dgn printer.service::formatTeleponTampil.
function toDisplayPhone(n) {
  if (!n) return '';
  const s = String(n).trim();
  if (s.startsWith('628')) return '08' + s.slice(3);
  if (s.startsWith('62'))  return '0'  + s.slice(2);
  return s;
}

// Field yang di-export — SEMUA kolom penting supaya round-trip pelanggan
// tidak kehilangan info (total_poin, jarak untuk AJ, parfum/instruksi
// personalisasi, catatan). Jangan pernah drop field ini tanpa update
// juga di import + template.
function rowFor(p) {
  return {
    nama:              p.nama || '',
    telepon:           toDisplayPhone(p.telepon),
    alamat:            p.alamat || '',
    email:             p.email || '',
    total_poin:        Number(p.total_poin) || 0,
    jarak_workshop_km: Number(p.jarak_workshop_km) || 0,
    parfum:            p.parfum || '',
    instruksi_khusus:  p.instruksi_khusus || '',
    catatan:           p.catatan || ''
  };
}

/**
 * Export pelanggan ke format Excel.
 * Semua kolom text (termasuk telepon) tetap sebagai STRING supaya Excel
 * tidak menampilkan telepon sebagai scientific notation (bug UMUM saat
 * xlsx.json_to_sheet menerima input Number).
 */
function exportKeExcel(pelanggan) {
  const data = pelanggan.map(rowFor);
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Pelanggan');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Export pelanggan ke format CSV.
 */
function exportKeCSV(pelanggan) {
  const data = pelanggan.map(rowFor);
  return Papa.unparse(data);
}

/**
 * Buat template file (Excel atau CSV) dengan contoh data.
 * Contoh telepon pakai format 08xxx (konvensi display Indonesia).
 */
function buatTemplate(format = 'xlsx') {
  const contoh = [
    {
      nama:              'Budi Santoso',
      telepon:           '08123456789',
      alamat:            'Jl. Merdeka No. 123',
      email:             'budi@example.com',
      total_poin:        0,
      jarak_workshop_km: 0,
      parfum:            '',
      instruksi_khusus:  '',
      catatan:           ''
    },
    {
      nama:              'Siti Rahayu',
      telepon:           '08198765432',
      alamat:            'Jl. Sudirman No. 45',
      email:             'siti@example.com',
      total_poin:        0,
      jarak_workshop_km: 2.5,
      parfum:            'Lavender',
      instruksi_khusus:  'Cuci pisah dgn baju berwarna',
      catatan:           ''
    },
  ];

  if (format === 'csv') {
    return Papa.unparse(contoh);
  }

  const ws = xlsx.utils.json_to_sheet(contoh);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Template');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportKeExcel, exportKeCSV, buatTemplate };
