# DATABASE SCHEMA — POS Laundry

Referensi resmi nama tabel & kolom untuk database `data/laundry.db` (SQLite).
**Gunakan dokumen ini sebelum menulis query baru** agar tidak salah nama kolom.

> CATATAN PENTING:
> - Semua kolom bertipe `datetime` (kecuali `kas.tanggal`) disimpan sebagai **Unix epoch milidetik (integer)**, bukan ISO string. Bandingkan dengan `Date.now()`, bukan `new Date().toISOString()`. Untuk grouping tanggal pakai `date(<kolom>/1000,'unixepoch')`.
> - Kolom `kas.tanggal` bertipe `date` (`YYYY-MM-DD` string), bandingkan dengan `new Date().toISOString().slice(0,10)`.
> - Tabel `pengaturan` adalah key-value (`kunci`, `nilai`). Kolom tambahan `ai_enabled`, `deepseek_api_key`, `ai_insight_cache`, `ai_insight_cache_time` ada di skema tetapi **TIDAK digunakan** — semua setting AI dibaca/ditulis lewat `kunci`/`nilai`.

---

## transaksi
Order utama pelanggan.

| Kolom | Tipe | Default | Catatan |
|---|---|---|---|
| id | INTEGER PK | | |
| nomor_transaksi | varchar(50) | | wajib unik |
| pelanggan_id | INTEGER | NULL | FK ke `pelanggan.id` |
| user_id | INTEGER | NULL | FK ke `users.id` (kasir) |
| paket_promo_id | INTEGER | NULL | FK ke `paket_promo.id` |
| tanggal_masuk | datetime (ms) | CURRENT_TIMESTAMP | epoch ms |
| tanggal_selesai | datetime (ms) | NULL | estimasi selesai (epoch ms) |
| tanggal_ambil | datetime (ms) | NULL | epoch ms |
| status | varchar(20) | `'pending'` | `pending` \| `proses` \| `selesai` \| `diambil` \| `dibatalkan` |
| total_harga | float | 0 | subtotal layanan (sebelum biaya tambahan & diskon) |
| diskon | float | 0 | nominal diskon final |
| poin_digunakan | INTEGER | 0 | |
| total_bayar | float | 0 | **total yang harus dibayar** (setelah diskon & biaya tambahan) |
| bayar | float | 0 | total yang sudah dibayar (akumulasi cicilan) |
| kembalian | float | 0 | |
| metode_bayar | varchar(30) | `'tunai'` | `tunai` \| `transfer` \| `qris` \| `deposit` |
| catatan | TEXT | NULL | |
| created_at | datetime (ms) | CURRENT_TIMESTAMP | |
| updated_at | datetime (ms) | CURRENT_TIMESTAMP | |
| antar_jemput | boolean | 0 | |
| alamat_jemput | TEXT | NULL | |
| tanggal_lunas | datetime (ms) | NULL | |
| total_dibayar | float | 0 | alias historis dari `bayar` |
| diskon_tipe | varchar(20) | `'nominal'` | `nominal` \| `persen` |
| diskon_persen | float | 0 | |

**Pola umum**:
- Piutang/belum lunas: `bayar < total_bayar AND status NOT IN ('dibatalkan','diambil')`
- Omset hari ini: `SUM(total_bayar)` di mana `status IN ('selesai','diambil')`

---

## pelanggan

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| nama | varchar(100) NOT NULL | |
| telepon | varchar(20) | NULL | **bukan `nomor_hp` / `hp` / `phone`** |
| alamat | TEXT | NULL |
| email | varchar(100) | NULL |
| total_poin | INTEGER | 0 |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |
| updated_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## layanan

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| kategori_id | INTEGER | NULL — FK `kategori_layanan.id` |
| nama | varchar(100) NOT NULL | |
| harga | float NOT NULL | |
| satuan | varchar(20) | `'kg'` |
| estimasi_hari | INTEGER | 2 |
| deskripsi | TEXT | NULL |
| aktif | boolean | 1 |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP |
| hpp | float | 0 |
| margin_persen | float | 0 |
| harga_auto | INTEGER | 0 |

