# Fitur Paket Layanan

Pembelian kuota kg laundry di muka dengan masa berlaku. Terpisah dari fitur
Promo — punya menu sendiri, tabel sendiri, dan alur transaksi sendiri.

## Konsep bisnis

1. **Template paket** dibuat sekali oleh owner (misal "Paket Dewasa 30kg" = 30 kg / 30 hari / Rp 150.000).
2. **Pelanggan membeli paket** sebagai transaksi terpisah (bukan bagian order cucian). Kuota aktif langsung terhitung dari tanggal beli + `masa_berlaku_hari`.
3. Saat pelanggan **membuat order cucian**, operator bisa mencentang "Pakai kuota paket". Kg cucian akan dipotong dari kuota — kg yang tercover **gratis**, sisa kg (kalau kuota tidak cukup) dihitung harga normal seperti biasa.
4. **Satu pelanggan boleh punya banyak paket aktif** sekaligus. Kuota dipotong **FIFO by tanggal_kadaluarsa** — paket yang paling cepat habis dulu, supaya tidak ada kuota yang hangus percuma.
5. Kalau masa berlaku habis dan masih ada sisa kuota, sisa itu **hangus** (mutasi jenis `hangus`, kuota tidak bisa dipakai lagi).
6. Owner/karyawan (owner-only) bisa memberi **toleransi** hari tambahan per paket per pelanggan, dengan catatan alasan (tersimpan). Paket yang sudah kadaluarsa & masih ada sisa kuota otomatis kembali `aktif` kalau tanggal kadaluarsanya diperpanjang lewat waktu sekarang.
7. Sistem otomatis mendeteksi paket yang **mendekati kadaluarsa** (default H-3, bisa diatur di `pengaturan.paket_reminder_ambang_hari`) → muncul di widget Dashboard, dengan tombol Kirim WA (pakai template `wa_template_paket_reminder`) untuk **menanyakan** ke pelanggan apakah mau perpanjang (bukan auto-perpanjang).

## RBAC

| Aksi | Owner | Karyawan |
|---|---|---|
| Lihat template & paket pelanggan | ✅ | ✅ |
| Create/Update template | ✅ | ❌ |
| Delete template (soft, nonaktifkan) | ✅ | ❌ (blockOperatorDelete global) |
| Jual paket ke pelanggan | ✅ | ✅ |
| Order pakai kuota paket | ✅ | ✅ |
| Beri toleransi | ✅ | ❌ |
| Kirim WA reminder | ✅ | ✅ |

## Skema database

Migration [`20260829000042_paket_layanan.js`](src/database/migrations/20260829000042_paket_layanan.js) — idempoten (`hasTable`/`hasColumn` guard).

### paket_layanan_template
Template paket yang bisa dijual berulang.
- `nama`, `deskripsi`, `kuota_kg`, `harga`, `masa_berlaku_hari`, `estimasi_min_hari`, `estimasi_max_hari`, `aktif`

### paket_pelanggan
Instance paket milik pelanggan (hasil pembelian).
- `pelanggan_id`, `paket_template_id`, `nama_paket_snapshot` (nama saat dibeli — tetap konsisten meski template diedit), `kuota_awal_kg`, `kuota_sisa_kg`, `harga_dibayar`, `metode_bayar`
- `tanggal_beli`, `tanggal_kadaluarsa`
- `status`: `aktif` | `habis_kuota` | `kadaluarsa` | `diperpanjang`
- `toleransi_hari_tambahan` (akumulatif), `catatan_toleransi`
- `created_by`
- Index: `(pelanggan_id, status)`, `(tanggal_kadaluarsa)`

### mutasi_paket_pelanggan
Audit trail per paket.
- `paket_pelanggan_id`, `jenis`: `pembelian` | `pemakaian` | `toleransi` | `hangus`
- `kg_terpakai` (untuk pemakaian/hangus)
- `transaksi_id` (linked ke order kalau pemakaian)
- `kuota_sebelum`, `kuota_sesudah`
- `hari_toleransi` (untuk jenis toleransi)
- `keterangan`, `created_by`

### transaksi (kolom tambahan)
- `paket_pelanggan_id` (nullable, referensi paket yang dipakai — untuk paket-multi, ambil dari paket pertama FIFO)
- `kg_dari_paket` (total kg tercover dari kombinasi paket)

### pengaturan (baris tambahan)
- `paket_reminder_ambang_hari` = `'3'` (default; bisa diubah owner)
- `wa_template_paket_reminder` = template pesan reminder (lihat placeholder di bawah)

## Backend

