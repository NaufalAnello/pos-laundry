# Screening Modul Sistem Pembayaran

Tanggal: 2026-08-06
Metode: peta semua endpoint pembayaran → jalankan HTTP test dengan admin
session (langsung ke API + verifikasi state di DB sqlite). Semua data test
di-cleanup di akhir screening; saldo deposit & poin di-reset ke baseline.

Baseline sebelum screening (untuk cleanup):
- `MAX(transaksi.id) = 36`, `MAX(mutasi_deposit.id) = 18`, `MAX(kas.id) = 21`
- `deposit_pelanggan.saldo` pelanggan 1 = Rp 29.000
- `pelanggan.total_poin` pelanggan 1 = 8

---

## Peta Endpoint Pembayaran

| Endpoint / Fungsi                                             | Peran                                                    |
|---------------------------------------------------------------|----------------------------------------------------------|
| `POST /api/v1/transaksi` (`transaksiController.store`)        | Bayar sekarang / DP / bayar-nanti. Deposit sebagai metode utama & handling kekurangan |
| `PUT  /api/v1/transaksi/:id/lunasi` (`transaksiController.lunasi`) | Pelunasan sisa DP: tunai/transfer/qris/deposit; opsional kelebihan ke deposit |
| `PUT  /api/v1/transaksi/:id` (`transaksiController.update`)   | Update bayar → kembalian recompute                       |
| `PUT  /api/v1/transaksi/:id/status`                           | Bayar bersamaan dengan ubah status → kembalian recompute |
| `POST /api/v1/deposit/:pelangganId/topup`                     | Topup saldo (tunai/transfer/qris)                        |
| `POST /api/v1/deposit/:pelangganId/batalkan-topup` (owner)    | Refund topup dengan validasi                             |
| `depositModel.getSaldo / topup / bayar / tambahKelebihan / batalkanTopup` | Model layer — semua tulis di `db.transaction` |

---

## Ringkasan Temuan

| # | Skenario                                                                     | Status               |
|---|------------------------------------------------------------------------------|----------------------|
| 1 | Saldo Rp 30k, order Rp 50k, bayar-sekarang deposit → tolak                   | Sudah benar          |
| 2 | Saldo Rp 30k, order Rp 50k, DP Rp 30k pakai deposit → sukses                 | Sudah benar          |
| 3 | Saldo Rp 50k, order Rp 30k, bayar deposit lunas → saldo sisa Rp 20k          | Sudah benar          |
| 4 | Topup 100k, pakai 60k, batalkan topup 100k → ditolak                         | Sudah benar          |
| 5 | Bayar Rp 100k order Rp 70k `kelebihan_ke_deposit=true` → saldo +30k, kembalian 0 | Sudah benar    |
| 6 | Bayar Rp 100k order Rp 70k tanpa opsi → kembalian 30k tunai, saldo 0         | Sudah benar          |
| 7 | Lunasi DP sisa Rp 20k pakai deposit saldo Rp 20k → saldo 0 exact             | Sudah benar          |
| B | **DP saldo cukup >> DP → saldo terpotong LEBIH dari DP**                     | **BUG DIPERBAIKI**   |

---

## Detail Skenario

### TEST 1 — Bayar deposit, saldo tak cukup (ditolak)

POST `/api/v1/transaksi` dgn saldo pelanggan Rp 30.000, order Rp 50.000,
`payment_mode=bayar-sekarang`, `metode_bayar=deposit`, tanpa `metode_kekurangan`.

**Aktual:**
```
HTTP 400
{"error":"Saldo tidak cukup (Rp 30.000). Kekurangan Rp 20.000",
 "saldo":30000,"kekurangan":20000}
saldo_sebelum=30000, saldo_sesudah=30000  (tidak berubah)
```
**Status:** Sudah benar. Validasi di `store` line 189-207.

---

### TEST 2 — DP Rp 30k pakai deposit (saldo pas Rp 30k)

Saldo 30k, order 50k, DP diminta 30k pakai deposit.

**Aktual:**
```
HTTP 201
transaksi: total_bayar=50000, bayar=30000, kembalian=0, status=pending
mutasi_deposit: jenis=bayar, nominal=30000, saldo_sebelum=30000, saldo_sesudah=0
```
Sisa Rp 20.000 tercatat sebagai piutang biasa (`total_bayar - bayar`), bukan
piutang deposit.
**Status:** Sudah benar.

---

### TEST 3 — Bayar deposit LUNAS (saldo lebih dari cukup)

Saldo 50k, order 30k, bayar-sekarang deposit.