---

## kategori_layanan

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| nama | varchar(100) NOT NULL | |
| deskripsi | TEXT | NULL |
| aktif | boolean | 1 |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP |
| ikon | varchar(50) | `'category'` |
| warna | varchar(20) | `'#6366f1'` |

---

## detail_transaksi
Item layanan dalam satu transaksi.

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| transaksi_id | INTEGER NOT NULL | FK `transaksi.id` |
| layanan_id | INTEGER | NULL — FK `layanan.id` |
| nama_layanan | varchar(100) | NULL — snapshot nama layanan |
| jumlah | float NOT NULL | |
| satuan | varchar(20) | NULL |
| harga_satuan | float NOT NULL | |
| subtotal | float NOT NULL | **bukan `sub_total`** |
| catatan | TEXT | NULL |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## kas
Mutasi kas masuk / keluar.

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| tanggal | date NOT NULL | format `YYYY-MM-DD` (string), **bukan ms** |
| jenis | varchar(10) NOT NULL | `'masuk'` \| `'keluar'` |
| kategori | varchar(50) | `'lainnya'` |
| keterangan | TEXT | NULL |
| jumlah | float NOT NULL | **bukan `nominal`** |
| transaksi_id | INTEGER | NULL — FK `transaksi.id` |
| user_id | INTEGER | NULL — **bukan `created_by`** |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP |

> Lihat juga: `memory/project_knex_trx_deadlock.md` — perbedaan kolom kas vs tabel lain.

---

## biaya_tambahan

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| transaksi_id | INTEGER NOT NULL | FK `transaksi.id` |
| keterangan | varchar(255) NOT NULL | |
| nominal | float NOT NULL | |
| created_by | INTEGER | NULL — FK `users.id` |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## riwayat_bayar
Log pembayaran (DP, pelunasan, cicilan).

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| transaksi_id | INTEGER NOT NULL | FK |
| jenis | TEXT NOT NULL | `'pelunasan'` (default) — `dp` \| `pelunasan` \| `cicilan` |
| nominal | float NOT NULL | |
| metode | varchar(20) NOT NULL | `tunai` \| `transfer` \| `qris` \| `deposit` |
| kelebihan_ke_deposit | float | 0 |
| created_by | INTEGER | NULL — FK `users.id` |
| keterangan | varchar(255) | NULL |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## deposit_pelanggan
Saldo deposit per pelanggan (1 row/pelanggan). **Bukan `deposit`.**

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| pelanggan_id | INTEGER NOT NULL | FK |
| saldo | float | 0 |
| updated_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## mutasi_deposit

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| pelanggan_id | INTEGER NOT NULL | FK |
| transaksi_id | INTEGER | NULL |
| jenis | varchar(20) NOT NULL | `topup` \| `bayar` \| `kelebihan` \| `refund` |
| nominal | float NOT NULL | |
| saldo_sebelum | float NOT NULL | |
| saldo_sesudah | float NOT NULL | |
| keterangan | varchar(255) | NULL |
| metode_bayar | varchar(30) | NULL |
| created_by | INTEGER | NULL — FK `users.id` |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |
| is_dibatalkan | boolean | 0 |

---

## poin_pelanggan

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| pelanggan_id | INTEGER NOT NULL | FK |
| total_poin | INTEGER | 0 |
| updated_at | datetime (ms) | CURRENT_TIMESTAMP |

> Catatan: `pelanggan.total_poin` juga ada dan disinkronkan. Sumber kebenaran utama adalah `pelanggan.total_poin`.

---

