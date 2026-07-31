# Handoff: POS Nala Laundry (Mobile-First)

## Overview
Aplikasi POS untuk usaha laundry solo-operator (Nala Laundry, Mempawah Hilir). Prioritas: navigasi cepat, order baru maksimal 3 tap, alat kerja harian yang simpel dan tidak ramai. Mobile-first 375px; laptop dipakai sesekali (terutama Laporan).

## About the Design Files
File dalam bundel ini adalah **referensi desain yang dibuat dalam HTML** — prototipe yang menunjukkan tampilan dan perilaku yang diinginkan, BUKAN kode produksi untuk disalin langsung. Tugasnya adalah **membuat ulang desain ini di environment codebase target** (React, Vue, Flutter, dsb.) memakai pola dan library yang sudah ada — atau, jika belum ada codebase, pilih framework paling sesuai (rekomendasi: React/Next.js atau Flutter untuk mobile-first PWA) lalu implementasikan di sana.

File `PosApp.dc.html` berisi template HTML + logic class JavaScript. Bagian `<x-dc>` adalah markup (dengan placeholder `{{ }}` dan loop `<sc-for>` / kondisi `<sc-if>`), bagian `<script>` berisi state, data dummy, dan handler — keduanya bisa dibaca langsung sebagai spesifikasi perilaku.

## Fidelity
**High-fidelity (hifi).** Warna, tipografi, spacing, radius, dan interaksi adalah final dan sudah disetujui pemilik usaha. Recreate pixel-perfect memakai library/pattern codebase.

## Navigasi (model terpilih: "Pill Ramping")
- **Nav pill mengambang**: bar putih rounded-full, mengambang `bottom:16px`, `left:14px`, `right:84px`, tinggi 58px, shadow `0 6px 20px rgba(45,59,181,0.18)`. Berisi 4 item: Home, Antrian, Tagihan, Lainnya (ikon titik tiga).
  - Item aktif: background pill `#E3F2FF`, warna ikon `#2D3BB5`, label 12px/700 muncul di samping ikon. Item nonaktif: ikon `#94A3B8`, tanpa label.
  - Badge merah jumlah tagihan belum lunas menempel di item Tagihan (`#EF4444`, teks putih 9px/700).
- **FAB Order**: terpisah di kanan bawah (`right:14px; bottom:16px`), 58×58px, radius 20px, background `#4BB8FA`, ikon plus putih, shadow `0 6px 16px rgba(75,184,250,0.5)`.
- **Nav disembunyikan di halaman Order Baru** (halaman itu punya tombol back + action bar sticky sendiri).
- **Menu Lainnya**: bottom sheet berisi grid 4 kolom, 13 menu. Tile 50×50px radius 14px background `#E3F2FF`, monogram 2 huruf `#2D3BB5` 14px/800 (BUKAN emoji/ikon ramai), label 11px `#64748B`.
- Ikon nav: SVG stroke sederhana (stroke-width 1.8, linecap round) — home, tiga garis (antrian), dompet (tagihan), titik tiga.

## Screens / Views

### 1. Dashboard (Home)
- Padding halaman 18px 16px, bottom padding 130px (ruang nav), gap antar seksi 14px, background `#F0F7FF`.
- **Header**: wordmark "nala laundry" 20px/800 `#2D3BB5` + tanggal 12px `#64748B`; kanan: tombol notifikasi 40×40 putih radius 10.
- **KPI strip**: grid 3 kolom gap 8px. Card putih radius 10, padding 12px 10px, shadow `0 1px 3px rgba(45,59,181,0.08)`. Label 11px uppercase letter-spacing 0.6px `#64748B`; angka 20px/800 (`Order`, `Omset`, `Proses`).
- **Card Tagihan Belum Lunas** (hanya jika ada): satu-satunya gradient merah `linear-gradient(135deg,#EF4444,#DC2626)`, radius 12, padding 16. Label uppercase 11px opacity .85, nominal 24px/800 putih, chip "N order" background `rgba(255,255,255,0.2)`. Tap → halaman Tagihan.
- **Perlu Tindakan**: card putih dengan border-left 4px (`#EF4444` lewat waktu / `#F59E0B` selesai belum diambil), nama + nomor order 14px/600, note 12px berwarna sesuai, chevron kanan. Tap → Detail Order.
- **Antrian aktif** (maks 3): card order standar (lihat Komponen) + link "Lihat semua" 12px `#2563EB`.

