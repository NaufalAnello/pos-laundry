# Screening Modul Antar Jemput (HPP + Rute Optimal + Historical Pricing)

Tanggal: 2026-08-06
Metode: baca `services/antarJemputService.js` + `controllers/antarJemputController.js`
+ `controllers/laporanController.js::antarJemput`. Set 5 pengaturan HPP ke
nilai bulat mudah dihitung manual, jalankan test via HTTP API dan bandingkan
hasil sistem dengan hitungan manual angka-per-angka. Test khusus historical
pricing: bikin rute, ubah pengaturan, verifikasi rute lama TIDAK BERUBAH.

Baseline sebelum test (dipulihkan di akhir):
- `aj_harga_bbm=10000`, `aj_konsumsi_bbm=39`, `aj_biaya_aus=400`,
  `aj_kecepatan=30`, `aj_jam_kerja=8`
- `rute_antar_jemput` kosong (0 row)
- Pelanggan baseline: Budi Santoso (id=1, jarak=0), Naufal (id=2, jarak=3.4)

---

## Rumus HPP (dari `antarJemputService.js`)

```
totalJarak  = Σ |p.jarak_km - prev| + prev_last_ke_workshop
biayaBBM    = (totalJarak / konsumsi_bbm) × harga_bbm
biayaWaktu  = (totalJarak / kecepatan) × nilaiWaktu    ← nilaiWaktu per JAM
biayaAus    = totalJarak × biaya_aus
totalHPP    = biayaBBM + biayaWaktu + biayaAus
hppPerPelanggan = totalHPP / jumlah_pelanggan

nilaiWaktu  = MAX(SUM(total_bayar 30 hari) / 30 / jam_kerja, 15000/jam)
```

Semua nominal di-`Math.round()` sebelum disimpan/return. Rute optimal pakai
**nearest-neighbor greedy 1D** (model jarak = selisih km dari workshop) —
efisien untuk skala kota kecil / koridor jalan utama.

---

## Ringkasan Temuan

| # | Skenario                                                              | Status               |
|---|-----------------------------------------------------------------------|----------------------|
| 1 | HPP 1 pelanggan 10km — exact match hitung manual                      | Sudah benar          |
| 2 | Rute optimal 3 pelanggan urutan acak                                  | Sudah benar          |
| 3 | Historical pricing: rute lama TIDAK berubah setelah settings diupdate | Sudah benar          |
| 4 | Rute baru pakai settings baru (BBM 12k), rute lama tetap (10k)        | Sudah benar          |
| 5 | Laporan Antar Jemput tampilkan snapshot per rute, BUKAN recompute     | Sudah benar          |
| E1| Pelanggan tanpa jarak → HTTP 400 dgn daftar pelanggan_tanpa_jarak     | Sudah benar          |
| E2| 1 pelanggan trivial (bukan multi)                                     | Sudah benar          |
| E3| DeepSeek AI tanpa API key / timeout → saran_ai:null (graceful)        | Sudah benar          |
| E4| Mixed pelanggan (sebagian punya jarak, sebagian tidak) → tolak        | Sudah benar          |
| E5| pelanggan_ids kosong → Joi validation reject                          | Sudah benar          |

**Tidak ada bug ditemukan.** Rumus HPP correct, rute optimal correct,
historical pricing terisolasi dengan sempurna, edge case semua handled dgn
pesan jelas.

---

## Detail Verifikasi

### TEST 1 — HPP 1 pelanggan 10 km (hitung manual)

**Settings:** `harga_bbm=10000, konsumsi=40 km/L, aus=500, kecepatan=30, jam_kerja=8`.
`nilaiWaktu` fallback ke min **Rp 15.000/jam** (pendapatan 30 hari cuma
Rp 51.000/30/8 = Rp 212/jam < 15.000 floor).

