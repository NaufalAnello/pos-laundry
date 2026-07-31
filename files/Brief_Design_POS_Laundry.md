# BRIEF DESAIN — POS LAUNDRY (Nala Laundry)
Untuk digunakan bersama Claude Design

---

## 1. TENTANG BISNIS

- **Nama usaha:** Nala Laundry
- **Lokasi:** Mempawah Hilir, Kalimantan Barat
- **Operator:** 1 orang (Naufal), solo — pakai HP untuk operasional harian, laptop sesekali untuk cek laporan
- **Jenis layanan:** Laundry kiloan (cuci, setrika, cuci+setrika), item satuan (sprei, selimut, boneka, bantal, dll), antar-jemput

## 2. LOGO & IDENTITAS BRAND

Logo "nala laundry" — teks huruf kecil, gaya rounded/bubbly, dengan ikon rumah kecil di antara kata "nala" dan "laundry", serta bintang di ujung atas kanan.

**Warna dari logo:**
- Biru tua (teks "nala"): `#2D3BB5`
- Biru medium/gradasi: `#2563EB`
- Biru muda/cerah (teks "laundry", ikon rumah): `#4BB8FA`
- Kuning emas (bintang): `#F59E0B`

**Kesan yang diinginkan:** segar, bersih, friendly — melambangkan kebersihan (sesuai bisnis laundry), TIDAK norak, simpel.

## 3. PALET WARNA YANG SUDAH DITERAPKAN

```
Primary       #2D3BB5   (biru tua — aksi utama, header, teks penting)
Secondary     #4BB8FA   (biru muda — aksen, tombol Order FAB)
Accent        #F59E0B   (kuning emas — warning/DP status)
Success       #10B981   (hijau — lunas/selesai)
Danger        #EF4444   (merah — belum lunas/batal/lewat waktu)
Purple        #8B5CF6   (ungu — khusus tombol/badge "Label"/cetak)

Gray-1        #F8FAFF   (background halaman, sedikit birunya)
Gray-2        #F1F5F9
Gray-3        #E2E8F0   (border)
Gray-4        #94A3B8   (placeholder, ikon nonaktif)
Gray-5        #64748B   (teks sekunder)
Gray-9        #1E2A6E   (teks utama, biru tua gelap)

Background halaman   #F0F7FF  (biru sangat muda)
Background card       #FFFFFF (putih bersih)
```

**Prinsip desain:** tanpa gradient berlebihan (gradient hanya untuk 1-2 card "hero" seperti ringkasan tagihan), shadow tipis (`0 1px 3px rgba(45,59,181,0.08)`), border radius 8-10px, tidak ada elemen visual yang "ramai".

## 4. TIPOGRAFI

- Font: sistem (-apple-system, Segoe UI, Roboto, sans-serif) — tidak custom font khusus
- Heading halaman: 20px bold
- Card title: 15px semi-bold
- Body: 14px regular
- Caption/label: 12px, uppercase, letter-spacing renggang
- Angka nominal Rupiah: selalu bold, ukuran menonjol dari teks sekitarnya

## 5. PLATFORM & PRIORITAS PERANGKAT

- **HP adalah perangkat utama** — hampir semua desain harus dioptimalkan untuk layar ~375px lebar terlebih dulu (mobile-first)
- **Laptop** dipakai sesekali, terutama untuk halaman Laporan — desain laptop boleh lebih padat/tabel penuh
- Semua tombol tap-target minimal 44px tinggi di versi HP
- Modal di HP selalu berbentuk **bottom sheet** (slide dari bawah), bukan modal tengah — di laptop baru modal tengah

## 6. STRUKTUR NAVIGASI

**Bottom navigation (HP) — 5 tab:**
1. 🏠 Home (Dashboard)
2. 📋 Antrian
3. ➕ Order (tombol FAB tengah, kotak rounded biru muda `#4BB8FA`, ikon plus putih, sedikit menonjol ke atas dari bar)
4. 💰 Tagihan (dengan badge merah jumlah tagihan belum lunas)
5. ⋯ Lainnya (buka bottom sheet berisi menu tambahan)

**Menu "Lainnya" (bottom sheet grid ikon):**
Buku Kas, Deposit, Antar Jemput, Jadwal Jemput (Reservasi), Promo, Poin, Pelanggan, Pusat WA, Laporan, Layanan, Stok Bahan, AI Insight, Pengaturan

**Sidebar (laptop):** sama seperti daftar di atas tapi selalu terlihat, dikelompokkan per kategori (Operasional, Keuangan, Marketing, Master).

