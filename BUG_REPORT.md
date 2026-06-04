# BUG REPORT — POS Laundry (Debug Sesi 2, 2026-06-04)

Debug menyeluruh dengan **pengujian live** (server berjalan, login, hit endpoint nyata).
Fokus: fitur baru yang ditambahkan setelah sesi 1 — **riwayat_bayar** & **biaya_tambahan**
(migration tertanggal 2026-06-04), serta **halaman Detail Order** dan **Pembayaran**.

Semua bug di bawah **sudah diperbaiki dan diverifikasi live**.

---

## Ringkasan

| # | Severity | File | Bug | Status |
|---|----------|------|-----|--------|
| 1 | **KRITIS** | `transaksiController.js` | Deadlock pool saat tambah/edit/hapus **item** pada order aktif | ✅ FIXED |
| 2 | **KRITIS** | `biayaTambahanController.js` | Deadlock pool saat tambah/edit/hapus **biaya tambahan** | ✅ FIXED |
| 3 | **KRITIS** | `deposit.model.js` | **Batalkan topup** selalu gagal (kolom kas salah) | ✅ FIXED |
| 4 | TINGGI | `transaksiController.js` | Recalc menulis ke kolom `estimasi_selesai` yang tidak ada + biaya tambahan hilang dari total | ✅ FIXED |
| 5 | SEDANG | `detail-order.html` | Estimasi selesai selalu tampil "—"; waktu diambil tidak pernah tampil | ✅ FIXED |

---

## Detail

### Bug #1 — KRITIS: Deadlock pool saat edit item order aktif
**File:** `src/controllers/transaksiController.js` (`recalculateOrderTotal`)
**Gejala:** `POST/PUT/DELETE /api/v1/transaksi/:id/item` → HTTP 500 `"Gagal menambah/mengupdate/menghapus item"`.
**Akar masalah:** Di dalam `db.transaction(async (trx) => {...})`, helper `recalculateOrderTotal`
memanggil `svc.getPoinSettings()` yang memakai koneksi **global `db`**, bukan `trx`.
Driver `better-sqlite3` pada knex hanya melayani satu koneksi pada satu waktu — permintaan
koneksi ke-2 saat transaksi masih terbuka menggantung sampai timeout:
> `KnexTimeoutError: Timeout acquiring a connection. The pool is probably full.`

**Bukti live (sebelum fix):**
```
POST /transaksi/25/item  → {"error":"Gagal menambah item"}
log: KnexTimeoutError ... at getPoinSettings (transaksiService.js:5)
        at recalculateOrderTotal (transaksiController.js:751)
```
**Perbaikan:** `getPoinSettings` kini menerima koneksi opsional (`getPoinSettings(conn = db)`);
recalc memanggil `svc.getPoinSettings(trx)`.
**Verifikasi:** add/update/delete item LULUS; total & estimasi ter-recalc benar.

---

### Bug #2 — KRITIS: Deadlock pool saat biaya tambahan
**File:** `src/controllers/biayaTambahanController.js` (`recalculateTransaksiWithBiaya`)
**Gejala:** `POST/PUT/DELETE /api/v1/transaksi/:id/biaya-tambahan` → HTTP 500.
**Akar masalah:** sama dengan Bug #1 — `svc.getPoinSettings()` (global `db`) dipanggil di dalam `trx`.
**Bukti live (sebelum fix):** `{"error":"Gagal menambah biaya tambahan"}` + `KnexTimeoutError`.
**Perbaikan:** ganti ke `svc.getPoinSettings(trx)`.
**Verifikasi:** biaya tambahan tersimpan, `total_harga`/`total_bayar` bertambah benar
(27000 → +5000 → 32000), tampil di detail order.

---

### Bug #3 — KRITIS: Batalkan topup deposit selalu gagal
**File:** `src/models/deposit.model.js` (`batalkanTopup`)
**Gejala:** `POST /api/v1/deposit/:id/batalkan-topup` → HTTP 400 `"Gagal membatalkan topup"`;
saldo & mutasi tidak pernah ter-rollback.
**Akar masalah:** insert ke tabel `kas` memakai nama kolom & nilai yang **salah**:
- `nominal:` → kolom sebenarnya `jumlah`
- `created_by:` → kolom sebenarnya `user_id`
- `jenis: 'pengeluaran'` → konvensi kas adalah `'masuk'`/`'keluar'` (laporan laba/rugi
  menjumlahkan `jenis='keluar'`, jadi refund tak akan terhitung)
- `tanggal: Date.now()` (angka ms-epoch) → kolom `kas.tanggal` disimpan string `'YYYY-MM-DD'`
  (filter laporan/kas membandingkan string)

Kolom tak dikenal membuat seluruh transaksi `batalkanTopup` gagal & rollback.
**Perbaikan:** `jumlah`, `user_id`, `jenis:'keluar'`, `tanggal: new Date().toISOString().slice(0,10)`,
tambah `updated_at`.
**Verifikasi live:** topup +50.000 (saldo 64.000) → batalkan → saldo kembali **14.000**;
kas tercatat `jenis=keluar jumlah=50000 tanggal=2026-06-04`.

---