### Service — [`src/services/paketLayanan.service.js`](src/services/paketLayanan.service.js)
- `listTemplate({ includeInactive })`, `getTemplate(id)`, `createTemplate`, `updateTemplate`, `deleteTemplate` (soft, set `aktif=0`).
- `beliPaket({ pelangganId, templateId, metodeBayar, userId })` — buat entry `paket_pelanggan`, hitung `tanggal_kadaluarsa`, mutasi `pembelian`, catat kas pemasukan.
- `getPaketAktifPelanggan(pelangganId)` — return paket status `aktif` dengan `kuota_sisa_kg > 0`, urut `tanggal_kadaluarsa ASC` (FIFO).
- `getSemuaPaketPelanggan({ pelangganId, status })` — untuk halaman list.
- `simulateKuotaPaket(pelangganId, kgDipakai)` — dry-run FIFO tanpa modifikasi DB. Dipakai `transaksiController` untuk hitung harga akhir sebelum commit.
- `pakaiKuotaPaket({ pelangganId, kgDipakai, transaksiId, userId, trx? })` — aktual potong kuota, buat mutasi `pemakaian` per paket, ubah status ke `habis_kuota` kalau sisa 0.
- `berikanToleransi({ paketPelangganId, tambahHari, catatan, userId })` — extend `tanggal_kadaluarsa`, mutasi `toleransi`. Kalau status sebelumnya `kadaluarsa` dan sisa kuota > 0, ubah kembali ke `aktif`.
- `cekDanTandaiKadaluarsa()` — dijalankan sebelum tiap query aktif/mendekat/reminder; paket `aktif` yang `tanggal_kadaluarsa` sudah lewat → status `kadaluarsa`, mutasi `hangus` dengan sisa kuota yang hilang.
- `getPaketMendekatiKadaluarsa(ambangHari)` — default pakai `pengaturan.paket_reminder_ambang_hari`, return paket `aktif` dengan `tanggal_kadaluarsa <= now + ambang`.
- `getMutasiPaket(paketPelangganId)` — histori mutasi + join nama user & nomor transaksi.

### Controller & Routes
- [`src/controllers/paketLayananController.js`](src/controllers/paketLayananController.js) — Joi validation, error mapping.
- [`src/routes/paketLayananRoutes.js`](src/routes/paketLayananRoutes.js) — mounted di [`src/app.js`](src/app.js) sebagai `app.use('/api/v1', paketLayananRoutes)`.

Endpoint:

```
# Template
GET    /api/v1/paket-template?aktif=semua
GET    /api/v1/paket-template/:id
POST   /api/v1/paket-template               (owner-only)
PUT    /api/v1/paket-template/:id           (owner-only)
DELETE /api/v1/paket-template/:id           (blockOperatorDelete global)

# Paket pelanggan
GET    /api/v1/paket-pelanggan?pelanggan_id=X&status=aktif
GET    /api/v1/paket-pelanggan/mendekat-kadaluarsa[?ambang=N]
GET    /api/v1/paket-pelanggan/aktif/:pelangganId
GET    /api/v1/paket-pelanggan/:id/mutasi
GET    /api/v1/paket-pelanggan/:id/reminder-wa   → { pesan, url, sisa_hari }
POST   /api/v1/paket-pelanggan/beli
POST   /api/v1/paket-pelanggan/:id/toleransi     (owner-only)
```

### Integrasi order baru (`transaksiController.store`)

1. Body order baru terima flag `pakai_paket: boolean`.
2. Kalau `pakai_paket=true` dan pelanggan punya paket aktif:
   - Sum kg dari item bersatuan `kg` → `totalKg`.
   - `simulateKuotaPaket` → dry-run FIFO → `kg_tercover`, potongan per paket.
   - Distribusi `kg_tercover` proporsional ke item kg-based → adjust `subtotal` (harga × (jumlah − share)).
   - Simpan `paket_pelanggan_id` (paket pertama FIFO) dan `kg_dari_paket` (total) di transaksi.
3. Setelah `transaksiModel.create` sukses, panggil `pakaiKuotaPaket` untuk aktual potong kuota + catat mutasi `pemakaian` dengan `transaksi_id` yang valid. Ada drift-check kalau simulasi & aktual beda (concurrency safeguard).
4. `_kg_dari_paket` di-strip dari items sebelum insert ke `detail_transaksi` (tidak butuh kolom baru di detail).

## Frontend

### Halaman [`public/pages/paket.html`](public/pages/paket.html)

Dua tab:
- **Paket Pelanggan** (default) — search + list card. Setiap card: nama pelanggan, nama paket snapshot, bar kuota sisa/awal, badge status, sisa hari (warna hijau/oranye/merah), tombol **Riwayat**, **Kirim WA** (kalau ada telepon), **Beri Toleransi** (owner-only). Tombol header **"Jual Paket"** buka modal (pilih pelanggan + template + metode bayar + preview kadaluarsa).
- **Template Paket** — list card template dengan meta (kuota, harga, masa berlaku, estimasi pengerjaan). Tombol header **"Template"** (label swap) buka modal create/edit (owner-only). Nonaktifkan (soft) owner-only.

Modal-modal (Template, Jual, Toleransi, Riwayat Mutasi) pakai bottom-sheet mobile-first konsisten dengan halaman lain.

### Widget Dashboard

Section baru **"Paket Mendekati Kadaluarsa"** di [`public/pages/dashboard.html`](public/pages/dashboard.html) — muncul otomatis kalau `d.paket_mendekat_kadaluarsa.length > 0`. Setiap row: nama pelanggan, nama paket, sisa kuota, badge sisa hari, tombol **Kirim WA** & **Toleransi** (owner-only) & **Detail**.

