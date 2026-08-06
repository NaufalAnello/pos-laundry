# Screening State Machine Status Order

Tanggal: 2026-08-06
Metode: baca validasi `ALUR_VALID` di `transaksiController.updateStatus` +
jalankan 15 skenario transisi via HTTP API (7 valid + 8 invalid) dengan
force-set status via SQL DB untuk setup, lalu verifikasi respons API + status
akhir di DB. Plus backdoor test (PUT `/:id` dengan field `status`) dan test
Lunasi untuk order status `diambil`.

Aturan state machine (spec):
```
pending  → proses | selesai | dibatalkan
proses   → selesai | dibatalkan
selesai  → diambil | dibatalkan
diambil  → (final)
dibatalkan → (final)
```

Tombol "Lunasi" WAJIB muncul di SEMUA status kecuali `dibatalkan`, termasuk
saat `diambil` (kalau masih ada sisa tagihan).

---

## Peta Endpoint

| Endpoint / Fungsi                                       | Peran                          |
|---------------------------------------------------------|--------------------------------|
| `PUT /api/v1/transaksi/:id/status`                      | Satu-satunya endpoint yg legal untuk mengubah status |
| `PUT /api/v1/transaksi/:id` (`transaksiController.update`) | Update field non-status; block untuk `diambil`/`dibatalkan`; body `status` DIABAIKAN (allowed list filter) |
| `PUT /api/v1/transaksi/:id/lunasi`                      | Pelunasan sisa; hanya block `dibatalkan` (semua status lain — termasuk `diambil` — boleh lunasi) |
| `transaksiController.updateStatus::ALUR_VALID`          | Tabel transisi valid; guard `dibatalkan` di line awal |
| `transaksiModel.updateStatus`                           | SET `tanggal_ambil = now()` otomatis saat status → `diambil` |

---

## Hasil 15 Transisi (via HTTP)

### VALID (semua HTTP 200 & status berubah di DB)

| # | Skenario                    | HTTP | status_di_DB | Catatan                    |
|---|-----------------------------|------|--------------|----------------------------|
| 1 | pending → proses            | 200  | proses       | ✓                          |
| 2 | pending → selesai (skip)    | 200  | selesai      | ✓ Skip diperbolehkan       |
| 3 | pending → dibatalkan        | 200  | dibatalkan   | ✓                          |
| 4 | proses → selesai            | 200  | selesai      | ✓                          |
| 5 | proses → dibatalkan         | 200  | dibatalkan   | ✓                          |
| 6 | selesai → diambil           | 200  | diambil      | ✓ + `tanggal_ambil` ter-set otomatis |
| 7 | selesai → dibatalkan        | 200  | dibatalkan   | ✓                          |

### INVALID (semua HTTP 400 & status DI DB tidak berubah)

| # | Skenario                    | HTTP | Error message                                    |
|---|-----------------------------|------|--------------------------------------------------|
| 8 | selesai → pending           | 400  | `Tidak bisa mengubah status dari "selesai" ke "pending"` |
| 9 | selesai → proses            | 400  | `Tidak bisa mengubah status dari "selesai" ke "proses"`  |
| 10| proses → pending            | 400  | `Tidak bisa mengubah status dari "proses" ke "pending"`  |
| 11| diambil → selesai           | 400  | `Tidak bisa mengubah status dari "diambil" ke "selesai"` |
| 12| diambil → proses            | 400  | `Tidak bisa mengubah status dari "diambil" ke "proses"`  |
| 13| diambil → pending           | 400  | `Tidak bisa mengubah status dari "diambil" ke "pending"` |
| 14| diambil → dibatalkan        | 400  | `Tidak bisa mengubah status dari "diambil" ke "dibatalkan"` |
| 15a-d| dibatalkan → apapun      | 400  | `Transaksi sudah dibatalkan` (guard early-return) |

### BACKDOOR TEST (16)

`PUT /api/v1/transaksi/:id` dengan body `{status: "pending", catatan: "..."}`
untuk order status `selesai`:
- HTTP 200, `catatan` tersimpan.
- **status DI DB tetap `selesai`** — field `status` diabaikan karena tidak
  ada di `allowed = ['catatan','metode_bayar','bayar','antar_jemput',...]`.
- Guard endpoint juga block `diambil`/`dibatalkan` (line 401-402).

### LUNASI DIAMBIL (17)

