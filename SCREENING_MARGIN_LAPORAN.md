# Perbaikan Margin Laporan — Pisahkan dari Buku Kas

Tanggal: 2026-08-06
Metode: baca `laporanController.js` + `laporan.html`, cari semua tempat
angka "margin"/"profit" ditampilkan. Test via API: buat order dgn HPP jelas,
catat kas keluar besar, verifikasi angka margin TIDAK ikut kas.

---

## Root Cause

Halaman Laporan punya **tiga metrik yang seharusnya independen**:

1. **Omset** — `SUM(transaksi.total_bayar)` untuk periode.
2. **Profit/Margin Layanan** — `SUM(omset_layanan − HPP × volume)` per layanan
   yang terjual. MURNI dari `detail_transaksi` × `layanan.hpp`.
3. **Laba Rugi (Kas)** — `SUM(kas_masuk) − SUM(kas_keluar)`. Mencakup
   pengeluaran operasional non-HPP (beli alat, listrik, gaji, dll).

Metrik #2 (Profit/Margin per layanan) dan #3 (Laba Rugi Kas) adalah dua hal
yang secara konseptual berbeda. Kas keluar Rp 500.000 untuk beli alat baru
TIDAK mengubah margin per layanan — margin tetap `(harga_jual − HPP) / harga_jual`
per unit yang terjual.

**Bug:** `public/pages/laporan.html:824` (kartu "Margin" di mobile-KPI strip):

```js
mkMargin.textContent = 'Rp' + short(laba_rugi?.laba || 0);
```

Kartu berlabel "Margin" ternyata mengambil dari `laba_rugi.laba` yang berasal
dari **tabel kas** (`kas.masuk − kas.keluar`), bukan dari HPP layanan. Setiap
kali operator catat pengeluaran kas, kartu Margin ikut turun — walaupun margin
per layanan tidak berubah sedikit pun.

Tempat lain sudah correct:
- `renderProfitabilitas` (line 974-1060) — hitung `estProfit = omset − hpp × vol`
  dan `marginPct = estProfit / omset × 100` per layanan. Tidak menyentuh kas.
- Section "Laba Rugi (Kas)" (line 926-947) — memang sengaja pakai kas, sudah
  diberi label jelas dan disclaimer "* Berdasarkan entri buku kas pada periode ini".
- Backend `laporanController.js`:
  - `laba_rugi` (line 162-166) — sengaja dari kas, dipakai section Laba Rugi.
  - `distribusi_layanan` (line 48-63) — return raw `hpp` dan `margin_persen`
    per layanan, frontend yang hitung margin.

---

## Fix Diterapkan

`public/pages/laporan.html` — kartu Margin di mobile-KPI strip sekarang
menghitung profit MURNI dari HPP layanan (bukan `laba_rugi.laba`):

```diff
-    mkMargin.textContent = 'Rp' + short(laba_rugi?.laba || 0);
+    // Margin/profit MURNI dari layanan (omset − HPP×volume) — TIDAK boleh
+    // ikut kas masuk/keluar (buku kas mencatat operasional non-HPP seperti
+    // beli alat, bayar listrik yg tidak berhubungan dgn margin per layanan).
+    // Metrik "Laba/Rugi Kas" adalah kartu terpisah di seksi Laba Rugi.
+    const profitLayanan = (distribusi_layanan || []).reduce((sum, r) => {
+      const hpp   = Number(r.hpp) || 0;
+      const vol   = Number(r.total_jumlah) || 0;
+      const omset = Number(r.total_omset)  || 0;
+      // Layanan tanpa HPP di-skip (tidak bisa dihitung profit-nya)
+      return hpp > 0 ? sum + (omset - hpp * vol) : sum;
+    }, 0);
+    mkMargin.textContent = 'Rp' + short(profitLayanan);
```

Rumus per layanan:
```
profit_layanan = omset_layanan − (hpp × volume)
              = SUM(qty × harga_satuan) − (hpp × SUM(qty))
```
Layanan tanpa HPP di-skip (tidak bisa dihitung).

Backend `laporanController.js` **TIDAK diubah** — sudah correct, memisahkan
`laba_rugi` (dari kas) dan `distribusi_layanan` (yang punya HPP) sebagai dua
field independen. Section "Laba Rugi (Kas)" di UI juga tidak diubah — memang
sengaja dari kas dan sudah berlabel jelas.

---

## Test Verifikasi (via HTTP API + hitung manual)

### Setup
- Layanan Cuci Kering: harga Rp 9.000/kg, HPP Rp 5.000/kg (margin 44.4%)
- Pelanggan test id=1

### Baseline (hari ini, sebelum data test)
```
omset: 0, jumlah: 0
laba_rugi (kas): pendapatan=0, pengeluaran=0, laba=0
```

### STEP 1: Buat order 5kg Cuci Kering (Rp 45.000)
```
omset: 45.000, jumlah: 1
laba_rugi (kas): pendapatan=45000, pengeluaran=0, laba=45000
PROFIT LAYANAN (dari HPP): 20000   ← 45000 − 5×5000
```
Manual: profit = 45.000 − (5 × 5.000) = **20.000** ✓

### STEP 2: Catat kas keluar Rp 500.000 (beli alat — TIDAK terkait order)
```
omset: 45.000 (tetap)
laba_rugi (kas): pendapatan=45000, pengeluaran=500000, laba=-455000  ← turun 500k
PROFIT LAYANAN (dari HPP): 20000  ← TETAP, tidak berubah
```

**Sebelum fix**: kartu "Margin" di UI tampilkan `Rp -455rb` (mengikuti
`laba_rugi.laba`) — bikin operator bingung karena margin layanan sebenarnya
positif Rp 20.000.

**Setelah fix**: kartu "Margin" tampilkan `Rp 20rb` (profit murni dari HPP
layanan). Kas keluar Rp 500.000 tercermin hanya di section "Laba Rugi (Kas)"
sebagai laba turun Rp 500k — sesuai konsep dua metrik terpisah.

---

## Kesimpulan

1. **Kartu Margin** di mobile-KPI strip sekarang menampilkan **profit per
   layanan** (omset − HPP × volume) — TIDAK terpengaruh kas.
2. **Section "Laba Rugi (Kas)"** tetap tampil kas masuk-keluar seperti
   sebelumnya, dengan label & disclaimer yang jelas ("* Berdasarkan entri
   buku kas pada periode ini").
3. **Section "Profitabilitas Layanan"** (renderProfitabilitas) sudah correct
   dari awal — tidak diubah.
4. **Backend** tidak diubah — sudah correct memisahkan `laba_rugi` dan
   `distribusi_layanan` sebagai dua field independen.

Dua metrik ini sekarang benar-benar independen di UI.

---

## Cleanup

- 1 order test (id=97) dan 1 kas keluar test (id=69) dihapus dari DB.
- `layanan.hpp` untuk Cuci Kering dikembalikan ke baseline (5000, 44 —
  memang seperti baseline, tidak diubah oleh test).
- Baseline: MAX(transaksi.id)=36, saldo=29000, poin_pelanggan1=8.
