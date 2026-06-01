# Debug Progress POS Laundry

## Status: IN PROGRESS
## Terakhir diupdate: 2026-06-01 (sesi 1)

## Area yang SUDAH selesai di-debug:
- [x] AREA 1 — Dependency & setup — selesai, 1 bug ditemukan & diperbaiki
- [x] AREA 2 — Database & migration — selesai, index performa ditambahkan
- [x] AREA 3 — Autentikasi & session — selesai, tidak ada bug (verified live)
- [x] AREA 4 — Order baru (KRITIS) — selesai, 2 bug diperbaiki & diuji live
- [x] AREA 5 — Print thermal (KRITIS) — selesai, pesan error dirapikan
- [ ] AREA 6 — WhatsApp Business (KRITIS)
- [ ] AREA 7 — Deposit
- [ ] AREA 8 — Poin pelanggan
- [ ] AREA 9 — Promo & paket
- [ ] AREA 10 — Margin layanan
- [ ] AREA 11 — Laporan & kas
- [ ] AREA 12 — Responsif & UI
- [ ] AREA 13 — Keamanan

## Bug yang ditemukan dan diperbaiki:
| No | File | Bug | Status |
|----|------|-----|--------|
| 1  | docker-compose.yml | USB device path di-hardcode `/dev/bus/usb/001/003` → container gagal start saat printer pindah port. Diganti mount seluruh `/dev/bus/usb` (privileged sudah aktif) | FIXED |
| 2  | migrations/20260601000022 | Tidak ada index di kolom yang sering di-query (transaksi.tanggal_masuk/pelanggan_id/status, detail_transaksi.transaksi_id/layanan_id, dll) → lambat di ARM saat data tumbuh. Tambah 10 index | FIXED |
| 3  | transaksiController.js | `estimasi_hari` layanan DIABAIKAN — `maxHari` baca dari `value.items` (request) yg tdk punya field itu → estimasi selesai SELALU +2 hari. Diperbaiki baca dari layanan (estimasiList). Diuji: layanan estimasi 3 → estimasi benar 3 hari | FIXED |
| 4  | transaksiController.js + transaksiService.js | Poin earned diberikan saat create TANPA cek lunas (order DP/belum bayar pun dapat poin, tdk sesuai spec). Dibuat helper `awardPoinJikaLunas` (idempotent), dipanggil di create/update/updateStatus hanya saat lunas. Diuji: belum lunas=0 poin, lunas=+poin, bayar ulang=tdk dobel | FIXED |
| 5  | printer.service.js | Pesan error printer berupa raw Python traceback (jelek di indikator & toast). Dirapikan jadi pesan ringkas: "Library pyusb belum terpasang" / "Printer tidak terhubung" / "Akses USB ditolak" | FIXED |

## Catatan AREA 1 (bukan bug, informasi):
- Semua dependency ARM64-compatible: better-sqlite3 compile from source (python3/make/g++ ada di Dockerfile), sisanya pure-JS (bcryptjs, joi, express, knex). Tidak ada package x86-only.
- .env lengkap: DB_PATH, NODE_ENV, PORT, SESSION_SECRET semua dipakai kode.
- PRINTER_* di .env TIDAK dipakai kode (printer pakai USB ID hardcode 0x0fe6:0x811e). Harmless leftover.
- SESSION_SECRET=ganti_ini masih placeholder → dicatat untuk AREA 13 (Keamanan).

## Bug yang ditemukan tapi BELUM diperbaiki:
| No | File | Bug | Priority |
|----|------|-----|----------|
| -  | .env | SESSION_SECRET masih placeholder `ganti_ini` | akan ditangani di AREA 13 |

## Catatan AREA 2 (informasi):
- 22 migration jalan fresh tanpa error; seed 01 & 02 OK.
- FK integrity: PRAGMA foreign_key_check = NONE; foreign_keys=ON aktif via knexfile afterCreate.
- Query agregasi laporan TIDAK crash saat data kosong (pakai COALESCE).
- Rollback + re-apply migration index teruji OK.

## Catatan AREA 3 (informasi, semua LULUS):
- Login/logout berfungsi (bcrypt.compare, session.destroy + clearCookie).
- Session store = connect-session-knex (tabel `sessions` di SQLite), BUKAN MemoryStore.
- Diuji LIVE: login→cookie→/me OK; protected route tanpa cookie=401, dengan cookie=data.
- Session PERSISTENT lintas restart server (cookie lama tetap valid setelah restart) ✓.
- /api/* dilindungi requireAuth (health & /auth/login publik, sesuai desain).
- Role: blockOperatorDelete global (non-admin tdk bisa DELETE), usersRoutes requireAdmin.
- SESSION_SECRET punya fallback non-kosong → cookie stabil lintas restart.
- CATATAN: belum ada rate limiting di /login → ditangani di AREA 13.

## Catatan AREA 4 (informasi):
- generateNomor (LDR-YYYYMMDD-NNN) tdk atomic — risiko race jika 2 order bersamaan,
  tapi ada UNIQUE constraint di nomor_transaksi (gagal aman, bukan korupsi data). LOW priority,
  single-kasir → risiko kecil. Dicatat, belum diubah.
- buatEntriKas dedup by transaksi_id (anti-dobel) → aman dipanggil ulang.
- kelebihan→deposit: kembalian di-nol-kan, excess masuk deposit. Diuji OK.
- Data test transaksi yg dibuat saat audit sudah DIHAPUS, poin & deposit pelanggan
  di-recompute ke nilai semula (8 poin, 29000 deposit).

## Bug LOW-priority belum diperbaiki:
| No | File | Bug | Priority |
|----|------|-----|----------|
| L1 | transaksiModel.js | generateNomor tidak atomic (race condition teoretis) | LOW |

## Catatan AREA 5 (informasi, semua LULUS):
- order.html: tombol "Simpan & Cetak" → submitOrder → cetakStrukOrder → POST /api/v1/transaksi/:id/print.
  TIDAK ada window.print() di public/ (tidak cetak halaman penuh).
- Struk server-side (strukController): tombol thermal POST /print; window.print() HANYA fallback
  manual (tombol "Print Browser") & auto-print bila ?print=1 (opt-in eksplisit). Benar.
- Route POST /api/v1/transaksi/:id/print → printer.cetakTransaksi ✓ (transaksiRoutes.js:23).
- GET /api/v1/printer/status ✓. POST /printer/test requireAdmin ✓.
- scripts/print.py ada, py_compile valid. printer.service load OK.
- Diuji LIVE tanpa printer/pyusb: /status connected:false, /print success:false, server TIDAK crash,
  pesan error ringkas. Di ARM device asli pyusb terpasang (Dockerfile) → akan mencetak.
- getPoinEarned (untuk poin di struk) query SUM riwayat_poin jenis=tambah → tetap akurat
  setelah perubahan poin di AREA 4 (1 entri earn per transaksi).

## Langkah berikutnya saat sesi lanjut:
Lanjut ke AREA 6 — WhatsApp Business (KRITIS)
