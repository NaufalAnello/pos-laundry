# Screening & Fix — Sistem Deposit + Pesan WA Pelunasan

**Tanggal:** 2026-08-08
**Scope:** 3 masalah spesifik (bukan screening umum):
1. Bug 1 — DP + Deposit tidak potong saldo & nominal akhir tak berkurang
2. Feat/Bug 2 — Pesan WA setelah pelunasan sama persis dengan nota order baru
3. Feat 3 — Owner belum bisa koreksi saldo deposit secara manual

Semua perubahan diverifikasi dengan test skrip nyata (bukan hanya baca kode).

---

## Bug 1 — DP dengan Deposit tidak potong saldo

### Reproduksi

Test skrip: `scripts/repro_bug1.js` (login → buat pelanggan saldo 100.000 →
POST /api/v1/transaksi dengan `payment_mode=dp`, `metode_bayar=deposit`,
`is_dp=true`, DP 20.000 dari total 48.000).

Hasil menjalankan skrip TANPA fix (mimik data yang dikirim frontend lama):
```
create order: 201
  data.total_dibayar= 0            ← seharusnya 20.000
  deposit saldo skrg = 100000       ← seharusnya 80.000
  mutasi deposit: bayar nominal= 0  ← DP tidak tercatat sama sekali
RESULT: ❌ FAIL
```

### Root cause

`public/pages/order.html:2965` — frontend zero-kan field `bayar` untuk SEMUA
metode deposit tanpa pandang mode:

```js
bayar: isDepositMode ? 0 : bayar,
```

Padahal backend `transaksiController.js:194–200` untuk DP + deposit pakai
`value.bayar` sebagai `nominalDiminta` (nominal yang mau dipotong dari saldo):

```js
const isDpMode = value.payment_mode === 'dp' || value.is_dp;
const nominalDiminta = isDpMode ? value.bayar : totalBayar;
```

Efek berantai: `value.bayar = 0` → `nominalDiminta = 0` → `bayarFinal = 0` →
`potongDepo = min(saldo, 0) = 0` → tidak ada mutasi saldo → tidak ada DP tercatat.

Untuk `bayar-sekarang + deposit`, zero-kan aman karena backend cabang lain
memakai `totalBayar` sebagai `nominalDiminta` (mengabaikan `value.bayar`).
Bug hanya terjadi di kombinasi **DP + deposit**.

### Fix

`public/pages/order.html:2965` — hanya zero-kan untuk cabang `bayar-sekarang`:

```js
bayar: (isDepositMode && mode === 'bayar-sekarang') ? 0 : bayar,
```

Kode backend TIDAK diubah — logika `nominalDiminta = value.bayar` untuk DP
sudah benar (nominal DP memang harus dikirim, bukan dihitung otomatis).

### Verifikasi post-fix

`node scripts/repro_bug1.js --after-fix`:
```
  data.total_dibayar = 20000                    ✅
  deposit saldo skrg = 80000                    ✅ (100.000 - 20.000)
  mutasi deposit: bayar nominal= 20000          ✅
  sisa tagihan = 28000 (dari total 48.000)      ✅
RESULT: ✅ PASS
```

### Bonus: schema fix

Saat reproduksi ketemu bug lain: kolom `transaksi.tanggal_lunas` dan
`transaksi.total_dibayar` **hilang di fresh install** (dihapus dari
migration `20260604000023_riwayat_bayar` oleh commit `8dda5c0` dengan
asumsi "kolom sudah ada"; asumsi itu tidak berlaku di fresh install).

Ditambahkan migration idempoten baru:
`src/database/migrations/20260808000039_add_tanggal_lunas_total_dibayar_to_transaksi.js`
— hasColumn check + backfill `total_dibayar = bayar`, `tanggal_lunas = created_at`
untuk data lama yang sudah bayar >= total.

---

## Bug 2 & Feat — Template WA khusus Pelunasan (LUNAS)

### Gejala

Pelunasan pakai deposit SUDAH BENAR memotong saldo & mengubah status.
Tapi pesan WA yang disediakan setelah pelunasan (lewat wa-sheet →
"Kirim Nota Order") pakai template `wa_template_nota` yang SAMA PERSIS
dengan nota order baru — pelanggan menerima ulang nota order, bukan
bukti pelunasan yang jelas menyatakan "LUNAS".

### Implementasi

**1. Database — template baru** (`wa_template_lunas`)
- Migration idempoten: `src/database/migrations/20260808000040_seed_wa_template_lunas.js`
  (hasColumn/exists check → insert kalau belum ada)
- Seed juga ditambah di `src/database/seeds/02_wa_templates.js` untuk
  `migrate:fresh`
- Default template:
  ```
  ✅ *PEMBAYARAN LUNAS*

  Halo {nama} 👋
  Pembayaran laundry Anda telah *LUNAS* ✅

  🧾 *Order: {nomor}*
  💰 Total: Rp {total}
  💳 Metode: {metode_bayar}
  📅 Dibayar: {tanggal_lunas}
  ...
  ```

**2. Backend — service**
- `src/services/wa.service.js` — fungsi baru `buildNotifLunas(transaksi, mode)`
  mengikuti pola `buildNota` / `buildTagihan` / `buildNotifSelesai`.
- Variabel `{metode_bayar}` diambil dari `riwayat_bayar` entri terakhir
  (jenis `pelunasan` atau `dp_tambahan`) — bukan dari `transaksi.metode_bayar`
  yang bisa masih berisi metode DP awal.
- Contoh: DP tunai lalu lunasi pakai deposit → template menampilkan
  `Metode: Deposit` (benar), bukan `Metode: Tunai`.

**3. Backend — controller + route**
- `src/controllers/waController.js` — `exports.lunas` (validasi order harus
  sudah lunas dulu, else 400).
