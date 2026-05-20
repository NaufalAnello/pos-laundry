# POS Laundry

Sistem kasir & manajemen laundry berbasis web — berjalan di jaringan lokal, dapat diakses dari HP, tablet, atau PC.

---

## Fitur Utama

- **Order & Status** — buat order, cetak nota WA, update status (antri → proses → siap → selesai)
- **Kas & Laporan** — buku kas manual, laporan omset harian/bulanan/tahunan, export CSV
- **Pelanggan & Poin** — data pelanggan, sistem poin, level (Bronze/Silver/Gold/Platinum)
- **Promo** — kode promo diskon persen/nominal, batas penggunaan
- **WhatsApp Center** — tagihan belum lunas, broadcast pesan, riwayat pesan WA
- **Print Thermal** — cetak struk langsung ke Xantri BT-58D via USB
- **Pengaturan** — profil toko, template WA, manajemen user, backup/restore

---

## Instalasi

### Persyaratan

| Komponen | Versi |
|----------|-------|
| Node.js  | ≥ 18  |
| npm      | ≥ 9   |

### Langkah

```bash
git clone <url-repo> pos-laundry
cd pos-laundry
npm install
cp .env .env.bak   # backup env jika ada
# Edit .env: isi SESSION_SECRET
npm run setup
npm start
```

**Dengan PM2 (auto-restart):**

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

Login default:
- Username: `admin`
- Password: `admin123`

> **Segera ganti password** setelah login pertama via Pengaturan → Manajemen User.

---

## Konfigurasi Printer Xantri BT-58D

1. Hubungkan printer via USB
2. Buka **Pengaturan → Printer**
3. Klik **↻ Cek Ulang** — pastikan status hijau "Printer terhubung"
4. Klik **🖨️ Test Print**

Jika error akses USB di Linux:

```bash
sudo usermod -a -G lp $USER
# atau sementara:
sudo chmod 666 /dev/usb/lp0
```

---

## Struktur Direktori

```
pos-laundry/
├── data/               # Database SQLite
│   └── laundry.db
├── public/             # Frontend (HTML, CSS, JS)
│   ├── css/layout.css
│   ├── js/nav.js
│   └── pages/
├── src/                # Backend Express
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   │   ├── wa.service.js
│   │   └── printer.service.js
│   └── app.js
├── src/database/
│   ├── migrations/
│   └── seeds/
├── server.js
└── knexfile.js
```
