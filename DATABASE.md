# Database Schema & Migration

## Auto-Migration

Server secara otomatis menjalankan migration saat startup (`server.js`).
**Tidak perlu menjalankan `npm run migrate` secara manual** kecuali untuk development.

```bash
# Server akan otomatis:
# 1. Cek migration yang belum dijalankan
# 2. Jalankan migration terbaru
# 3. Tampilkan log migration yang dijalankan
npm start
```

## Migration Manual (Development)

Jika ingin menjalankan migration manual:

```bash
# Jalankan migration terbaru
npm run migrate

# Rollback migration terakhir
npm run migrate:rollback

# Buat migration baru
npx knex migrate:make nama_migration
```

## Tabel Database

### Core Tables
- `users` - User akun (admin, operator, kasir)
- `pelanggan` - Data pelanggan member
- `kategori_layanan` - Kategori layanan (cuci, setrika, dll)
- `layanan` - Daftar layanan & harga
- `transaksi` - Order utama
- `detail_transaksi` - Item layanan per order
- `paket_promo` - Promo & diskon

### Payment & Points
- `riwayat_bayar` - Histori pembayaran per order (DP, pelunasan, cicilan)
- `biaya_tambahan` - Biaya ekstra per order (noda parah, handling khusus)
- `poin_pelanggan` - Cache total poin pelanggan
- `riwayat_poin` - Log perubahan poin

### Deposit System
- `mutasi_deposit` - Transaksi deposit (topup, pemakaian, refund)

### Finance & Reporting
- `kas` - Kas masuk/keluar
- `laporan` - Cache laporan harian/bulanan

### WhatsApp Integration
- `wa_log` - Log pengiriman WA notifikasi

### System
- `pengaturan` - Konfigurasi app (key-value)
- `sessions` - Session management

## Troubleshooting

### Error: "no such table: XXX"

**Penyebab**: Migration belum dijalankan atau gagal.

**Solusi**:
1. Restart server (auto-migration akan jalan)
2. Atau jalankan manual: `npm run migrate`
3. Cek log server untuk error detail

### Migration Failed

Jika auto-migration gagal saat startup:
- Server tetap jalan untuk debugging
- Error akan muncul di console
- Perbaiki migration file yang error
- Restart server

### Reset Database (HATI-HATI!)

```bash
# Rollback semua migration
npm run migrate:rollback

# Jalankan ulang semua migration
npm run migrate

# Jalankan seed data (opsional)
npm run seed
```

## Migration File Structure

```
src/database/migrations/
├── 20240101000001_create_users.js
├── 20240101000002_create_pelanggan.js
├── ...
├── 20260604000023_riwayat_bayar.js
└── 20260604000025_create_biaya_tambahan.js
```

**Naming Convention**: `YYYYMMDDNNNNNN_description.js`
- `YYYYMMDD`: Tanggal
- `NNNNNN`: Urutan (000001, 000002, ...)
- `description`: Deskripsi singkat

## Best Practices

1. **Selalu buat migration untuk perubahan schema**
   - Tambah tabel baru? Buat migration
   - Tambah/hapus kolom? Buat migration
   - Ubah tipe data? Buat migration

2. **Test migration sebelum commit**
   ```bash
   npm run migrate          # Test up
   npm run migrate:rollback # Test down
   npm run migrate          # Test up lagi
   ```

3. **Migration harus idempoten**
   - Bisa dijalankan berkali-kali tanpa error
   - Gunakan `createTableIfNotExists` atau cek existence

4. **Jangan edit migration yang sudah di-commit**
   - Buat migration baru untuk fix
   - Migration lama harus tetap konsisten

5. **Backup database sebelum migration besar**
   ```bash
   cp data/laundry.db data/laundry.db.backup
   ```
