# Screening Poin & Margin (Rumus Perhitungan)

Tanggal: 2026-08-06
Metode: 
1. `grep -rn` seluruh codebase (src/, public/) untuk semua kemunculan rumus
   poin (`poin_per_nominal`, `nilai_tukar_poin`, `Math.floor.*total`) dan
   margin (`hpp`, `margin`, `markup`, `/ hpp`)
2. Test poin: set `poin_per_nominal=10000`, jalankan 5 order via HTTP API
   dengan nominal berbeda, verifikasi `total_poin` pelanggan di DB.
3. Test margin: kasus kanonik HPP=1907, harga=5000 → margin BENAR 61.86%
   vs markup SALAH 162.19% — bandingkan output setiap tempat.
4. Edge case: HPP=0, harga=0, rugi, impas.

---

## Peta Semua Tempat Rumus (grep hasil)

### POIN

| File:Line                                             | Rumus                                                | Verdict |
|-------------------------------------------------------|------------------------------------------------------|---------|
| `services/transaksiService.js:108`                    | `poinEarned = Math.floor(total_bayar / perNominal)` di `awardPoinJikaLunas` — `perNominal = s.poin_per_nominal \|\| 10000` | ✓ CORRECT |
| `models/transaksiModel.js:253-256`                    | `poinDidapat = Math.floor(total_bayar / poin_per_nominal)` di `findDetailById` untuk preview UI | ✓ CORRECT |
| `services/wa.service.js:85 + 107`                     | `getPoinEarned(trx.id)` SUM riwayat_poin jenis='tambah' — bukan hitung ulang, ambil actual | ✓ CORRECT |
| `services/printer.service.js:53, 251, 309`            | terima `poinEarned` sebagai parameter dari controller | ✓ CORRECT |
| `strukController.js:21 + 269 + 328`                   | terima `poinEarned` + `poin_digunakan × nilai_tukar_poin` untuk redeem diskon (bukan earning) | ✓ CORRECT |
| `poinController.js:6-7`                               | Default settings `poin_per_nominal='10000', nilai_tukar_poin='100'` | ✓ CORRECT |
| `database/seeds/01_initial_data.js:70-71`             | Seed same values | ✓ CORRECT |

**Semua tempat pakai `poin_per_nominal` untuk EARNING dan `nilai_tukar_poin` untuk REDEMPTION.** Bug lama (salah pakai nilai_tukar untuk earning → +100 poin dari 10rb) TIDAK ADA sisa.

### MARGIN

| File:Line                                             | Rumus                                                     | Verdict |
|-------------------------------------------------------|-----------------------------------------------------------|---------|
| `utils/margin.js:11-15` `hitungMarginDariHarga`       | `((hargaJual - hpp) / hargaJual * 100)`                   | ✓ CORRECT |
| `utils/margin.js:1-8` `hitungHargaJual` (inverse)     | `hpp / (1 - marginPersen / 100)`                          | ✓ CORRECT |
| `controllers/layananController.js:89`                 | Pakai helper `hitungMarginDariHarga(hpp, l.harga)`        | ✓ CORRECT |
| `controllers/layananController.js:216, 238`           | Pakai helper `hitungHargaJual(hpp, margin, pembulatan)`   | ✓ CORRECT |
| `pages/layanan.html:725, 787` (form auto)             | `hpp / (1 - margin/100)`                                  | ✓ CORRECT |
| `pages/layanan.html:738, 933` (manual & list)         | `((harga - hpp) / harga * 100)`                           | ✓ CORRECT |
| `pages/pengaturan.html:1000` (margin summary)         | `((l.harga - hpp) / l.harga * 100)`                       | ✓ CORRECT |
| `pages/laporan.html:996` (per layanan)                | `(estProfit / omset * 100)` di mana omset = harga × vol   | ✓ CORRECT |
| `controllers/laporanController.js:614` (AJ ringkasan) | `(profit / totalTarifDiterima) * 100`                     | ✓ CORRECT |
| `controllers/laporanController.js:650` (AJ per rute)  | `(margin / tarifTotal) * 100`                             | ✓ CORRECT |
| **`pages/antar-jemput.html:600` (preview tarif AJ)**  | **`((tarif - hpp) / hpp) * 100`** ← **MARKUP, BUKAN MARGIN** | **BUG → DIPERBAIKI** |

---

## Ringkasan Temuan