## 7. DAFTAR HALAMAN & ISI KONTEN

### 7.1 Login
- Card tengah, logo, form username + password, tombol login biru primary

### 7.2 Dashboard (Home)
Prioritas tampilan dari atas ke bawah:
1. Header: nama toko, tanggal, ikon notifikasi
2. KPI strip (3 angka ringkas: order hari ini, omset hari ini, sedang proses)
3. **Card Tagihan Belum Lunas** (gradient merah, paling menonjol) — total nominal + jumlah order, lalu 3 card order terbaru dengan tombol [Lunasi] [WA]
4. Seksi "Perlu Tindakan" — order selesai belum diambil, order lewat waktu estimasi
5. Widget Antar Jemput (muncul otomatis kalau ada order AJ hari ini) — rute optimal, breakdown HPP, tombol terapkan tarif
6. Widget Stok Bahan Menipis (kalau ada bahan di bawah batas minimum)
7. Antrian aktif — card per order dengan tombol aksi inline (Proses/Selesai/Lunasi/WA)
8. Grafik omset 7 hari (laptop saja, disembunyikan di HP)

### 7.3 Order Baru
Form paling sering dipakai — harus sat-set (maksimal 3 tap untuk kasus umum):
1. Pilih pelanggan (search + suggestion, atau tombol "Tamu/Walk-in")
2. Kalau pelanggan pernah order sebelumnya → tawarkan "Ulangi order terakhir?" (quick repeat)
3. Pilih layanan — chip layanan populer (6 teratas) untuk tap cepat, atau buka daftar lengkap
4. Rincian pakaian per layanan (opsional, expand — pilih dari master pakaian: baju, celana, dll atau ketik baru)
5. Biaya tambahan (opsional)
6. Diskon — nominal atau persen (opsional)
7. Toggle Antar Jemput (kalau aktif, tampilkan estimasi biaya AJ berdasar jarak pelanggan)
8. Cara bayar: tab [Bayar Sekarang] [DP] [Bayar Nanti] — termasuk opsi metode Tunai/Transfer/QRIS/Deposit, saldo deposit pelanggan ditampilkan langsung di opsi Deposit
9. Ringkasan harga live update di panel kanan (laptop) / sticky bottom (HP)
10. Tombol: [Simpan & Cetak] (utama) / [Simpan & Kirim WA] / [Simpan Saja]

### 7.4 Antrian
- Filter pill: Semua / Aktif / Selesai / Lewat Waktu 🔴 / Belum Lunas
- Card per order: nomor order, nama pelanggan, ringkasan layanan, total, 2 badge status (status order + status bayar), tombol aksi inline (Proses/Selesai/Lunasi/WA/Cetak Label/Detail)
- Label tombol cetak label: kalau order >1 layanan, tap dulu munculkan bottom sheet pilih layanan mana yang mau dicetak

### 7.5 Tagihan
- Summary card gradient merah di atas (total tagihan + jumlah order)
- Filter: Semua / Belum Bayar / DP
- Card per tagihan (mirip antrian tapi fokus ke status bayar), sort dari yang paling lama menunggak
- Tombol [Lunasi] [Tagih via WA] di tiap card

### 7.6 Detail Order
- Header: nomor order + 2 badge status
- Info pelanggan (nama, WA, alamat, saldo deposit, level poin)
- Daftar layanan + rincian pakaian per layanan
- Biaya tambahan, diskon
- Ringkasan harga
- Timeline waktu (masuk, estimasi, selesai, diambil)
- Info pembayaran + riwayat bayar (kalau DP/cicilan)
- Tombol aksi lengkap: update status, lunasi, cetak struk, cetak label, kirim WA, edit layanan, hapus order (owner only)

### 7.7 Pelanggan
- Search bar, tombol [+ Tambah] [Import] [Export]
- Card per pelanggan: nama, nomor WA, total order, total belanja, level poin, badge level (Bronze/Silver/Gold)
- Form tambah/edit termasuk field jarak dari workshop (untuk kalkulasi Antar Jemput) dan catatan (parfum favorit, instruksi khusus, catatan internal)

### 7.8 Deposit
- Ringkasan total saldo beredar + jumlah pelanggan aktif
- Card per pelanggan dengan saldo, tombol [+Topup] [Mutasi]
- Riwayat mutasi per pelanggan (topup, potong saat bayar, kelebihan bayar, batalkan topup)

