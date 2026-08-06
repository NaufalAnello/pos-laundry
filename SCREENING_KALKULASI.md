# Screening Modul Kalkulasi Transaksi

Tanggal: 2026-08-06
Metode: peta semua titik kalkulasi (backend + frontend) → jalankan HTTP test
dengan admin session ke API `/api/v1/transaksi/*`, `/api/v1/transaksi/:id/diskon`,
`/api/v1/transaksi/:id/biaya-tambahan`, `/api/v1/transaksi/:id/item*`, dan
`/api/v1/transaksi/:id/lunasi` — bandingkan angka respons vs hitungan manual.
Setelah fix, re-run tiap skenario yang mengubah kode.

Semua test data (order id > 36 baseline) dihapus di akhir screening.

---

## Peta Titik Kalkulasi

| Fungsi / Site                                                             | Peran                                                    |
|---------------------------------------------------------------------------|----------------------------------------------------------|
| `services/transaksiService.js::hitungTotal`                               | Central: subtotal item + diskon + diskonPoin → totalBayar |
| `controllers/transaksiController.js::store`                               | Create order: panggil hitungTotal, hitung kembalian, DP  |
| `controllers/transaksiController.js::update` / `updateStatus`             | Kembalian saat bayar diubah                              |
| `controllers/transaksiController.js::lunasi`                              | Sisa = `Math.max(0, Math.round(total - dibayar))`, kembalian |
| `controllers/transaksiController.js::updateDiskon`                        | Update diskon di order existing (persen/nominal)         |
| `controllers/transaksiController.js::recalculateOrderTotal`               | Recompute setelah add/edit/delete item                   |
| `controllers/biayaTambahanController.js::recalculateTransaksiWithBiaya`   | Recompute setelah tambah/edit biaya tambahan             |
| `controllers/waController.js::tagihanList`                                | SQL `(t.total_bayar - t.bayar) as sisa_tagihan` (list tagihan) |
| `services/wa.service.js::buildNota` (`sisaTagihan`)                       | `Math.max(0, Math.round(total - bayar))` untuk pesan WA  |
| Frontend `public/pages/order.html::calcTotal`                             | Preview live di form order baru                          |
| Frontend `public/pages/order.html::updateDpPreview`                       | Preview DP + sisa                                        |
| Frontend `public/js/lunasi-sheet.js`                                      | `Math.max(0, Math.round(total - dibayar))` (KONSISTEN)   |

**Aturan bisnis yang ditegakkan:**
- Diskon berlaku HANYA untuk subtotal item layanan. Biaya tambahan
  (antar-jemput, pewangi premium, dll) TIDAK didiskon dan ditambahkan
  ke total_bayar setelah diskon diterapkan.
- Sisa tagihan wajib dihitung dengan `Math.max(0, Math.round(...))`
  di setiap titik untuk menghindari floating point residue & negatif.

---

## Ringkasan Temuan

| # | Skenario / Bug                                                             | Status               |
|---|----------------------------------------------------------------------------|----------------------|
| 1 | 1 item, bayar pas → lunas                                                  | Sudah benar          |
| 2 | Bayar lebih, kembalian tunai                                               | Sudah benar          |
| 2b| Bayar lebih, kelebihan ke deposit                                          | Sudah benar          |
| 3 | Diskon nominal = subtotal → total_bayar 0                                  | Sudah benar          |
| 4 | Diskon nominal > subtotal — sebelumnya LOLOS jadi diskon "hantu"           | **BUG DIPERBAIKI**   |
| 5 | Diskon persen dgn subtotal ganjil (qty 5.55 kg → Math.round dari 4994.999) | Sudah benar          |
| 6 | Biaya tambahan + diskon persen via `updateDiskon` — hitung diskon dari (item+biaya), tidak konsisten dgn service | **BUG DIPERBAIKI**   |
| 7 | DP 50%: sisa konsisten di detail, WA nota, tagihan list                    | Sudah benar          |
| 8 | Lunasi DP dengan bayar pas → status jadi lunas                             | Sudah benar          |
| 9 | Lunasi pakai deposit → saldo terpotong exact                               | Sudah benar          |
| C | `updateDiskon` — nilaiPerPoin hardcoded 100 (harusnya dari settings)       | **BUG DIPERBAIKI**   |
| D | Diskon manual HILANG setelah edit item / tambah biaya tambahan             | **BUG DIPERBAIKI**   |