**Aktual:**
```
transaksi: total_bayar=30000, bayar=30000, kembalian=0, tanggal_lunas terisi (lunas=1)
mutasi_deposit: jenis=bayar, nominal=30000, saldo_sebelum=50000, saldo_sesudah=20000
```
**Status:** Sudah benar.

---

### TEST 4 — Batalkan topup yang saldo-nya sudah terpakai

Skenario: topup 100k → saldo 100k, lalu bayar order 60k pakai deposit → saldo 40k,
lalu coba batalkan topup 100k.

**Aktual:**
```
POST /deposit/1/batalkan-topup HTTP 400
{"error":"Tidak bisa dibatalkan — saldo deposit sudah digunakan. Saldo saat ini: Rp 40.000"}
saldo_final=40000 (tidak berubah, tidak jadi negatif -60000)
```
Validasi ada di `depositModel.batalkanTopup` (line 169-172): `if (saldoSekarang <
nominalTopup) throw ...`. Termasuk juga validasi max 7 hari dan `is_dibatalkan=false`.
**Status:** Sudah benar.

---

### TEST 5 — Kelebihan bayar tunai ke deposit (opt-in)

Order Rp 70k, bayar tunai Rp 100k, `kelebihan_ke_deposit=true`.

**Aktual:**
```
transaksi: total_bayar=70000, bayar=100000, kembalian=0  (bukan 30000)
saldo_sebelum=0, saldo_sesudah=30000  (naik tepat 30k)
mutasi_deposit: jenis=kelebihan, nominal=30000, saldo_sebelum=0, saldo_sesudah=30000
```
Yang masuk deposit adalah **selisih** (bayar − total = 30.000), bukan nominal
bayar penuh (100.000). Kembalian tunai di `bayar` disimpan 0 supaya struk tidak
memberi kembalian ganda.
**Status:** Sudah benar.

---

### TEST 6 — Kelebihan bayar tunai TANPA opsi ke deposit (default)

Sama seperti TEST 5 tapi `kelebihan_ke_deposit=false`.

**Aktual:**
```
transaksi: total_bayar=70000, bayar=100000, kembalian=30000  (tunai)
saldo_sebelum=0, saldo_sesudah=0  (tidak berubah)
mutasi_deposit: 0 rows untuk transaksi ini
```
Sistem tidak menambah deposit tanpa persetujuan operator (opsi harus di-tick
eksplisit di UI).
**Status:** Sudah benar.

---

### TEST 7 — Floating point pada saldo akhir (lunasi deposit exact)

DP Rp 40k dari total Rp 60k pakai tunai (sisa Rp 20k). Saldo deposit di-set Rp 20k.
Lunasi pakai deposit `nominal_diterima=20000`.

**Aktual:**
```
saldo_final: 0.0 (SQLite storage: real, value 0.0 exact — bukan 1e-10 residu)
transaksi: bayar=60000, kembalian=0, tanggal_lunas terisi (lunas=1)
```
`lunasi` menghitung `sisa = Math.max(0, Math.round(total - dibayar))`, deposit
model kurangi saldo dgn `saldoSebelum - nominal` (integer arithmetic karena
Math.round di atas → saldo = 0 exact).
**Status:** Sudah benar.

---

### BUG BONUS — DP + deposit: saldo terpotong lebih dari nominal DP

**Skenario:** Saldo Rp 40.000, order Rp 50.000, DP diminta Rp 30.000 pakai deposit.

**Aktual (sebelum fix):**
```
transaksi: total_bayar=50000, bayar=30000, kembalian=0
saldo_sebelum=40000, saldo_sesudah=0    ← turun 40k padahal DP cuma 30k!
mutasi_deposit: jenis=bayar, nominal=40000
```
**Delta Rp 10.000 hilang dari saldo deposit tanpa direfleksikan di kolom `bayar`
transaksi.** Pelanggan kehilangan Rp 10.000 tanpa jejak di order.

**Yang seharusnya:**
```
transaksi.bayar=30000
mutasi_deposit.nominal=30000, saldo_sesudah=10000
```

**Root cause:** Di `transaksiController::store` block "Deposit: potong saldo",
line 341 (sebelum fix):
```js
const potongDepo = Math.min(saldo, totalBayar);
```
Untuk DP mode, `nominalDiminta = value.bayar` (DP amount), bukan `totalBayar`.
Tapi `potongDepo` pakai `totalBayar` sebagai batas atas — sehingga kalau saldo
> DP, saldo tetap terpotong sebesar min(saldo, totalBayar), bukan sebesar DP.

