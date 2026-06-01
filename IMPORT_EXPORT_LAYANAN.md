# 📥📤 Fitur Import & Export Layanan

Fitur untuk import layanan secara massal dari file CSV/Excel dan export data layanan sebagai backup.

## ✨ Fitur Utama

### Import Layanan
- Upload file CSV atau Excel (.xlsx, .xls)
- Preview data sebelum import dengan 3 kategori:
  - ✅ **Baru** (hijau): Layanan baru yang akan ditambahkan
  - ⚠️ **Duplikat** (kuning): Nama sudah ada, pilih skip atau update
  - ❌ **Error** (merah): Data tidak valid, tidak bisa diimport
- Konfirmasi per item duplikat (skip/update)
- Bulk action untuk semua duplikat sekaligus
- Validasi lengkap dengan pesan error detail
- Support drag & drop file
- Maksimal ukuran file: 5MB

### Export Layanan
- Export semua layanan ke format CSV atau Excel
- Semua data lengkap: nama, kategori, harga, hpp, margin, dll
- Bisa digunakan sebagai backup atau template import

### Template
- Download template Excel atau CSV
- Sudah ada contoh data untuk memudahkan pengisian
- Format kolom sudah benar dan siap dipakai

## 📋 Format File Import

### Kolom Wajib
| Kolom | Tipe | Contoh | Keterangan |
|-------|------|--------|------------|
| `nama` | Teks | Cuci Kiloan Reguler | Nama layanan |
| `kategori` | Teks | Kiloan | Harus cocok dengan kategori di sistem |
| `harga` | Angka | 7000 | Harga dalam Rupiah (tanpa titik/koma) |
| `satuan` | Pilihan | kg | Nilai: `kg` atau `pcs` |

### Kolom Opsional
| Kolom | Tipe | Default | Contoh |
|-------|------|---------|--------|
| `estimasi_hari` | Angka | 2 | 2 |
| `deskripsi` | Teks | - | Maks 200x200cm |
| `hpp` | Angka | 0 | 4200 |
| `margin_persen` | Angka | 0 | 40 |
| `aktif` | Angka | 1 | 1 = aktif, 0 = nonaktif |

### Contoh File CSV

```csv
nama,kategori,harga,satuan,estimasi_hari,deskripsi,hpp,margin_persen,aktif
Cuci Kiloan Reguler,Kiloan,7000,kg,2,,4200,40,1
Cuci + Setrika Kiloan,Kiloan,10000,kg,2,,5500,45,1
Express Kiloan,Express,12000,kg,1,Selesai 6 jam,6000,50,1
Sprei Single,Sprei,15000,pcs,2,,8000,47,1
```

## 🎯 Cara Penggunaan

### Import Layanan

1. **Persiapan File**
   - Download template Excel atau CSV dari tombol di modal import
   - Isi data layanan sesuai format
   - Pastikan kategori sudah ada di sistem

2. **Upload File**
   - Klik tombol **Import** di halaman Layanan
   - Pilih file CSV/Excel atau drag & drop
   - File akan divalidasi otomatis

3. **Preview & Konfirmasi**
   - Lihat preview data yang akan diimport
   - **Hijau (Baru)**: Akan ditambahkan langsung
   - **Kuning (Duplikat)**: Pilih Skip atau Update per item
     - Skip: Tidak mengubah data yang sudah ada
     - Update: Ganti data lama dengan data baru
   - **Merah (Error)**: Perbaiki di file, tidak bisa diimport
   - Gunakan bulk action untuk skip/update semua sekaligus

4. **Jalankan Import**
   - Cek ringkasan: berapa yang akan ditambah/update/skip
   - Klik **Jalankan Import**
   - Tunggu proses selesai
   - Lihat hasil: berhasil, diupdate, diskip, gagal

### Export Layanan

1. Klik tombol **Export Excel** atau **Export CSV**
2. File akan langsung terdownload
3. Berisi semua layanan dengan data lengkap

### Update Harga Massal

Gunakan kombinasi export → edit → import:

1. Export layanan ke Excel
2. Edit harga di Excel (atau kolom lainnya)
3. Import kembali file yang sudah diedit
4. Pilih **Update** untuk duplikat yang ingin diubah

## ⚠️ Validasi & Error

### Error Umum

| Error | Penyebab | Solusi |
|-------|----------|--------|
| `kategori 'X' tidak ditemukan` | Kategori belum ada di sistem | Buat kategori dulu atau ubah nama kategori |
| `kolom 'harga' wajib diisi` | Harga kosong | Isi harga dengan angka valid |
| `harga harus berupa angka` | Format harga salah | Gunakan angka tanpa titik/koma/simbol |
| `satuan 'X' tidak valid` | Satuan bukan kg/pcs | Gunakan `kg` atau `pcs` |

### Tips Menghindari Error

✅ Download template dan isi dari template  
✅ Pastikan kategori sudah dibuat di sistem  
✅ Harga dalam angka polos (7000, bukan 7.000 atau Rp7000)  
✅ Satuan harus `kg` atau `pcs` (huruf kecil/besar tidak masalah)  
✅ Nama layanan unik (duplikat akan diminta konfirmasi)  

## 🔧 Detail Teknis

### Teknologi
- **Backend**: Node.js + Express
- **Upload**: Multer (max 5MB)
- **CSV**: PapaParse
- **Excel**: SheetJS (xlsx)
- **Storage**: Session-based preview

### Endpoint API

```
POST   /api/v1/layanan/import/preview      # Upload & preview
POST   /api/v1/layanan/import/konfirmasi   # Eksekusi import
GET    /api/v1/layanan/export?format=xlsx  # Export Excel
GET    /api/v1/layanan/export?format=csv   # Export CSV
GET    /api/v1/layanan/template?format=xlsx # Template Excel
GET    /api/v1/layanan/template?format=csv  # Template CSV
```

### File Terkait
```
src/
├── services/
│   ├── import-layanan.service.js    # Logic import & validasi
│   └── export-layanan.service.js    # Logic export & template
├── controllers/
│   └── layananController.js         # Handler endpoint
└── routes/
    └── layananRoutes.js             # Route definitions

public/
├── pages/
│   └── layanan.html                 # UI modal import
└── js/
    └── import-layanan.js            # Frontend logic
```

## 📝 Catatan Penting

1. **Kategori Harus Ada Dulu**  
   Import tidak otomatis membuat kategori baru. Pastikan semua kategori yang disebutkan di file sudah ada di sistem.

2. **Duplikat Detection**  
   Duplikat dideteksi berdasarkan **nama layanan** (case-insensitive). Jika nama sama, akan dianggap duplikat.

3. **Backup Data**  
   Sebaiknya export data layanan secara berkala sebagai backup.

4. **File Size**  
   Maksimal 5MB. Untuk import besar, bagi menjadi beberapa file lebih kecil.

5. **Session Timeout**  
   Preview disimpan di session. Jika terlalu lama, session bisa timeout dan harus upload ulang.

## 🐛 Troubleshooting

**Q: File tidak bisa diupload**  
A: Pastikan format CSV atau Excel (.xlsx, .xls) dan ukuran < 5MB

**Q: Semua data masuk ke Error**  
A: Cek pesan error di tabel merah, biasanya kategori tidak ditemukan atau format salah

**Q: Preview hilang saat refresh**  
A: Preview di session, tidak persisten. Upload ulang file

**Q: Import gagal semua**  
A: Cek console browser (F12) untuk error detail, atau cek log server

---

**Versi**: 1.0  
**Tanggal**: Juni 2026  
**Maintainer**: POS Laundry Team
