/**
 * Utility untuk format estimasi jam
 */

/**
 * Format estimasi jam ke teks yang mudah dibaca
 * @param {number} jam - Estimasi dalam jam
 * @returns {string} Format teks: "5 jam", "1 hari", "2 hari 12 jam"
 */
function formatEstimasi(jam) {
  if (!jam || jam <= 0) return '0 jam';

  if (jam < 24) {
    return jam + ' jam';
  }

  const hari = Math.floor(jam / 24);
  const sisaJam = jam % 24;

  if (sisaJam === 0) {
    return hari + ' hari';
  }

  return hari + ' hari ' + sisaJam + ' jam';
}

/**
 * Hitung estimasi selesai dari tanggal masuk + estimasi jam
 * @param {Date|string} tanggalMasuk - Tanggal/waktu order masuk
 * @param {number} estimasiJam - Estimasi dalam jam
 * @returns {Date} Tanggal estimasi selesai
 */
function hitungEstimasiSelesai(tanggalMasuk, estimasiJam) {
  const mulai = new Date(tanggalMasuk);
  const selesai = new Date(mulai);
  selesai.setHours(selesai.getHours() + (estimasiJam || 24));
  return selesai;
}

/**
 * Konversi hari ke jam (untuk backward compatibility)
 * @param {number} hari
 * @returns {number} jam
 */
function hariKeJam(hari) {
  return (hari || 0) * 24;
}

/**
 * Ambil estimasi jam dari layanan, dengan fallback ke estimasi_hari
 * @param {object} layanan - Object layanan
 * @returns {number} estimasi dalam jam
 */
function getEstimasiJam(layanan) {
  if (!layanan) return 24;

  // Prioritas: estimasi_jam, fallback ke estimasi_hari * 24
  if (layanan.estimasi_jam && layanan.estimasi_jam > 0) {
    return layanan.estimasi_jam;
  }

  if (layanan.estimasi_hari && layanan.estimasi_hari > 0) {
    return layanan.estimasi_hari * 24;
  }

  return 24; // default 1 hari
}

module.exports = {
  formatEstimasi,
  hitungEstimasiSelesai,
  hariKeJam,
  getEstimasiJam
};
