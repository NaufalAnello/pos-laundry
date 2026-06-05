function hitungHargaJual(hpp, marginPersen, pembulatan = 'ratusan') {
  if (!hpp || hpp <= 0) return 0;
  // Rumus margin: margin = (harga - hpp) / harga
  // Maka: harga = hpp / (1 - margin/100)
  const harga = hpp / (1 - marginPersen / 100);
  if (pembulatan === 'ribuan') return Math.ceil(harga / 1000) * 1000;
  if (pembulatan === 'tanpa')  return Math.round(harga);
  return Math.ceil(harga / 100) * 100; // default: ratusan
}

function hitungMarginDariHarga(hpp, hargaJual) {
  if (!hpp || hpp <= 0 || !hargaJual || hargaJual <= 0) return 0;
  // Rumus margin: (harga - hpp) / harga × 100
  return parseFloat(((hargaJual - hpp) / hargaJual * 100).toFixed(2));
}

function hitungKeuntungan(hpp, hargaJual, jumlah = 1) {
  return (hargaJual - hpp) * jumlah;
}

module.exports = { hitungHargaJual, hitungMarginDariHarga, hitungKeuntungan };