**Hitung manual:**
- totalJarak = 10 + 10 (PP) = **20 km**
- biayaBBM = 20/40 × 10.000 = **Rp 5.000**
- biayaAus = 20 × 500 = **Rp 10.000**
- biayaWaktu = 20/30 × 15.000 = 0.6667 × 15.000 = **Rp 10.000**
- totalHPP = 5.000 + 10.000 + 10.000 = **Rp 25.000**

**Aktual sistem:**
```json
{ "totalJarak":20, "biayaBBM":5000, "biayaWaktu":10000, "biayaAus":10000,
  "totalHPP":25000, "hppPerPelanggan":25000,
  "snapshot":{"harga_bbm":10000,"konsumsi_bbm":40,"biaya_aus":500,
              "kecepatan":30,"nilai_waktu":15000} }
```
**EXACT MATCH** ✓

### TEST 2 — Rute optimal 3 pelanggan

**Input:** urutan acak `[Beta(10km), Alfa(2km), Gamma(3km)]`.

**Manual (semua urutan possible):**
- `Alfa→Gamma→Beta`: 2+1+7+10 = **20 km** (optimal, greedy pick ini)
- `Alfa→Beta→Gamma`: 2+8+7+3 = **20 km** (optimal alt)
- `Gamma→Beta→Alfa`: 3+7+8+2 = **20 km**
- `Beta→Alfa→Gamma`: 10+8+1+3 = **22 km** (NON-optimal)

**Aktual sistem:** `ruteOptimal = [Alfa, Gamma, Beta], totalJarak=20`
✓ Greedy 1D nearest-neighbor dari posisi 0 pilih Alfa (2km) → Gamma (3km) →
Beta (10km). Sesuai algoritma optimal 1D untuk kasus ini.

### TEST 3 & 4 — Historical Pricing (KRITIS)

**STEP A** — buat rute LAMA dgn settings `BBM=10.000, aus=500`:
```
rute id=1: snapshot_bbm=10000, snapshot_aus=500
           biaya_bbm=5000, biaya_aus=10000, biaya_waktu=10000, total_hpp=25000
```

**STEP B** — ubah settings: `BBM=12.000, aus=700` (kecepatan/jam_kerja tetap).

**STEP C** — buka rute LAMA lagi via `/api/v1/antar-jemput/riwayat`:
```
id=1: bbm=10000, aus=500, total_hpp=25000, biaya_bbm=5000, biaya_aus=10000
```
✓ **TIDAK BERUBAH** — snapshot & angka HPP tetap sama seperti STEP A.

**STEP D** — buat rute BARU (pelanggan sama, jarak 10km) setelah settings diubah:
```
rute id=2: snapshot_bbm=12000, snapshot_aus=700
           biaya_bbm=6000, biaya_aus=14000, biaya_waktu=10000, total_hpp=30000
```
Hitung manual: 20/40×12000=6000, 20×700=14000, waktu tetap 10000 → 30000 ✓

**STEP E** — riwayat sekarang menampilkan 2 rute dengan angka BEDA:
```
id=1 (lama): snap_bbm=10000, snap_aus=500, biaya_bbm=5000, biaya_aus=10000, total_hpp=25000
id=2 (baru): snap_bbm=12000, snap_aus=700, biaya_bbm=6000, biaya_aus=14000, total_hpp=30000
```
✓ Setiap rute pakai snapshot masing-masing sesuai kapan dibuat.

### TEST 5 — Integrasi Laporan

`GET /api/v1/laporan/antar-jemput?start=2026-08-06&end=2026-08-06`:
```json
{ "ringkasan": { "total_hpp_riil":55000, "total_tarif_diterima":33000, "profit_aj":-22000 },
  "detail":[
    {"id":2,"hpp_total":30000,"tarif_total":18000,"snapshot":{"harga_bbm":12000,"biaya_aus":700}},
    {"id":1,"hpp_total":25000,"tarif_total":15000,"snapshot":{"harga_bbm":10000,"biaya_aus":500}}
  ]}
```
✓ Laporan menampilkan `hpp_total` dari kolom `rute_antar_jemput.total_hpp`
(snapshot), BUKAN recompute dengan settings saat ini. Ringkasan total_hpp =
25000+30000 = **55.000** — konsisten. Setiap detail juga expose `snapshot`
per rute supaya audit historis jelas.