### 2. Antrian
- Judul 20px/800.
- **Filter pills**: baris TETAP (bukan scroll), 4 pill sama lebar (`flex:1`): Semua / Aktif / Selesai / Lewat Waktu. Tinggi 36px, radius full, 12px/600. Aktif: bg `#2D3BB5` teks putih; nonaktif: bg putih, teks `#64748B`, border `#E2E8F0`. CATATAN: filter "Belum Lunas" sengaja TIDAK ada di sini — urusan bayar hanya di Tagihan.
- Daftar card order standar dengan tombol aksi inline: [aksi status berikutnya] [Lunasi jika belum lunas] [WA 52px] [Label 60px ungu `#8B5CF6`].
- Empty state: teks tengah 13px `#94A3B8`.

### 3. Tagihan
- Summary card gradient merah (sama seperti dashboard): "Total belum lunas", nominal 26px/800, jumlah order.
- Filter: Semua / Belum Bayar / DP (pill sama seperti Antrian).
- Card per tagihan: nomor order + umur tunggakan ("menunggak 3 hari" / "DP Rp5.000"), sisa tagihan 15px/700 `#EF4444`. Tombol [Lunasi] hijau solid `#10B981` + [Tagih via WA] outline, keduanya tinggi 38px flex:1.
- Sort dari yang paling lama menunggak.

### 4. Order Baru (maks 3 tap untuk kasus umum: pelanggan → layanan → Simpan)
- Header back + judul. Nav bawah DISEMBUNYIKAN.
- **Langkah 1 · Pelanggan**: chip pelanggan (recent) + chip "Tamu / Walk-in". Chip 38px radius full; terpilih bg `#2D3BB5` putih.
  - Jika pelanggan punya order sebelumnya & belum pilih layanan: banner "Ulangi order terakhir?" bg `#E3F2FF`, teks `#2563EB`, tombol [Ulangi] `#2563EB` → mengisi layanan otomatis.
- **Langkah 2 · Layanan**: grid 2 kolom chip layanan (6 populer), min-height 54px radius 10; terpilih: bg `#E3F2FF` border `#2563EB`. Nama 13px/600 + harga "Rp7.000/kg" 12px `#94A3B8`.
  - Layanan terpilih memunculkan row qty: nama + "3 kg · Rp21.000" + stepper −/+ (tombol 32×32 radius 8 border `#E2E8F0`). Default: 3 kg (satuan kg) / 1 pcs. Qty 0 = hapus.
- **Langkah 3 · Pembayaran**: segmented tab bg `#E2E8F0` radius 10 padding 3: [Bayar Sekarang] [DP] [Bayar Nanti]; aktif bg putih teks `#2D3BB5`. Metode (kecuali Bayar Nanti): chip Tunai / Transfer / QRIS / Deposit — chip Deposit menampilkan saldo pelanggan, mis. "Deposit (Rp50.000)".
- **Sticky bottom bar**: putih, border-top, shadow `0 -4px 16px rgba(45,59,181,0.08)`. Ringkasan "Nama · N layanan" + total 20px/800 live-update. Tombol: [Simpan & Cetak] primary `#2D3BB5` flex:2 tinggi 48px; [Kirim WA] outline flex:1; [Simpan] outline 74px.
- Validasi: tanpa pelanggan / layanan → toast "Pilih pelanggan dan minimal 1 layanan dulu" (bukan alert).
- Setelah simpan: order baru status pending masuk ke atas Antrian, navigasi ke Antrian, toast konfirmasi. DP default = 50% total dibulatkan ke ribuan.

### 5. Detail Order
- Header: back + nomor order 20px/800 + 2 badge (status order + status bayar).
- Card info pelanggan: nama 15px/700, WA 13px, catatan 12px `#94A3B8` ("Tanpa catatan" jika kosong).
- Card layanan: rincian + Total (border-top) + "Sisa tagihan" merah jika belum lunas.
- Card timeline: dot 10px + label + waktu (Masuk / Estimasi selesai — merah jika lewat / Diambil).
- Grid tombol 2 kolom tinggi 44px: [aksi status berikutnya] primary, [Lunasi] hijau solid, [Kirim WA], [Cetak Label] teks `#8B5CF6`, [Cetak Struk].

### 6. Pelanggan
- Header + tombol [+ Tambah]. Search bar 42px (filter nama/WA live).
- Card: nama 15px/700, WA 12px, badge level kanan (Gold bg `#FEF3E2` teks `#F59E0B`; Silver bg `#E2E8F0` teks `#64748B`; Bronze bg `#F1F5F9` teks `#94A3B8`). Baris statistik border-top: Order / Belanja / Poin + tombol WA.
- Form tambah/edit (belum di-mock): wajib ada field jarak dari workshop (kalkulasi Antar Jemput) + catatan.