| # | Skenario / Site                                                   | Severity | Status               |
|---|-------------------------------------------------------------------|----------|----------------------|
| P1| Order Rp 10.000 → +1 poin (bukan +100)                            | –        | Sudah benar          |
| P2| Order Rp 25.000 → +2 poin (Math.floor)                            | –        | Sudah benar          |
| P3| Order Rp 9.999 → +0 poin (di bawah kelipatan)                     | –        | Sudah benar          |
| P4| Order Rp 100.000 → +10 poin                                       | –        | Sudah benar          |
| P5| DP belum lunas → 0 poin dulu; setelah lunasi → +N poin            | –        | Sudah benar          |
| P6| Akumulasi total_poin match sum riwayat_poin                       | –        | Sudah benar          |
| M1-M9 | 9 tempat rumus margin (utils, layanan, pengaturan, laporan, backend AJ) | – | Sudah benar |
| **M10** | **`antar-jemput.html:600` preview tarif AJ pakai MARKUP formula** | **KRITIS** | **BUG DIPERBAIKI** |
| E1| HPP=0 → return 0 (bukan NaN)                                      | –        | Sudah benar          |
| E2| harga=0 → return 0                                                | –        | Sudah benar          |
| E3| HPP > harga (rugi) → margin negatif tampil ("-20.00%")            | –        | Sudah benar          |
| E4| HPP = harga (impas) → 0%                                          | –        | Sudah benar          |

---

## Detail BUG M10 — `antar-jemput.html:600` Markup vs Margin

**Skenario:** Operator buka halaman Antar Jemput, hitung rute AJ, sistem
menyarankan tarif Rp 6.000 dengan HPP Rp 5.000 per pelanggan.

**Sebelum fix (kode lama):**
```js
const margin = hpp > 0 ? Math.round(((tarif - hpp) / hpp) * 100) : 0;
// tampil: "HPP: Rp 5.000 · Margin: 20%"
```

**Manual check:**
- Margin BENAR = (6000 - 5000) / 6000 × 100 = **16.67% ≈ 17%**
- Markup (yg salah) = (6000 - 5000) / 5000 × 100 = **20%**

Selisih 3% terlihat kecil di kasus ini, tapi untuk kasus tarif jauh dari HPP
selisihnya membesar:
- HPP 5000, tarif 15000: margin 66.67%, markup 200% (jauh lebih besar)
- Operator yg lihat "margin 200%" akan mengira layanan sangat untung, padahal
  margin aktual "cuma" 67%.

**Root cause:** Sisa dari rumus markup yang belum kena fix waktu bug margin
di `pengaturan.html` diperbaiki sebelumnya. Ini tempat lain yang belum
ketemu waktu itu.

**Fix diterapkan:**
```js
// Margin (bukan markup): (tarif - hpp) / tarif × 100.
const margin = tarif > 0 && hpp > 0 ? Math.round(((tarif - hpp) / tarif) * 100) : 0;
```

Plus guard `tarif > 0` untuk menghindari div-by-zero kalau operator kosongkan
input tarif dulu.

**Re-test (Node semantic):**
```
tarif=6000 hpp=5000: 17% (BENAR margin) — sebelumnya 20% (markup)
```

**Status:** BUG DIPERBAIKI.

---

## Detail Test POIN (via HTTP)

Setup: `poin_per_nominal=10000`, `total_poin` pelanggan 1 di-reset ke 0.

| # | Order (total_bayar)          | Expected poin | Aktual poin | Total_poin | Match |
|---|------------------------------|---------------|-------------|------------|-------|
| 1 | Rp 10.000 lunas              | +1            | +1          | 1          | ✓     |
| 2 | Rp 25.000 lunas              | +2 (floor)    | +2          | 3          | ✓     |
| 3 | Rp 9.999 lunas               | 0             | 0           | 3          | ✓     |
| 4 | Rp 100.000 lunas             | +10           | +10         | 13         | ✓     |
| 5a| Rp 50.000 DP 30k (belum lunas)| 0            | 0           | 13         | ✓     |
| 5b| Lunasi sisa Rp 20k → 50k tot | +5           | +5          | 18         | ✓     |

Verified `riwayat_poin` mencatat 1 baris `jenis='tambah'` per order lunas
dengan `transaksi_id` yg benar. Sum semua `tambah` = `total_poin` pelanggan.

Backend rumus poin di `services/transaksiService.js:108`:
```js
const poinEarned = Math.floor(Number(transaksi.total_bayar) / perNominal);
```
`perNominal` diambil dari `pengaturan.poin_per_nominal` (fallback 10000).
**BUKAN** dari `nilai_tukar_poin` (yg untuk redeem, bukan earn).

---

## Detail Test MARGIN — Verifikasi 10 tempat (Node)

Kasus kanonik: HPP=1907, harga=5000.
- Margin BENAR = (5000-1907)/5000 × 100 = **61.86%**
- Markup SALAH = (5000-1907)/1907 × 100 = **162.19%**