---

## Detail per Temuan

### BUG 4 — Diskon nominal > subtotal lolos disimpan (diskon "hantu")

**Skenario:** POST `/api/v1/transaksi` dengan `items: [{ layanan_id:1, jumlah:2 }]`
(subtotal Rp 18.000) + `diskon_tipe: "nominal"`, `diskon_nilai: 25000`.

**Aktual (sebelum fix):**
```json
{ "message": "Transaksi berhasil dibuat",
  "data": { "total_harga": 18000, "diskon": 25000, "total_bayar": 0 } }
```
`total_bayar` benar dikepras ke 0 oleh `Math.max`, tapi field `diskon` tersimpan
Rp 25.000 di database. Ini akan tampil aneh di struk & WA nota:
"Diskon Rp 25.000" dari total item Rp 18.000. Data corrupt.

**Root cause:** Tidak ada validasi max(diskon) = subtotal item di `store` maupun
di `updateDiskon`. Joi cuma cek `min(0)`.

**Fix diterapkan:**
- `store`: guard sebelum panggil `hitungTotal`:
  ```js
  const subtotalItems = resolvedItems.reduce((s, it) => s + Number(it.subtotal), 0);
  if (value.diskon_tipe === 'nominal' && value.diskon_nilai > subtotalItems) {
    return res.status(400).json({ error: `Diskon (Rp X) melebihi subtotal layanan (Rp Y)` });
  }
  ```
- `updateDiskon`: cek `diskon > totalItem` setelah hitung diskon (menangani
  nominal & persen — untuk persen normal tidak akan lewat karena max 100%,
  tapi safety net).

**Re-test:**
```
[HTTP=400] {"error":"Diskon (Rp 25.000) melebihi subtotal layanan (Rp 18.000)"}
```
**Status:** BUG DIPERBAIKI.

---

### BUG 6 — `updateDiskon` hitung diskon persen dari (item + biaya tambahan)

**Skenario:** Order dengan item Rp 18.000 + biaya tambahan Rp 5.000 (subtotal item
= 18.000). Set diskon 10% via PUT `/api/v1/transaksi/:id/diskon`.

**Aktual (sebelum fix):**
```
diskon = 2300 (= 10% × 23000 [item+biaya])
total_bayar = 20700
```

**Seharusnya (aturan bisnis: biaya tambahan tidak didiskon):**
```
diskon = 1800 (= 10% × 18000 [item saja])
total_bayar = 18000 - 1800 + 5000 = 21200
```

**Root cause:** `updateDiskon` mendefinisikan `subtotal = totalItem + totalBiayaTambahan`
dan pakai variable itu sebagai basis diskon persen. Padahal `hitungTotal` di
service pakai `SUM(items.subtotal)` saja. Dua rumus beda → hasil beda tergantung
via mana user set diskon.

**Fix diterapkan** (`transaksiController::updateDiskon`):
```js
// Basis diskon = totalItem (biaya tambahan tidak didiskon)
if (value.tipe === 'persen') diskon = Math.round(totalItem * value.nilai / 100);
// total_bayar = (item - diskon) + biaya tambahan
const totalBayar = Math.max(0, totalItem - diskon - nilaiPoin) + totalBiayaTambahan;
```

**Re-test:**
```
diskon=1800, total_bayar=21200  ✓
```
**Status:** BUG DIPERBAIKI.

---

### BUG C — `updateDiskon` hardcode nilaiPerPoin = 100

**Skenario:** Jika settings `nilai_tukar_poin` di-tune ke nilai selain 100
(mis. 150), `updateDiskon` tetap pakai 100 → total_bayar salah untuk order yang
pakai `poin_digunakan`.

**Aktual (sebelum fix):**
```js
const nilaiPoin = (transaksi.poin_digunakan || 0) * 100;
```

**Fix diterapkan:**
```js
const settings = await svc.getPoinSettings();
const nilaiPoin = (transaksi.poin_digunakan || 0) * settings.nilaiPerPoin;
```

**Status:** BUG DIPERBAIKI. (Tidak ada test aktif dgn setting non-default, tapi
konsisten dengan `hitungTotal` service — verified via inspection.)