### 7. Deposit
- Card hero gradient biru `linear-gradient(135deg,#2D3BB5,#2563EB)`: "Saldo beredar" total + N pelanggan.
- Card per pelanggan: nama + saldo (hijau `#10B981` jika >0, abu jika 0), tombol [+ Topup] hijau solid + [Mutasi] outline.

### 8. Buku Kas
- Card hero gradient biru: grid 3 (Masuk / Keluar / Bersih).
- Filter pill: Semua / Masuk / Keluar.
- Row transaksi: label + waktu + badge "Otomatis" (bg `#E3F2FF` teks `#2563EB`, tidak bisa diedit) atau "Manual" (abu, bisa edit/hapus). Nominal kanan 14px/800: `+Rp…` hijau / `−Rp…` merah.

### 9. Stok Bahan
- Alert banner jika ada bahan < batas minimum: bg `#FDECEC` border `#EF4444` teks merah 13px/600.
- Card per bahan: nama + stok saat ini (merah jika low), "Batas min … · pemakaian …/kg", tombol [Restock] primary / [Koreksi] / [Riwayat].
- Stok berkurang otomatis per order sesuai rasio pemakaian.

### 10. Jadwal Jemput
- Header + [+ Jadwal]. Card: nama + "Kamis, 31 Jul · 09.00" `#2563EB`, alamat, catatan italic. Tombol [Selesai] hijau (hapus dari list + toast) / [Edit] / [Hapus] (teks merah).
- Widget reminder muncul di dashboard jika ada jadwal hari ini.

### 11. Laporan (mobile lite; versi laptop = tabel penuh + export CSV)
- KPI grid 3: Omset / Order / **Margin dalam NOMINAL** (mis. "540rb", hijau `#10B981`) — bukan persentase.
- Card "Top layanan": nama + nominal + progress bar 6px `#4BB8FA` di track `#F1F5F9`, lebar relatif terhadap layanan teratas.

### 12. Antar Jemput
- Chip pelanggan yang dijemput hari ini (multi-select).
- Card rute optimal (nearest-neighbor): "Workshop → A → B → Workshop", breakdown HPP (BBM / Waktu operator / Aus kendaraan / Total), box saran tarif AI bg `#E3F2FF`, tombol [Terapkan Tarif].
- Riwayat rute: parameter di-snapshot saat dibuat (historical pricing — tidak berubah kalau pengaturan diupdate).

### 13. Promo
- Card per promo: nama + badge Aktif (hijau)/Nonaktif (abu), deskripsi, tombol toggle [Aktifkan]/[Nonaktifkan] + [Edit].

### 14. Poin
- Card pengaturan rasio ("1 poin per Rp5.000") + [Ubah].
- List pelanggan sort poin desc: nama + badge level + poin 16px/800 `#F59E0B` + [Tukar].

### 15. Pusat WA
- Segmented tab: [Tagihan] / [Broadcast].
- Tagihan: list order belum lunas → [Tagih] per row.
- Broadcast: pilih grup (Semua/Gold/Silver), preview template, tombol kirim menampilkan jumlah penerima.
- Riwayat pesan terkirim.

### 16. AI Insight
- 3 card insight border-left 4px: tren (hijau), peringatan stok (merah), prediksi jam sibuk (kuning).
- Chat: bubble user kanan bg `#2D3BB5` putih, bubble AI kiri putih; input sticky di atas nav + tombol kirim 46×46 `#2D3BB5`. Backend: DeepSeek API.

### 17. Pengaturan
- List card tunggal, row per seksi (Profil Usaha, WhatsApp, Printer, Margin & HPP, AI Assistant, Manajemen User, Backup & Restore, Template Cetak) dengan monogram tile + subtitle + chevron.

## Komponen Konsisten

### Card Order (dipakai di Home & Antrian)
- Putih radius 10, shadow tipis, garis warna kiri 4px sesuai status.
- Baris 1: nomor order 12px/700 `#94A3B8` + 2 badge kanan.
- Baris 2: nama 15px/600 + layanan 13px `#64748B` (kiri), total 15px/700 (kanan). Tap → Detail.
- Baris 3: tombol aksi inline tinggi 36px radius 8.

### Badge status order (11px/600, padding 3px 8px, radius 6)
- pending: bg `#F1F5F9` teks `#64748B`, bar `#94A3B8`
- proses: bg `#E3F2FF` teks `#2563EB`, bar `#4BB8FA`
- selesai: bg `#E7F8F1` teks `#10B981`, bar `#10B981`
- diambil: bg `#2D3BB5` teks putih, bar `#2D3BB5`