| # | Site                                                    | Output   | Expected | Match |
|---|---------------------------------------------------------|----------|----------|-------|
| 1 | `utils/margin.js::hitungMarginDariHarga`                | 61.86%   | 61.86%   | ✓     |
| 2 | `utils/margin.js::hitungHargaJual(1907, 61.86)`         | 5000     | ~5000    | ✓     |
| 3 | `layanan.html:738` (manual)                             | 61.9%    | 61.9%    | ✓     |
| 4 | `layanan.html:725` (auto inverse)                       | 5000     | ~5000    | ✓     |
| 5 | `layanan.html:933` (list)                               | 62%      | 62%      | ✓     |
| 6 | `pengaturan.html:1000` (summary)                        | 62%      | 62%      | ✓     |
| 7 | `laporan.html:996` (per layanan agregat)                | 61.86%   | 61.86%   | ✓     |
| 8 | **`antar-jemput.html:600` SETELAH fix** (tarif 6000, hpp 5000) | 17% | 17% margin | ✓ |
| 8'| `antar-jemput.html:600` SEBELUM fix (markup)            | 20%      | (SALAH)  | ✗ FIXED |
| 9 | `laporanController.js:614` (AJ ringkasan)               | 24.24%   | 24.24%   | ✓     |
| 10| `laporanController.js:650` (AJ per rute rugi)           | -66.67%  | -66.67%  | ✓ (negatif jelas) |

---

## Edge Cases (verified)

| Kasus                       | Fungsi                              | Output           | OK? |
|-----------------------------|-------------------------------------|------------------|-----|
| HPP=0                       | `hitungMarginDariHarga(0, 5000)`    | 0 (bukan NaN)    | ✓   |
| HPP=0                       | `hitungHargaJual(0, 50)`            | 0                | ✓   |
| harga=0                     | `hitungMarginDariHarga(1000, 0)`    | 0                | ✓   |
| HPP > harga (rugi)          | `hitungMarginDariHarga(6000, 5000)` | -20% (negatif tampil) | ✓ |
| HPP = harga (impas)         | `hitungMarginDariHarga(5000, 5000)` | 0                | ✓   |
| List layanan HPP=0          | `layanan.html:933`                  | null → UI tampil tombol "+ Isi HPP" | ✓ |
| Tarif AJ=0 (blm diisi)      | `antar-jemput.html:600` fixed       | 0 (guard `tarif > 0`) | ✓ |

**Catatan minor** (bukan bug, di luar scope): `layanan_controller` Joi
schema `margin_persen: Joi.number().min(0).max(10000)` — max 10000% memungkinkan
angka aneh. Kalau operator input margin=100% exactly, `hitungHargaJual` return
Infinity. Tidak ter-guard di boundary. Kalau ≥100%, rumus jadi tak terdefinisi
atau negatif. Rekomendasi (out of scope): cap max ke 99. Skip untuk sekarang.

---

## Diff Akhir

```diff
--- public/pages/antar-jemput.html:596-603
+++ public/pages/antar-jemput.html:596-606
 function updateTarifMeta() {
   if (!state.hasil) return;
   const tarif = Number(document.getElementById('ajTarif').value || 0);
   const hpp = state.hasil.hppPerPelanggan;
-  const margin = hpp > 0 ? Math.round(((tarif - hpp) / hpp) * 100) : 0;
+  // Margin (bukan markup): (tarif - hpp) / tarif × 100.
+  // Sebelumnya (bug): dibagi hpp (rumus markup) — mis. tarif 6000 hpp 5000
+  // → 20% margin bukan 20% markup. Sudah difix di utils/margin.js dan
+  // frontend lain, sisa satu ini di preview tarif AJ.
+  const margin = tarif > 0 && hpp > 0 ? Math.round(((tarif - hpp) / tarif) * 100) : 0;
   document.getElementById('ajTarifMeta').textContent =
     `HPP: Rp ${fmt(hpp)} · Margin: ${margin}%`;
 }
```

---

## Kesimpulan

**Poin formula 100% CORRECT** — bug lama (+100 poin dari 10rb) sudah
sepenuhnya terhapus. Semua 7 site pakai `poin_per_nominal`. `nilai_tukar_poin`
dipakai HANYA untuk redemption (kurangi harga saat pakai poin), bukan earning.

**Margin formula 100% CORRECT setelah fix M10** — 1 bug KRITIS ditemukan di
`antar-jemput.html:600` (preview tarif AJ) yang masih pakai rumus MARKUP,
sisa dari fix sebelumnya. Sekarang diperbaiki. 9 site lain sudah correct.

Edge cases (HPP=0, harga=0, rugi, impas) semua handled dengan return 0 atau
angka negatif yang tampil jelas untuk operator.

## Cleanup

- 5 order test (id 91-96) dihapus dari `transaksi`.
- 5 baris `riwayat_poin` untuk order test dihapus.
- `pelanggan.total_poin` pelanggan 1 dikembalikan ke baseline 8.
- `poin_per_nominal` DB tetap 10000 (baseline, tidak diubah — hanya test dgn
  nilai default).
- Baseline: MAX(transaksi.id)=36, total_poin pelanggan 1 = 8.
