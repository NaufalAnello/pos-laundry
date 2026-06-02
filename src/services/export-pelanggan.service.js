const xlsx = require('xlsx');
const Papa = require('papaparse');

/**
 * Export pelanggan ke format Excel
 */
function exportKeExcel(pelanggan) {
  const data = pelanggan.map(p => ({
    nama: p.nama,
    nomor_wa: p.telepon || '',
    alamat: p.alamat || '',
    segmen: p.segmen || 'rumahan',
    catatan: p.catatan || '',
    aktif: p.aktif ? 1 : 0,
  }));

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Pelanggan');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Export pelanggan ke format CSV
 */
function exportKeCSV(pelanggan) {
  const data = pelanggan.map(p => ({
    nama: p.nama,
    nomor_wa: p.telepon || '',
    alamat: p.alamat || '',
    segmen: p.segmen || 'rumahan',
    catatan: p.catatan || '',
    aktif: p.aktif ? 1 : 0,
  }));

  return Papa.unparse(data);
}

/**
 * Buat template file (Excel atau CSV) dengan contoh data
 */
function buatTemplate(format = 'xlsx') {
  const contoh = [
    {
      nama: 'Budi Santoso',
      nomor_wa: '081234567890',
      alamat: 'Jl. Merdeka No. 123',
      segmen: 'rumahan',
      catatan: 'Pelanggan setia',
      aktif: 1
    },
    {
      nama: 'Siti Kost',
      nomor_wa: '081298765432',
      alamat: 'Jl. Sudirman No. 45',
      segmen: 'kost',
      catatan: '',
      aktif: 1
    },
  ];

  if (format === 'csv') {
    return Papa.unparse(contoh);
  }

  // Excel
  const ws = xlsx.utils.json_to_sheet(contoh);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Template');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportKeExcel, exportKeCSV, buatTemplate };
