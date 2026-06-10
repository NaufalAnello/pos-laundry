// Kalkulator HPP Antar Jemput dengan historical pricing.
// Saat rute disimpan, parameter (BBM, aus, dll) di-snapshot ke record rute.
const db = require('../database/connection');

const DEFAULTS = {
  aj_harga_bbm:    10000,
  aj_konsumsi_bbm: 39,
  aj_biaya_aus:    400,
  aj_kecepatan:    30,
  aj_jam_kerja:    8,
};

async function getAJSettings(conn = db) {
  const rows = await conn('pengaturan').whereIn('kunci', Object.keys(DEFAULTS));
  const map = Object.fromEntries(rows.map(r => [r.kunci, r.nilai]));
  return {
    harga_bbm:    Number(map.aj_harga_bbm    ?? DEFAULTS.aj_harga_bbm),
    konsumsi_bbm: Number(map.aj_konsumsi_bbm ?? DEFAULTS.aj_konsumsi_bbm),
    biaya_aus:    Number(map.aj_biaya_aus    ?? DEFAULTS.aj_biaya_aus),
    kecepatan:    Number(map.aj_kecepatan    ?? DEFAULTS.aj_kecepatan),
    jam_kerja:    Number(map.aj_jam_kerja    ?? DEFAULTS.aj_jam_kerja),
  };
}

// Nilai waktu operator dihitung dari rata-rata pendapatan 30 hari terakhir
// dibagi jam kerja, dengan minimum Rp 15.000/jam jika data masih sedikit.
async function hitungNilaiWaktu(conn = db) {
  const tigaPuluhHariMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const result = await conn('transaksi')
    .where('tanggal_masuk', '>', tigaPuluhHariMs)
    .whereNot('status', 'dibatalkan')
    .sum('total_bayar as total')
    .first();

  const settings = await getAJSettings(conn);
  const pendapatanHarian = Number(result?.total || 0) / 30;
  const jamKerja = settings.jam_kerja > 0 ? settings.jam_kerja : 8;
  const nilaiPerJam = pendapatanHarian / jamKerja;

  return Math.max(nilaiPerJam, 15000);
}

// Nearest neighbor (greedy) — model 1 dimensi:
// jarak antar pelanggan = |jarak_km_A - jarak_km_B| dari workshop.
// Cukup baik untuk skala Mempawah (rute searah / di koridor jalan utama).
function sortRuteGreedy(pelangganList) {
  const unvisited = pelangganList.map(p => ({ ...p, jarak_km: Number(p.jarak_km) || 0 }));
  const rute = [];
  let posisi = 0; // workshop

  while (unvisited.length > 0) {
    let idxTerdekat = 0;
    let jarakMin = Math.abs(unvisited[0].jarak_km - posisi);
    for (let i = 1; i < unvisited.length; i++) {
      const j = Math.abs(unvisited[i].jarak_km - posisi);
      if (j < jarakMin) {
        jarakMin = j;
        idxTerdekat = i;
      }
    }
    const next = unvisited.splice(idxTerdekat, 1)[0];
    rute.push(next);
    posisi = next.jarak_km;
  }

  return rute;
}