### Badge status bayar
- lunas: bg `#E7F8F1` teks `#10B981`
- belum lunas: bg `#FDECEC` teks `#EF4444`
- DP: bg `#FEF3E2` teks `#F59E0B`

### Bottom sheet universal
- Overlay `rgba(30,42,110,0.45)` fade-in 0.2s; sheet putih radius atas 18px, slide-up 0.25s ease, drag-handle 40×4 `#E2E8F0`. Tap overlay = tutup.
- Varian: Lainnya (grid menu), Lunasi (pilih metode Tunai/Transfer/QRIS/Deposit, row 50px), Kirim WA (pilih template pesan), Cetak Label (pilih layanan jika order >1 layanan).

### Toast
- Pill gelap `#1E2A6E` teks putih 13px/600, muncul di atas nav (bottom 96px, center), animasi naik 0.2s, auto-hilang ±2,2 detik. SEMUA konfirmasi aksi ringan pakai toast — JANGAN dialog konfirmasi.

## Interactions & Behavior
- Update status order berjenjang: pending → Proses → Selesai → Diambil (satu tombol aksi utama per card, label = status berikutnya).
- Tombol Lunasi tampil di SEMUA order belum lunas, termasuk yang sudah diambil — jangan pernah dihilangkan.
- Lunasi via bottom sheet → status bayar jadi lunas + toast "(metode)".
- Order Baru: lihat detail di atas; total live-update.
- Semua aksi di luar scope → toast, bukan halaman kosong.

## State Management
- `page` (route aktif), `sheet` (bottom sheet aktif + order terkait), `toast`.
- `orders[]`: id, pelanggan, layanan, total, paid, status, pay, timestamps, flag late.
- Filter per halaman: antrianFilter, tagihanFilter, kasFilter.
- Form order: custId, layanan terpilih {id: qty}, payTab, method.
- Data fetch riil: orders, customers (dengan deposit/poin/level/jarak), services (harga/HPP/estimasi), kas, stok, jadwal, promo.

## Design Tokens
```
Primary        #2D3BB5   Secondary   #4BB8FA   Medium blue  #2563EB
Accent/DP      #F59E0B   Success     #10B981   Danger       #EF4444
Purple(Label)  #8B5CF6
Gray-1 #F8FAFF  Gray-2 #F1F5F9  Gray-3 #E2E8F0  Gray-4 #94A3B8  Gray-5 #64748B
Teks utama #1E2A6E   BG halaman #F0F7FF   BG card #FFFFFF
Aksen muda: biru #E3F2FF · hijau #E7F8F1 · merah #FDECEC · kuning #FEF3E2

Font: -apple-system, "Segoe UI", Roboto, sans-serif (tanpa custom font)
Heading halaman 20px/800 · card title 15px/600-700 · body 14px/13px
caption 11-12px uppercase letter-spacing 0.5-0.8px · nominal selalu bold
Radius: card 10px · card hero 12px · tombol 8-10px · chip/pill full
Shadow card: 0 1px 3px rgba(45,59,181,0.08)
Tinggi tombol: CTA utama 48px · sekunder 36-44px · tap target min 44px (versi produksi)
Gradient HANYA untuk card hero (tagihan merah, deposit/kas biru) — selain itu flat
```

## Aturan Penting (dari pemilik)
- TANPA emoji di UI — ikon = SVG stroke sederhana atau monogram huruf.
- Warna tidak ramai — mayoritas putih/biru muda, warna kuat hanya untuk status & CTA.
- Nomor telepon selalu tampil format `08xxx` (tersimpan `628xxx`).
- Terminologi: "Layanan" (bukan item), "Rincian Pakaian", "Master Pakaian".
- Modal di HP selalu bottom sheet; modal tengah hanya di laptop.
- Clarity di atas dekorasi — ini alat kerja harian.

## Assets
Tidak ada aset gambar. Semua ikon SVG inline (stroke 1.8-2, linecap round) — bisa diganti lucide/heroicons dengan bentuk setara. Logo "nala laundry" milik pemilik usaha (belum disertakan — minta file asli).

## Files
- `PosApp.dc.html` — prototipe lengkap: template semua halaman + logic (state, data dummy, handler). Sumber kebenaran utama.
- `POS Nala Laundry.dc.html` — kanvas presentasi (perbandingan varian navigasi; model terpilih: Pill Ramping / `nav-variant="pill"`).
- `Brief_Design_POS_Laundry.md` — brief asli dari pemilik usaha.