Kebetulan pattern tidak muncul di TEST 2 karena di sana saldo = DP = 30k → Math.min
kebetulan return 30k. Kebetulan juga tidak muncul di TEST 3 karena bayar penuh
(bayarFinal = totalBayar). Bug hanya muncul kalau saldo > DP dan DP < totalBayar.

Validasi awal di line 189-208 sebelumnya SUDAH benar untuk `nominalDiminta =
value.bayar` — tapi pemotongan aktual tidak konsisten.

**Fix diterapkan** (`transaksiController.js:341`):
```js
// Potong deposit sebesar bagian yang REAL dibayar dari saldo:
//   - DP + saldo cukup: bayarFinal = nominalDP → potong nominalDP.
//   - Bayar penuh + saldo cukup: bayarFinal = totalBayar → potong totalBayar.
//   - Kombinasi (saldo tak cukup + kekurangan): bayarFinal = saldo + kekurangan,
//     Math.min → saldo (semua saldo dipotong, sisanya dari metode kekurangan).
const potongDepo = Math.min(saldo, bayarFinal);
```

**Re-test setelah fix (server restart):**
| Skenario                                           | saldo_sebelum | bayar_di_trx | mutasi.nominal | saldo_sesudah | OK? |
|----------------------------------------------------|---------------|--------------|----------------|---------------|-----|
| DP 30k, saldo 40k                                  | 40000         | 30000        | 30000          | 10000         | ✓   |
| DP 30k, saldo 30k (test 2 reg)                     | 30000         | 30000        | 30000          | 0             | ✓   |
| Bayar penuh 30k, saldo 50k (test 3 reg)            | 50000         | 30000        | 30000          | 20000         | ✓   |
| Kombinasi: DP 25k, saldo 10k, kekurangan tunai 15k | 10000         | 25000        | 10000          | 0             | ✓   |

**Status:** BUG DIPERBAIKI.

---

## Catatan Race Condition & Konsistensi

**Deposit model transaction safety:**
- `depositModel.bayar` re-membaca saldo INSIDE `db.transaction` dan `throw` kalau
  `saldoSebelum < nominal`. Jadi walaupun controller sudah cek saldo di luar trx
  (`getSaldo` biasa), race di dalam trx tetap ter-protect: kalau permintaan lain
  memotong saldo di antara `getSaldo` dan `bayar()`, trx yang belakangan akan
  throw dan controller mengembalikan 500 — data tidak korup.
- `better-sqlite3` menyerialkan write di SQLite level (single writer), jadi
  kesempatan race sangat kecil, dan trx re-check menjamin integritas.

**`kelebihan_ke_deposit` (di `store`):** cek `value.metode_bayar !== 'deposit'`
lebih dulu — jadi tidak ter-double-count untuk metode deposit.

**`lunasi` deposit + kelebihan_ke_deposit (edge yg tidak diuji):**
Kalau `nominal_diterima > sisa` DAN `metode_bayar=deposit` DAN
`kelebihan_ke_deposit=true`, kode saat ini akan potong deposit sebesar `sisa`
lalu tambah `kembalian` ke deposit — netnya deposit turun `sisa - kembalian` yg
bisa 0 atau bahkan bertambah kalau nominal >> sisa. UI (`lunasi-sheet.js` line
196) auto-fill `nominal = sisa` untuk metode deposit → edge ini tidak realistis
dalam flow normal, tapi patut dicatat untuk hardening ke depan.

---

## Diff Akhir

```diff
--- src/controllers/transaksiController.js (line ~341)
+++ src/controllers/transaksiController.js
@@ Deposit: potong saldo jika bayar pakai deposit
     const saldoRow   = await depositModel.getSaldo(pelanggan.id);
     const saldo      = Number(saldoRow.saldo);
-    const potongDepo = Math.min(saldo, totalBayar);
+    // Potong deposit sebesar bagian yang REAL dibayar dari saldo.
+    // - DP + saldo cukup: bayarFinal = nominalDP → potong nominalDP.
+    // - Bayar penuh + saldo cukup: bayarFinal = totalBayar → potong totalBayar.
+    // - Kombinasi (saldo tak cukup + kekurangan): bayarFinal = saldo + kekurangan,
+    //   Math.min → saldo (semua saldo dipotong, sisanya dari metode kekurangan).
+    const potongDepo = Math.min(saldo, bayarFinal);
     depositInfo = await depositModel.bayar({
       pelangganId:  pelanggan.id,
       nominal:      potongDepo,
```