---

### BUG D — Diskon manual HILANG saat edit item / tambah biaya tambahan

**Skenario A — persen, add item:**
Buat order dgn diskon 10% (item Rp 18.000 → diskon 1800, total_bayar 16200).
POST `/api/v1/transaksi/:id/item` untuk tambah item Rp 12.000 (2 × Rp 6.000).

**Aktual (sebelum fix):**
```
total_harga = 30000
diskon = 1800   (STALE, dari total item lama)
total_bayar = 30000   (recomputed TANPA diskon)
```
Field `diskon` tersimpan 1800 tapi `total_bayar` sama sekali TIDAK mengurangi
diskon → user lihat "diskon Rp 1.800" di struk tapi total tetap 30.000. Data
inconsistent parah.

**Skenario B — persen, update qty item:**
Lanjut edit item pertama jadi qty 5. Expected total_harga = 45000 + 12000 = 57000,
diskon = 5700 (10%), total_bayar = 51300.

**Aktual (sebelum fix):**
```
total_harga = 57000, diskon = 1800, total_bayar = 57000
```
Sama, diskon tidak ikut re-scale.

**Skenario C — nominal, add biaya tambahan:**
Buat order dgn diskon nominal Rp 3.000 (item 18000 → total_bayar 15000).
POST biaya tambahan Rp 4.000. Expected total_bayar = 15000 + 4000 = 19000
(nominal absolut dipertahankan).

**Aktual (sebelum fix):** total_bayar hilang diskon-nya juga.

**Root cause:** Baik `recalculateOrderTotal` (di transaksiController) maupun
`recalculateTransaksiWithBiaya` (di biayaTambahanController) memanggil
`svc.hitungTotal(items, promo?, poin, nilaiPerPoin)` TANPA argument
`diskonManual`. `hitungTotal` cuma tahu promo (yang di-wrap `{ diskon_nominal }`),
sehingga order yang pakai diskon MANUAL kehilangan diskonnya. Field `diskon`
tersimpan lama tidak dihapus → data inconsistent.

**Fix diterapkan** (di kedua helper, pola identik):
```js
// Pertahankan diskon manual yang sudah ada:
//   - persen: re-scale ke totalItem baru
//   - nominal: pertahankan angka, cap ke min(diskon, totalItem)
let diskonManual = null;
const diskonPersenLama = Number(transaksi.diskon_persen) || 0;
if (!transaksi.paket_promo_id) {
  if (transaksi.diskon_tipe === 'persen' && diskonPersenLama > 0) {
    diskonManual = { tipe: 'persen', nilai: diskonPersenLama };
  } else if (Number(transaksi.diskon) > 0) {
    diskonManual = { tipe: 'nominal',
      nilai: Math.min(Number(transaksi.diskon), totalItem) };
  }
}
const { totalBayar, diskon, diskonTipe, diskonPersen } = svc.hitungTotal(
  items, promoWrapper, poin, settings.nilaiPerPoin, diskonManual
);
// UPDATE juga field diskon/diskon_tipe/diskon_persen agar konsisten dengan total_bayar
```

**Re-test:**
```
Skenario A: total_harga=30000, diskon=3000, total_bayar=27000  ✓
Skenario B: total_harga=57000, diskon=5700, total_bayar=51300  ✓
Skenario C: total_harga=22000, diskon=3000, total_bayar=19000  ✓
```
**Status:** BUG DIPERBAIKI.

---

## Skenario yang Sudah Benar (verifikasi baris per baris)

### TEST 1 — Lunas
POST 2 kg × Rp 9.000, bayar Rp 18.000 → `total_bayar=18000, kembalian=0,
tanggal_lunas` terisi.

### TEST 2 — Bayar lebih, kembalian tunai
Bayar Rp 20.000 dari total Rp 18.000, `kelebihan_ke_deposit=false` →
`kembalian=2000`. Deposit tidak berubah.

### TEST 2b — Bayar lebih, kelebihan ke deposit
`kelebihan_ke_deposit=true` → `kembalian=0`, `deposit_info={kelebihan:2000,jenis:"kelebihan"}`,
saldo naik dari 29.000 → 31.000. Tidak double-count (kembalian TIDAK juga tercatat
sebagai piutang keluar).