async function hitungHPP(pelangganList, conn = db) {
  if (!pelangganList || pelangganList.length === 0) {
    throw new Error('Daftar pelanggan kosong');
  }

  const settings = await getAJSettings(conn);
  const nilaiWaktu = await hitungNilaiWaktu(conn);

  const ruteOptimal = sortRuteGreedy(pelangganList);

  let totalJarak = 0;
  let prev = 0;
  for (const p of ruteOptimal) {
    totalJarak += Math.abs(p.jarak_km - prev);
    prev = p.jarak_km;
  }
  totalJarak += prev; // pulang ke workshop

  const konsumsi = settings.konsumsi_bbm > 0 ? settings.konsumsi_bbm : 1;
  const kecepatan = settings.kecepatan > 0 ? settings.kecepatan : 1;

  const biayaBBM = (totalJarak / konsumsi) * settings.harga_bbm;
  const waktuJam = totalJarak / kecepatan;
  const biayaWaktu = waktuJam * nilaiWaktu;
  const biayaAus = totalJarak * settings.biaya_aus;
  const totalHPP = biayaBBM + biayaWaktu + biayaAus;
  const hppPerPelanggan = totalHPP / pelangganList.length;

  return {
    ruteOptimal,
    totalJarak: Math.round(totalJarak * 10) / 10,
    snapshot: {
      harga_bbm:    settings.harga_bbm,
      konsumsi_bbm: settings.konsumsi_bbm,
      biaya_aus:    settings.biaya_aus,
      kecepatan:    settings.kecepatan,
      nilai_waktu:  Math.round(nilaiWaktu),
    },
    biayaBBM:        Math.round(biayaBBM),
    biayaWaktu:      Math.round(biayaWaktu),
    biayaAus:        Math.round(biayaAus),
    totalHPP:        Math.round(totalHPP),
    hppPerPelanggan: Math.round(hppPerPelanggan),
  };
}

// ── DeepSeek ────────────────────────────────────────────────────────────────
async function callDeepSeekAI(prompt, conn = db) {
  const rows = await conn('pengaturan').whereIn('kunci', [
    'ai_enabled', 'deepseek_api_key', 'deepseek_api_url', 'deepseek_model'
  ]);
  const p = Object.fromEntries(rows.map(r => [r.kunci, r.nilai]));
  const enabled = p.ai_enabled === 'true' || p.ai_enabled === '1' || p.ai_enabled === true;
  const apiKey  = p.deepseek_api_key || process.env.DEEPSEEK_API_KEY;
  const apiUrl  = p.deepseek_api_url || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const model   = p.deepseek_model   || process.env.DEEPSEEK_MODEL   || 'deepseek-chat';

  if (!enabled || !apiKey) {
    return null;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Kamu konsultan operasional laundry yang to the point.' },
        { role: 'user', content: prompt }
      ],
      max_tokens:  600,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

async function konsultasiAI(data, pelangganList, conn = db) {
  const namaRute = data.ruteOptimal.map(p => p.nama).join(' → ');

  const prompt = `
Kamu adalah konsultan bisnis laundry di Mempawah, Kalimantan Barat.
Bantu operator Nala Laundry.

Data antar jemput hari ini:
- Rute: Workshop → ${namaRute} → Workshop
- Total jarak: ${data.totalJarak} km
- Jumlah pelanggan: ${pelangganList.length} orang

Breakdown HPP:
- BBM (Pertalite Rp ${data.snapshot.harga_bbm.toLocaleString('id-ID')}/L, motor ${data.snapshot.konsumsi_bbm} km/L): Rp ${data.biayaBBM.toLocaleString('id-ID')}
- Waktu operator (Rp ${data.snapshot.nilai_waktu.toLocaleString('id-ID')}/jam): Rp ${data.biayaWaktu.toLocaleString('id-ID')}
- Aus kendaraan (Rp ${data.snapshot.biaya_aus}/km): Rp ${data.biayaAus.toLocaleString('id-ID')}
- Total HPP: Rp ${data.totalHPP.toLocaleString('id-ID')}
- HPP per pelanggan: Rp ${data.hppPerPelanggan.toLocaleString('id-ID')}

Berikan jawaban singkat (3-4 poin) tanpa basa-basi:
1. Apakah urutan rute sudah efisien?
2. Rekomendasi tarif AJ per pelanggan (dengan margin wajar)
3. Tips efisiensi jika ada
  `.trim();

  try {
    return await callDeepSeekAI(prompt, conn);
  } catch (e) {
    console.error('[antarJemput:konsultasiAI]', e.message);
    return null;
  }
}

module.exports = {
  getAJSettings,
  hitungNilaiWaktu,
  sortRuteGreedy,
  hitungHPP,
  konsultasiAI,
};