### EDGE CASES

**E1** — Pelanggan tanpa jarak_workshop_km:
```
POST /hitung {"pelanggan_ids":[1]} (Budi jarak=0)
→ HTTP 400 {"error":"Sebagian pelanggan belum punya data jarak",
             "pelanggan_tanpa_jarak":[{"id":1,"nama":"Budi Santoso"}]}
```
Tidak memaksakan hitung dengan jarak 0. Pesan menyebut nama pelanggan
supaya operator tahu siapa yang perlu isi jarak dulu.

**E2** — 1 pelanggan trivial:
```
POST /hitung {"pelanggan_ids":[6],"jarak_overrides":{"6":5}}
→ ruteOptimal:[Alfa], totalJarak=10, totalHPP=15000 (dgn settings BBM=12k,aus=700)
  BBM=10/40×12000=3000, aus=10×700=7000, waktu=10/30×15000=5000 → 15000 ✓
```
Tidak error / crash, hitung normal.

**E3** — DeepSeek fallback:
- Settings: `ai_enabled=1, deepseek_api_url='', deepseek_model=deepseek-reasoner,
  deepseek_api_key TIDAK diset`.
- `callDeepSeekAI` cek `if (!enabled || !apiKey) return null` → return null.
- `konsultasiAI` wrap di try/catch → return null kalau error apapun.
- Response `saran_ai: null` — TIDAK CRASH ✓

**E4** — Mixed (sebagian pelanggan tanpa jarak):
```
POST /hitung {"pelanggan_ids":[1,6],"jarak_overrides":{"6":5}}
→ HTTP 400, list menyebut pelanggan id=1 saja yg missing.
```
Tolak kalau ada 1 pun pelanggan tanpa jarak. Konsisten dgn E1.

**E5** — pelanggan_ids kosong:
```
POST /hitung {"pelanggan_ids":[]}
→ HTTP 400 {"error":"\"pelanggan_ids\" must contain at least 1 items"}
```
Joi validation reject sebelum masuk business logic.

---

## Kesimpulan

**Modul Antar Jemput bekerja SEMPURNA sesuai spek:**

1. **Rumus HPP correct** — 3 komponen (BBM, waktu, aus) dengan formula matematis
   yang jelas, hasil match manual angka-per-angka.
2. **Rute optimal correct** — nearest-neighbor greedy 1D untuk model jarak
   linear dari workshop. Cocok untuk skala Mempawah / kota kecil, dari 3 kandidat
   urutan yang menghasilkan 20km, greedy pilih yang optimal.
3. **Historical pricing terisolasi PERFECT** — semua parameter di-snapshot ke
   kolom `snapshot_*` di `rute_antar_jemput` saat rute dibuat. Ubah settings
   TIDAK menyentuh rute existing. Laporan pakai `total_hpp` dari kolom rute
   (bukan recompute).
4. **Edge cases handled dengan pesan jelas** — pelanggan tanpa jarak ditolak
   dengan daftar spesifik, DeepSeek AI graceful fallback, Joi validation
   di boundary.

Tidak ada rekomendasi perbaikan.

---

## Cleanup

- 2 rute test (id=1, id=2) di `rute_antar_jemput` — **dihapus**.
- 3 pelanggan test (AJ Test Alfa/Beta/Gamma, id=6/7/8) — **dihapus**.
- Pengaturan AJ dikembalikan ke baseline: `harga_bbm=10000, konsumsi=39,
  aus=400, kecepatan=30, jam_kerja=8`.
- `biaya_tambahan` tidak ada row test tersisa (pelanggan test tidak punya
  order aktif → biaya_terpasang=0 di 2 kali panggil `/simpan`).
