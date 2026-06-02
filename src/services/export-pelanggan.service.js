const xlsx = require('xlsx');
const Papa = require('papaparse');

/**
 * Export pelanggan ke format Excel
 */
function exportKeExcel(pelanggan) {
  const data = pelanggan.map(p => ({
    nama: p.nama,
    telepon: p.telepon || '',
    alamat: p.alamat || '',
    email: p.email || '',
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
    telepon: p.telepon || '',
    alamat: p.alamat || '',
    email: p.email || '',
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
      telepon: '628123456789',
      alamat: 'Jl. Merdeka No. 123',
      email: 'budi@example.com',
    },
    {
      nama: 'Siti Rahayu',
      telepon: '628198765432',
      alamat: 'Jl. Sudirman No. 45',
      email: 'siti@example.com',
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