### TEST 3 — Diskon = subtotal (edge)
`diskon_nilai=18000` untuk subtotal 18.000 → `total_harga=18000, diskon=18000,
total_bayar=0, kembalian=0`. Tidak error, tidak negatif.

### TEST 5 — Floating point (subtotal ganjil)
- Case 15% × 24000 → diskon 3600 exact.
- Case qty 5.55 kg × Rp 6000 = 33.300, diskon 15% = 4994.999... →
  `Math.round` → 4995. Total_bayar = 28305, kembalian dari 30.000 = 1695. Bersih
  tanpa residu.

### TEST 7 — DP dan konsistensi sisa
DP Rp 18.000 dari total Rp 36.000. Sisa Rp 18.000 tampil KONSISTEN di:
- Response `POST /transaksi` (`total_bayar - bayar = 18000`)
- `GET /transaksi/:id/detail`
- SQL raw di `wa/tagihan` (`sisa_tagihan = 20700` untuk order lain yg diverifikasi)
- WA nota (`⚠️ *Sisa Tagihan: Rp 18.000* (bayar saat ambil)`)

### TEST 8 — Lunasi DP dengan bayar pas
`nominal_diterima=18000` (= sisa) → `lunas=true, bayar=36000, kembalian=0,
tanggal_lunas` terisi. Sisa 0 di semua endpoint.

### TEST 9 — Lunasi pakai deposit
DP order sisa Rp 10.000. `metode_bayar=deposit`, `nominal_diterima=10000` →
saldo turun tepat Rp 10.000 (31.000 → 21.000), `saldo_deposit_baru=21000`.
Mutasi_deposit tercatat `nominal=10000, saldo_sebelum=31000, saldo_sesudah=21000`.

---

## Diff Akhir

```diff
--- src/controllers/transaksiController.js
+++ src/controllers/transaksiController.js
@@ store (setelah resolve items)
+  // Validasi diskon nominal manual tidak melebihi subtotal item
+  const subtotalItems = resolvedItems.reduce((s, it) => s + Number(it.subtotal), 0);
+  if (value.diskon_tipe === 'nominal' && value.diskon_nilai > subtotalItems) {
+    return res.status(400).json({ error: 'Diskon melebihi subtotal layanan' });
+  }

@@ updateDiskon
-  const subtotal = totalItem + totalBiayaTambahan;
-  diskon = Math.round(subtotal * value.nilai / 100);
-  const nilaiPoin = (transaksi.poin_digunakan || 0) * 100;
-  const totalBayar = Math.max(0, subtotal - diskon - nilaiPoin);
+  diskon = Math.round(totalItem * value.nilai / 100);   // basis: item saja
+  if (diskon > totalItem) return 400 error;             // cap validation
+  const settings = await svc.getPoinSettings();
+  const nilaiPoin = (transaksi.poin_digunakan || 0) * settings.nilaiPerPoin;
+  const totalBayar = Math.max(0, totalItem - diskon - nilaiPoin) + totalBiayaTambahan;

@@ recalculateOrderTotal
+  // Rebuild diskonManual dari kolom transaksi supaya diskon tidak hilang
+  let diskonManual = null;
+  if (!transaksi.paket_promo_id) {
+    if (transaksi.diskon_tipe === 'persen' && diskonPersen > 0) {
+      diskonManual = { tipe: 'persen', nilai: diskonPersen };
+    } else if (Number(transaksi.diskon) > 0) {
+      diskonManual = { tipe: 'nominal', nilai: Math.min(transaksi.diskon, totalItem) };
+    }
+  }
-  const { totalBayar } = svc.hitungTotal(items, promo, poin, nilaiPerPoin);
+  const { totalBayar, diskon, diskonTipe, diskonPersen } = svc.hitungTotal(
+    items, promo, poin, nilaiPerPoin, diskonManual);
-  await trx('transaksi').update({ total_harga, total_bayar, tanggal_selesai });
+  await trx('transaksi').update({ total_harga, diskon, diskon_tipe, diskon_persen,
+                                   total_bayar, tanggal_selesai });

--- src/controllers/biayaTambahanController.js
+++ src/controllers/biayaTambahanController.js
@@ recalculateTransaksiWithBiaya
   (perubahan simetris dengan recalculateOrderTotal di atas)
```