### Bug #4 — TINGGI: Recalc item menulis kolom tak ada & menghilangkan biaya tambahan
**File:** `src/controllers/transaksiController.js` (`recalculateOrderTotal`)
**Bug 4a:** update menulis `estimasi_selesai: ...` padahal tabel `transaksi` tidak punya kolom
itu (kolom estimasi yang benar = `tanggal_selesai`). Ini akan melempar `no such column`
(tertutupi Bug #1 yang timeout lebih dulu, tapi tetap salah).
**Bug 4b:** `total_harga`/`total_bayar` dihitung **hanya dari item**, mengabaikan
`biaya_tambahan`. Akibatnya, mengedit item pada order yang punya biaya tambahan akan
**menghapus biaya tambahan dari total**.
**Perbaikan:** tulis ke `tanggal_selesai`; sertakan `SUM(biaya_tambahan.nominal)` ke
`total_harga` & `total_bayar` (konsisten dgn `biayaTambahanController`).
**Verifikasi:** estimasi ter-update sesuai `estimasi_hari` layanan terbesar; total tetap memuat
biaya tambahan setelah item diubah.

---

### Bug #5 — SEDANG: Detail Order — estimasi "—" & waktu diambil tak tampil
**File:** `public/pages/detail-order.html`
- Baris estimasi membaca `o.estimasi_selesai` (selalu `undefined`) → tampil **"—"**.
  Field yang benar dari API = `o.tanggal_selesai`. (Persyaratan AREA 4: "Estimasi selesai
  tampil bukan —".)
- Blok waktu diambil membaca `o.tanggal_diambil` padahal kolomnya `tanggal_ambil` → tak pernah tampil.
- Blok "waktu selesai" sebelumnya menampilkan kolom estimasi (`tanggal_selesai`) sebagai seolah
  waktu selesai aktual — menyesatkan (tidak ada kolom timestamp selesai aktual); blok dihapus.
**Perbaikan:** estimasi → `o.tanggal_selesai`; waktu diambil → `o.tanggal_ambil`.
**Verifikasi:** API `/transaksi/:id/detail` mengembalikan `tanggal_selesai` terisi → estimasi tampil.

---

## Area yang diuji & LULUS tanpa bug baru

- **AREA 1 Server/startup:** boot bersih, migration up-to-date, tabel terverifikasi, tanpa unhandled rejection.
- **AREA 2 Auth:** login OK; `/api/*` tanpa cookie → **401**; session via SQLite store (persisten).
- **AREA 3 Order baru:** create OK; nomor `LDR-YYYYMMDD-NNN`; total/diskon benar; mode
  Bayar Sekarang/DP/Bayar Nanti; bayar deposit; kelebihan→deposit; estimasi dari `estimasi_hari`.
- **AREA 4 Detail order:** item, harga, subtotal, biaya tambahan, riwayat bayar, estimasi tampil (setelah Bug #5).
- **AREA 5 Pembayaran:** lunasi (tunai/deposit), DP/cicilan, kelebihan→deposit, riwayat_bayar tercatat, kas tercatat.
- **AREA 6 Print:** endpoint `POST /:id/print` & `/:id/label` ada; frontend hit backend (bukan `window.print`);
  `printer.service` tanpa `.cut()` (feed `newLine` ×5 struk / ×3 label); gagal anggun tanpa pyusb.
- **AREA 7 WhatsApp:** `generateURL` default **business** → `api.whatsapp.com`; regular → `wa.me`.
- **AREA 8 Deposit:** topup, potong saldo, saldo tidak minus, mutasi tercatat, batalkan topup (Bug #3).
- **AREA 9 Poin:** `floor(total/poin_per_nominal)`, `poin_per_nominal=10000` → order Rp10.000 = 1 poin;
  hanya diberikan saat **lunas**; riwayat_poin tercatat. (Diuji: 2 order lunas → +2 poin, DP → 0 poin.)
- **AREA 10 Import/Export:** preview/konfirmasi/export layanan & pelanggan; deteksi duplikat benar.
- **AREA 11 Fitur tambahan:** backdate (`waktu_transaksi`) + tolak waktu masa depan; edit/hapus item & biaya
  (Bug #1/#2/#4); hapus order permanen (admin); batalkan topup (Bug #3); dashboard `selesai_hari_ini`.
- **AREA 12 UI:** fondasi responsif solid (sesi 1); tidak diubah di sesi ini.
- **AREA 13 Laporan & kas:** omset/laba-rugi/poin/distribusi/chart akurat; kas otomatis dari transaksi lunas; export CSV.
- **AREA 14 Keamanan:** password bcrypt (cost 12); validasi Joi di endpoint; DELETE hanya admin (`blockOperatorDelete`).

---

## Catatan / risiko diketahui (tidak diperbaiki — di luar scope perbaikan bug fungsional)

- **Hard-delete order tidak me-rollback poin & deposit:** `transaksi.destroy` menghapus
  transaksi/kas/riwayat_bayar/mutasi (tx-linked), tetapi **tidak** mengurangi
  `pelanggan.total_poin` / `riwayat_poin` yang sudah diberikan, dan tidak mengembalikan saldo
  deposit yang sudah dipotong. Hapus permanen sebaiknya jarang dipakai. (LOW–MEDIUM)
- **`poin_order.didapat` di detail order** dihitung `floor(total_bayar/poin_per_nominal)` tanpa cek
  lunas → menampilkan "poin didapat" meski order belum lunas (kosmetik). (LOW)
- **PUT `/transaksi/:id`** (update generik dgn `bayar`) memberi kas+poin saat menjadi lunas, tapi
  **tidak** men-set `tanggal_lunas`/`total_dibayar`. Jalur pembayaran utama (`/lunasi`) sudah benar. (LOW)
- **`omset`** di laporan = `SUM(total_bayar)` semua order non-batal (nilai order ter-booking),
  berbeda dari `kas masuk` (uang diterima). Ini definisi yang sah, bukan bug. (INFO)
- **Import layanan** hanya menerima satuan `kg`/`pcs`, padahal seed memakai `item`/`meter`/`pasang`.
  Re-import hasil export bisa ditolak. Pertimbangkan memperluas `SATUAN_VALID`. (LOW)