- `src/routes/transaksiRoutes.js` — `GET /:id/wa/lunas`.

**4. Frontend — trigger di alur lunasi**
- `public/js/wa-sheet.js` — opsi ke-4 "Bukti Lunas" (`data-type="lunas"`)
- `public/js/lunasi-sheet.js` — success view baru: setelah pelunasan berhasil
  (`d.lunas === true`) dan pelanggan punya telepon, sheet transisi ke blok
  sukses dengan tombol **"💬 Kirim Bukti Lunas via WA"** yang membuka wa-sheet
  (user pilih opsi "Bukti Lunas" — kirim template lunas, bukan nota).
- Payload helper di `orders.html`, `dashboard.html`, `tagihan.html`,
  `detail-order.html` diperluas: field `telepon` dilewatkan ke openLunasiSheet
  supaya button WA bisa muncul.

**5. Pengaturan UI**
- `public/pages/pengaturan.html` — field baru `<textarea id="tplLunas">`
  di bawah "Template Notifikasi Selesai", var-ref ditambah `{metode_bayar}`
  & `{tanggal_lunas}`, saveWA() mengirim `wa_template_lunas`.

### Verifikasi

Test skrip `scripts/test_bug2_wa_lunas.js` — buat order, lunasi pakai
deposit, fetch endpoint `/wa/nota` dan `/wa/lunas` lalu bandingkan:

```
✅ pesan lunas ≠ pesan nota
✅ pesan lunas menyebutkan "LUNAS"
✅ pesan lunas menyebutkan metode "Deposit"
✅ pesan lunas berisi nomor order
✅ pesan nota TIDAK menyebut "PEMBAYARAN LUNAS"
RESULT: ✅ PASS
```

---

## Feat 3 — Koreksi Saldo Deposit (owner-only)

### Backend

- **Model**: `src/models/deposit.model.js` — fungsi `koreksi({ pelangganId,
  saldoBaru, keterangan, createdBy })`
  - Menetapkan saldo langsung ke `saldoBaru` (bukan penambahan)
  - Selisih dicatat sebagai mutasi `jenis='koreksi'`, `nominal=selisih`
    (positif kalau naik, negatif kalau turun)
  - `saldoBaru === saldoSekarang` → no-op, tidak buat mutasi
- **Route**: `POST /api/v1/deposit/:pelangganId/koreksi` di
  `src/routes/depositRoutes.js`, di-guard `requireOwner` middleware.
- **Validasi**: `saldo_baru` (integer ≥ 0), `keterangan` (min 3, max 255 char).

### Frontend

- `public/pages/deposit.html`:
  - Tombol "Koreksi Saldo" di footer mutasi panel, `display:none` default,
    di-set visible via `window.isOwner()` saat `openMutasiPanel` (pola sama
    dengan tombol batalkan-topup di line 807-819).
  - Modal `#modalKoreksi` dengan input Saldo Baru + Keterangan wajib,
    preview selisih realtime (+ hijau / - merah).
  - Handler `openModalKoreksi` / `submitKoreksi` di script section.
  - `renderMutasi` mendukung jenis `koreksi` dengan warna nominal
    tergantung sign (nominal > 0 → positif hijau, < 0 → negatif merah).

### Verifikasi

Test skrip `scripts/test_koreksi_deposit.js`:

**Owner koreksi 30.000 → 50.000:**
```
saldo actual: 50000 (expected 50000)
   ✅ saldo langsung jadi 50.000 (BUKAN 80.000 dari selisih)
mutasi terakhir: koreksi nominal= 20000 saldo_sebelum= 30000 saldo_sesudah= 50000
   ✅ mutasi tercatat: jenis=koreksi, nominal=+20.000
```

**Karyawan (create user role='karyawan', login, coba akses endpoint):**
```
karyawan koreksi: 403 { error: 'Anda tidak memiliki akses ke fitur ini' }
   ✅ karyawan ditolak 403
   ✅ saldo tidak berubah setelah percobaan karyawan
```

**Koreksi turunkan (test negative nominal):**
```
selisih: -25000
   ✅ koreksi turun mencatat nominal negatif (-25.000)
```

**Validasi:**
```
   ✅ saldo_baru negatif ditolak 400
   ✅ keterangan < 3 char ditolak 400
```

RESULT: ✅ 7/7 PASS

---

## Ringkasan file yang diubah

**Baru:**
- `src/database/migrations/20260808000039_add_tanggal_lunas_total_dibayar_to_transaksi.js`
- `src/database/migrations/20260808000040_seed_wa_template_lunas.js`
- `scripts/repro_bug1.js`
- `scripts/test_bug2_wa_lunas.js`
- `scripts/test_koreksi_deposit.js`
- `SCREENING_DEPOSIT_FIX.md` (dokumen ini)

**Dimodifikasi:**
- `public/pages/order.html` (Bug 1 fix)
- `public/pages/pengaturan.html` (template lunas UI)
- `public/pages/deposit.html` (koreksi UI + jenis koreksi di renderMutasi)
- `public/pages/orders.html`, `dashboard.html`, `tagihan.html`,
  `detail-order.html` (tambah `telepon` di payload lunasi)
- `public/js/lunasi-sheet.js` (success view + tombol WA lunas)
- `public/js/wa-sheet.js` (opsi Bukti Lunas)
- `src/services/wa.service.js` (buildNotifLunas)
- `src/controllers/waController.js` (endpoint lunas)
- `src/routes/transaksiRoutes.js` (route wa/lunas)
- `src/routes/depositRoutes.js` (endpoint koreksi owner-only)
- `src/models/deposit.model.js` (method koreksi)
- `src/database/seeds/02_wa_templates.js` (seed template lunas)