### 7.9 Antar Jemput
- Kalkulator HPP: pilih pelanggan yang mau dijemput hari itu → sistem hitung rute optimal (nearest-neighbor) + breakdown biaya (BBM, waktu operator, aus kendaraan) → saran tarif dari AI DeepSeek
- Riwayat rute yang pernah dibuat (historical pricing — parameter di-snapshot saat itu, tidak berubah kalau pengaturan diupdate belakangan)

### 7.10 Jadwal Jemput (Reservasi)
- Card per jadwal: tanggal, jam, nama pelanggan, alamat, catatan, tombol [Selesai] [Edit] [Hapus]
- Widget reminder muncul otomatis di dashboard kalau ada jadwal hari ini

### 7.11 Stok Bahan
- Alert banner kalau ada bahan di bawah batas minimum
- Card per bahan: nama, stok saat ini, rasio pemakaian per kg/pcs, tombol [Restock] [Koreksi] [Riwayat Mutasi]
- Stok berkurang otomatis tiap ada order baru sesuai volume

### 7.12 Laporan (laptop-first, tabel lebih detail)
- Tab: Ringkasan / Layanan / Pelanggan / Antar Jemput
- KPI card, grafik, tabel top layanan/pelanggan, laba rugi dari buku kas
- Export CSV/Excel di tiap tab

### 7.13 Buku Kas
- Ringkasan kas masuk/keluar/saldo bersih (card gradient)
- Filter jenis: Semua/Masuk/Keluar
- Card transaksi (otomatis dari sistem = badge "Otomatis" tidak bisa diedit; manual = bisa edit/hapus)

### 7.14 Layanan (Master)
- Card per layanan per kategori: nama, harga, satuan, HPP, margin %, estimasi waktu (dalam jam, format otomatis jadi "X jam" atau "X hari Y jam")
- Form tambah/edit dengan toggle mode: input harga manual, atau dari HPP+target margin

### 7.15 Pusat WA
- Tab: Tagihan Belum Lunas (kirim tagih cepat) / Broadcast (kirim promo massal ke grup pelanggan tertentu)
- Riwayat pesan terkirim

### 7.16 AI Insight & AI Chat
- Chat box tanya-jawab tentang data bisnis (ditenagai DeepSeek API)
- Insight otomatis: ringkasan bisnis, tren, peringatan (stok menipis, tagihan menumpuk), prediksi hari/jam tersibuk

### 7.17 Poin & Promo
- Poin: pengaturan rasio poin per rupiah, daftar pelanggan dengan poin
- Promo: kelola paket promo (diskon otomatis untuk kombinasi layanan tertentu)

### 7.18 Pengaturan
Tab-tab: Profil Usaha, WhatsApp, Printer, Margin & HPP, AI Assistant, Manajemen User (role Owner/Karyawan), Backup & Restore, Template Cetak (Struk/Label — bisa atur elemen mana yang tampil & urutannya, dengan preview live)

## 8. KOMPONEN UI YANG SERING MUNCUL (harus konsisten)

- **Badge status order:** pending (abu), proses (biru), selesai (hijau), diambil (biru tua solid+teks putih), dibatalkan (merah)
- **Badge status bayar:** lunas (hijau), belum lunas (merah), DP (kuning)
- **Bottom sheet universal** untuk aksi cepat tanpa pindah halaman: Lunasi, Kirim WA, Cetak Label (pilih layanan)
- **Card order** dengan garis warna di sisi kiri sesuai status, tombol aksi inline di bawahnya
- **FAB tombol Order** — satu-satunya elemen dengan bentuk kotak rounded menonjol di bottom nav
- **Toast notification** kecil di bawah untuk konfirmasi aksi (bukan alert/modal)

## 9. TERMINOLOGI PENTING (jangan diubah saat desain ulang)

- "Layanan" (bukan "item") untuk jenis cucian/jasa
- "Rincian Pakaian" (bukan "rincian item") untuk detail pakaian dalam satu layanan
- "Master Pakaian" untuk daftar jenis pakaian yang bisa dipilih berulang
- Nomor telepon selalu ditampilkan format `08xxx` (walau tersimpan `628xxx` di database)

## 10. HAL YANG SEBAIKNYA DIHINDARI SAAT REDESIGN

- Jangan ubah bentuk data/struktur — ini murni brief untuk tampilan visual
- Jangan hilangkan tombol Lunasi dari order manapun yang belum lunas (termasuk yang sudah diambil)
- Jangan buat modal/dialog konfirmasi berlebihan untuk aksi ringan (update status cukup toast, bukan konfirmasi dialog)
- Prioritaskan clarity di atas dekorasi — ini alat kerja harian, bukan showcase visual