Order status `diambil` dengan `total_bayar=20000, bayar=10000` (sisa 10.000).
`PUT /:id/lunasi` HTTP 200, `bayar` bertambah, status `diambil` TETAP.
Endpoint `lunasi` hanya block `dibatalkan` (line 478-480), status lain OK.

---

## Ringkasan Temuan

| # | Skenario                                                                | Status               |
|---|-------------------------------------------------------------------------|----------------------|
| 1-7 | 7 transisi valid                                                      | Sudah benar          |
| 8-15 | 8 transisi invalid                                                    | Sudah benar          |
| 16| Backdoor PUT /:id dengan status                                          | Sudah benar (diabaikan) |
| 17| Lunasi order status diambil (belum lunas)                                | Sudah benar          |
| **B**| Frontend `isLewat` (orders.html) & `isLewatEstimasi` (detail-order.html) mengeksklusi status `selesai` — badge/indikator "lewat waktu" hilang saat status jadi selesai meski pelanggan telat ambil | **BUG DIPERBAIKI** |

---

## BUG B — Badge "Lewat Waktu" hilang saat status = `selesai`

**Spec:** "Order status selesai TAPI belum diambil, dan sudah lewat tanggal
estimasi — cek badge/indikator lewat waktu tetap tampil dengan benar meski
statusnya sudah 'selesai' (bukan pending/proses)"

**Root cause:** `orders.html::isLewat` line 336-342 dan
`detail-order.html::isLewatEstimasi` line 641-647:
```js
if (!['pending','proses'].includes(t.status)) return false;
```
Kalau status = `selesai`, langsung return false → badge "Lewat" tidak tampil.
Kalau operator filter `Lewat Waktu` di orders.html, order selesai lewat
estimasi juga tidak muncul.

**Fix:** Tambahkan `'selesai'` ke whitelist status yang boleh dinilai lewat:
```js
if (!['pending','proses','selesai'].includes(t.status)) return false;
```
- Status `diambil` tetap TIDAK dianggap lewat (pelanggan sudah ambil,
  concern selesai).
- Status `dibatalkan` tetap TIDAK dianggap lewat (order batal, nothing to do).

**Re-test (Node semantic test):**
```
isLewat(selesai 2 hari lalu):    true    ✓ (sesuai spec)
isLewat(diambil, 2 hari lalu):   false   ✓ (spec: final state, tidak lewat)
isLewat(dibatalkan):             false   ✓
isLewat(pending, besok):         false   ✓ (belum lewat)
```

**Backend `lewat_waktu` query (dashboardController.js line 83-96)** tetap
pakai `whereIn(['pending','proses'])` — TIDAK diubah karena widget dashboard
sudah punya track terpisah **`belum diambil`** (via `selesai_hari_ini`
filtered by `!tanggal_ambil` → dirender di `renderPerluTindakan` sebagai
kartu "pickup"). Menambah selesai ke `lewat_waktu` query akan double-count
di widget dashboard. Fix di client-side isLewat mengcover kebutuhan badge di
grid Antrian & Detail Order sesuai spec.

**Status:** BUG DIPERBAIKI.

---

## Konsistensi Tombol Frontend (verified)

### `orders.html` (card & table)
| Status       | Primary btn      | Lunasi (kalau belum lunas) | WA | Label |
|--------------|------------------|----------------------------|----|-------|
| pending      | Proses           | ✓                          | ✓  | ✓     |
| proses       | Selesai          | ✓                          | ✓  | ✓     |
| selesai      | Diambil          | ✓                          | ✓  | ✓     |
| diambil      | —                | ✓ **(kalau belum lunas)**  | ✓  | ✓     |
| dibatalkan   | —                | —                          | —  | —     |

### `detail-order.html`
| Status       | Primary btn      | Lunasi | WA | Label | Struk | Batal |
|--------------|------------------|--------|----|-------|-------|-------|
| pending      | Proses           | ✓      | ✓  | ✓     | ✓     | ✓     |
| proses       | Selesai          | ✓      | ✓  | ✓     | ✓     | ✓     |
| selesai      | Diambil          | ✓      | ✓  | ✓     | ✓     | —     |
| diambil      | —                | ✓      | ✓  | ✓     | ✓     | —     |
| dibatalkan   | —                | —      | —  | ✓     | ✓     | —     |

