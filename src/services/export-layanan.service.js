const xlsx = require('xlsx');
const Papa = require('papaparse');

/**
 * Export layanan ke format Excel
 */
function exportKeExcel(layanan) {
  const data = layanan.map(l => ({
    nama: l.nama,
    kategori: l.kategori_nama || '',
    harga: l.harga,
    satuan: l.satuan,
    estimasi_jam: l.estimasi_jam || (l.estimasi_hari * 24),
    deskripsi: l.deskripsi || '',
    hpp: l.hpp || 0,
    margin_persen: l.margin_persen || 0,
    aktif: l.aktif ? 1 : 0,
  }));

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Layanan');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Export layanan ke format CSV
 */
function exportKeCSV(layanan) {
  const data = layanan.map(l => ({
    nama: l.nama,
    kategori: l.kategori_nama || '',
    harga: l.harga,
    satuan: l.satuan,
    estimasi_jam: l.estimasi_jam || (l.estimasi_hari * 24),
    deskripsi: l.deskripsi || '',
    hpp: l.hpp || 0,
    margin_persen: l.margin_persen || 0,
    aktif: l.aktif ? 1 : 0,
  }));

  return Papa.unparse(data);
}

/**
 * Buat template file (Excel atau CSV) dengan contoh data
 */
function buatTemplate(format = 'xlsx') {
  const contoh = [
    {
      nama: 'Cuci Kiloan Reguler',
      kategori: 'Kiloan',
      harga: 7000,
      satuan: 'kg',
      estimasi_jam: 48,
      deskripsi: '',
      hpp: 4200,
      margin_persen: 40,
      aktif: 1
    },
    {
      nama: 'Sprei Single',
      kategori: 'Sprei',
      harga: 15000,
      satuan: 'pcs',
      estimasi_jam: 24,
      deskripsi: '',
      hpp: 8000,
      margin_persen: 47,
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