`renderPaketMendekat(list)` dipanggil dari `loadDashboard()` setelah `renderStokMenipis`.

### Integrasi ke form order baru

Di [`public/pages/order.html`](public/pages/order.html):
- `state.paketAktif` + `state.pakaiPaket` + `state.paketKgTercover` + `state.paketPelangganIdRef`.
- Saat `selectCustomer(p)`, load `GET /api/v1/paket-pelanggan/aktif/:pelangganId` → set `state.paketAktif`.
- Card info **"📦 Paket Kuota Aktif"** muncul di bawah customer info (hijau, dengan toggle "Pakai kuota paket"). Kalau ada > 1 paket, tampilkan total sisa & sisa hari terdekat kadaluarsa.
- `calcTotal()` menghitung `simulatePaket()` (FIFO client-side) dulu → kurangi subtotal item kg proporsional → total menyesuaikan.
- Ringkasan tampilkan 3 row baru (Berat Total, Dari Kuota Paket, Dibayar Normal) hanya kalau `pakai_paket` aktif & ada coverage.
- Breakdown di card paket menunjukkan potongan per paket + kelebihan yang harus dibayar normal.
- `pakai_paket` disertakan di body POST `/api/v1/transaksi`.
- `clearCustomer` reset semua state paket.

### Navigasi

Menu baru **"Paket"** (mono `PK`) di sidebar desktop (grup Marketing) dan grid Lainnya mobile — [`public/js/nav.js`](public/js/nav.js). Page route baru `GET /paket` di [`src/app.js`](src/app.js) (semua role login boleh akses, kontrol akses per aksi via `data-owner-only` + API RBAC).

## Template WA

Kunci `pengaturan.wa_template_paket_reminder` (seed di migration):

```
📦 *Reminder Paket Laundry*

Halo {nama} 👋
Paket *{nama_paket}* Anda akan kadaluarsa dalam {sisa_hari} hari lagi ({tanggal_kadaluarsa}).

Sisa kuota: {sisa_kuota} kg dari {kuota_awal} kg

Apakah Anda ingin memperpanjang paket ini? Balas pesan ini atau hubungi kami untuk info lebih lanjut. 🙏

_— {nama_toko} —_
```

Placeholder di-resolve di endpoint `GET /api/v1/paket-pelanggan/:id/reminder-wa`:
- `{nama}` — nama pelanggan
- `{nama_paket}` — `nama_paket_snapshot`
- `{sisa_hari}` — hari sampai kadaluarsa (bisa negatif)
- `{tanggal_kadaluarsa}` — `DD Mmm YYYY` lokal id-ID
- `{sisa_kuota}`, `{kuota_awal}` — angka kg
- `{nama_toko}` — dari `pengaturan.nama_toko`

Response: `{ pesan, url, sisa_hari }`. `url` pakai `waSvc.generateURL` (mode `wa_mode_default`). Pesan juga dicatat ke `wa_log` jenis `paket_reminder` sebagai audit trail.

## Verifikasi

Skenario yang sudah dites end-to-end via curl + browser:

1. ✅ Owner buat template `Paket Dewasa 30kg` (30 kg, Rp 150.000, 30 hari).
2. ✅ Jual paket ke pelanggan → `kuota_sisa_kg = 30`, `tanggal_kadaluarsa = tanggal_beli + 30 hari`, mutasi `pembelian`, kas pemasukan.
3. ✅ Order 10 kg dengan `pakai_paket=true` → `total_harga = 0`, `kg_dari_paket = 10`, mutasi `pemakaian` linked ke `transaksi_id`, kuota sisa 20.
4. ✅ Beli paket kedua untuk pelanggan sama → punya 2 paket aktif.
5. ✅ Order 25 kg dari paket 1 (sisa 20 kg) + paket 2 (sisa 30 kg): FIFO → 20 kg dari paket 1 (jadi `habis_kuota`), 5 kg dari paket 2 (sisa 25). `total_harga = 0`.
6. ✅ Order 30 kg saat kuota tersisa 25 kg → 25 kg tercover, 5 kg selisih dihitung normal = Rp 25.000.
7. ✅ Set `tanggal_kadaluarsa` ke masa lalu + `cekDanTandaiKadaluarsa()` → status jadi `kadaluarsa`, mutasi `hangus` dengan sisa kg. Order berikutnya `pakai_paket=true` di-tolak (`Pelanggan tidak punya paket aktif dengan sisa kuota`).
8. ✅ Beri toleransi +7 hari ke paket kadaluarsa (sisa > 0) → status kembali `aktif`, `tanggal_kadaluarsa` diperpanjang, mutasi `toleransi` dengan catatan.
9. ✅ Widget dashboard `paket_mendekat_kadaluarsa` muncul untuk paket H-2, endpoint `reminder-wa` menghasilkan pesan sesuai template + WA URL yang benar.
10. ✅ RBAC: karyawan **tidak bisa** create template atau beri toleransi (403); karyawan **bisa** jual paket ke pelanggan.