Note: detail-order.html menampilkan tombol **Cetak Label** dan **Cetak Struk**
juga untuk status dibatalkan — ini untuk keperluan reprint historis (cetak
ulang dokumen order lama). Tombol "Batalkan Order" hanya untuk pending/proses,
konsisten dengan aturan.

### `dashboard.html` (widget Antrian Aktif)
- Query backend `antrian_aktif`: `whereIn(['pending','proses'])` → dibatalkan &
  diambil TIDAK muncul di widget ini.
- Tombol per card: `Proses` (pending), `Selesai` (proses), `Lunasi` (belum
  lunas), `WA`. Filter dibatalkan di card render tidak diperlukan karena
  query sudah menyaring.

---

## Widget "Perlu Tindakan" & "Lewat Waktu" (verified)

### Dashboard `renderPerluTindakan`
Dua track:
1. **`lewatWaktu`** — dari `d.lewat_waktu` (pending/proses lewat estimasi):
   tampil sebagai kartu "late" dengan pesan `Lewat estimasi X hari`.
2. **`belumDiambil`** — dari `selesai_hari_ini` yg `!tanggal_ambil`:
   tampil sebagai kartu "pickup" dengan pesan `Selesai {tgl} — belum diambil`.

Status `dibatalkan` **EXCLUDED dari kedua query** (`whereIn` filter). Verified.

### Orders.html filter pill "Lewat Waktu"
Setelah fix: filter ini sekarang menampilkan pending/proses/**selesai** yang
lewat estimasi. Kalau operator ingin lihat khusus "yang perlu dikejar",
mereka bisa kombinasi dengan filter status (Aktif / Selesai). Improvement
kalau perlu breakdown lebih detail bisa ditambah pill terpisah, tapi tidak
dalam scope screening ini.

---

## Interaksi dengan Fitur Lain

1. **Lunasi dari 3 titik untuk order `diambil`+belum lunas:**
   - Detail Order: tombol "Lunasi" muncul (guard `!lunas && !dibatalkan`) ✓
   - Halaman Tagihan: order `diambil`+belum lunas TIDAK muncul di
     `tagihan_belum_lunas` count di dashboard (`whereNotIn ['dibatalkan',
     'diambil']`), tapi endpoint `/api/v1/wa/tagihan` filter dengan
     `whereNotIn ['dibatalkan']` saja → **order diambil belum lunas MUNCUL
     di tagihan list**. Konsisten.
   - Dashboard antrian_aktif: order `diambil` tidak muncul (query pakai
     pending/proses). Untuk lunasi order diambil, operator harus buka lewat
     Tagihan/Detail. Konsisten dengan design.
2. **Order `dibatalkan` di widget dashboard:** EXCLUDED dari `antrian_aktif`,
   `selesai_hari_ini`, `lewat_waktu`, `tagihan_belum_lunas` — verified di
   query builder.
3. **Order `selesai` lewat estimasi belum diambil:**
   - Dashboard: muncul di "belum diambil" track (kartu pickup).
   - Orders grid & Detail Order: **setelah fix**, badge "Lewat" tampil ✓

---

## Diff Akhir

```diff
--- public/pages/orders.html
+++ public/pages/orders.html
@@ isLewat
- if (!['pending','proses'].includes(t.status)) return false;
+ // Include 'selesai' juga: kalau order sudah selesai tapi belum diambil dan
+ // sudah lewat tanggal estimasi, itu artinya pelanggan telat ambil — indikator
+ // "lewat waktu" tetap perlu tampil supaya operator tahu untuk follow-up.
+ // Status 'diambil' dan 'dibatalkan' TIDAK pernah dianggap lewat.
+ if (!['pending','proses','selesai'].includes(t.status)) return false;

--- public/pages/detail-order.html
+++ public/pages/detail-order.html
@@ isLewatEstimasi
- if (!['pending','proses'].includes(o.status)) return false;
+ // Include 'selesai' juga: kalau sudah selesai tapi belum diambil dan lewat
+ // estimasi, itu pelanggan telat ambil — indikator tetap perlu tampil.
+ // Status 'diambil' & 'dibatalkan' tidak pernah dianggap lewat.
+ if (!['pending','proses','selesai'].includes(o.status)) return false;
```

Tidak ada perubahan di backend — state machine `ALUR_VALID` sudah lengkap
& benar untuk semua 15 skenario yg diuji.