## riwayat_poin

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| pelanggan_id | INTEGER | NULL |
| transaksi_id | INTEGER | NULL |
| jenis | varchar(10) NOT NULL | `tambah` \| `kurang` |
| jumlah_poin | INTEGER NOT NULL | |
| keterangan | TEXT | NULL |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## paket_promo

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| nama | varchar(100) NOT NULL | |
| deskripsi | TEXT | NULL |
| diskon_persen | float | 0 |
| diskon_nominal | float | 0 |
| min_pembelian | float | 0 |
| layanan_ids | TEXT | NULL — JSON array of ids |
| aktif | boolean | 1 |
| berlaku_mulai | date | NULL — `YYYY-MM-DD` |
| berlaku_sampai | date | NULL — `YYYY-MM-DD` |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP |
| jenis | varchar(20) | `'persen'` — `persen` \| `nominal` \| `paket` |
| hari_berlaku | varchar(50) | NULL — CSV: `senin,selasa,...` |

---

## stok_bahan

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| nama | varchar(100) NOT NULL | |
| satuan | varchar(20) | `'pcs'` |
| stok_saat_ini | float | 0 |
| stok_minimum | float | 0 |
| harga_satuan | float | 0 |
| keterangan | TEXT | NULL |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## users

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| nama | varchar(100) NOT NULL | |
| username | varchar(50) NOT NULL | unik |
| password | varchar(255) NOT NULL | bcrypt hash |
| role | varchar(20) | `'kasir'` — `admin` \| `kasir` |
| aktif | boolean | 1 |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP |

---

## pengaturan
Key-value store.

| Kolom | Tipe | Default | Catatan |
|---|---|---|---|
| id | INTEGER PK | | |
| kunci | varchar(100) NOT NULL | | unik |
| nilai | TEXT | NULL | semua nilai disimpan sebagai string |
| deskripsi | TEXT | NULL | |
| created_at / updated_at | datetime (ms) | CURRENT_TIMESTAMP | |
| ai_enabled | boolean | 0 | **TIDAK dipakai** — gunakan row `kunci='ai_enabled'` |
| deepseek_api_key | TEXT | NULL | **TIDAK dipakai** — gunakan row `kunci='deepseek_api_key'` |
| ai_insight_cache | TEXT | NULL | **TIDAK dipakai** — gunakan row `kunci='ai_insight_cache'` |
| ai_insight_cache_time | datetime | NULL | **TIDAK dipakai** — gunakan row `kunci='ai_insight_cache_time'` |

---

## wa_log
Log pengiriman WhatsApp.

| Kolom | Tipe | Default |
|---|---|---|
| id | INTEGER PK | |
| telepon | varchar(20) NOT NULL | |
| pesan | TEXT NOT NULL | |
| status | varchar(20) | `'pending'` — `pending` \| `terkirim` \| `gagal` |
| transaksi_id | INTEGER | NULL |
| response_api | TEXT | NULL |
| created_at | datetime (ms) | CURRENT_TIMESTAMP |
| wa_mode | varchar(20) | `'regular'` — `regular` \| `business` |
| jenis | varchar(30) | `'nota'` |
| url | TEXT | NULL |

---

## Tabel sistem
- `knex_migrations`, `knex_migrations_lock` — internal Knex migration
- `sessions` — express-session store (di `data/sessions.db` terpisah)

---

## Kolom yang SERING SALAH ditulis (jangan ulang)

| ❌ Salah | ✅ Benar | Tabel |
|---|---|---|
| `estimasi_selesai` | `tanggal_selesai` | transaksi |
| `sub_total` | `subtotal` | detail_transaksi |
| `pelanggan.nomor_hp` / `hp` / `phone` | `pelanggan.telepon` | pelanggan |
| `status_pembayaran = 'belum_lunas'` | `bayar < total_bayar` + `status NOT IN ('dibatalkan','diambil')` | transaksi |
| `db('deposit')` | `db('deposit_pelanggan')` | — |
| `kas.nominal` | `kas.jumlah` | kas |
| `kas.created_by` | `kas.user_id` | kas |
| ISO string utk `tanggal_masuk/selesai/ambil` | Unix epoch ms (Number) | semua datetime |

---

## Cara cek struktur tabel
```bash
sqlite3 data/laundry.db "PRAGMA table_info(<nama_tabel>);"
sqlite3 data/laundry.db ".tables"
sqlite3 data/laundry.db ".schema <nama_tabel>"
```
