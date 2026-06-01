# Debug Progress POS Laundry

## Status: IN PROGRESS
## Terakhir diupdate: 2026-06-01 (sesi 1)

## Area yang SUDAH selesai di-debug:
- [x] AREA 1 — Dependency & setup — selesai, 1 bug ditemukan & diperbaiki
- [x] AREA 2 — Database & migration — selesai, index performa ditambahkan
- [x] AREA 3 — Autentikasi & session — selesai, tidak ada bug (verified live)
- [x] AREA 4 — Order baru (KRITIS) — selesai, 2 bug diperbaiki & diuji live
- [x] AREA 5 — Print thermal (KRITIS) — selesai, pesan error dirapikan
- [x] AREA 6 — WhatsApp Business (KRITIS) — selesai, verified live, 1 fix minor
- [x] AREA 7 — Deposit — selesai, semua check LULUS (verified live), tidak ada bug kode
- [x] AREA 8 — Poin pelanggan — selesai, 1 BUG SERIUS + 1 konsistensi diperbaiki (verified live)
- [x] AREA 9 — Promo & paket — selesai, 1 bug diperbaiki (verified live)
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
| 6  | waController.js | Fallback wa_mode di endpoint log = 'regular' (inkonsisten dgn default 'business'). Diselaraskan ke 'business' | FIXED |
| 7  | transaksiService.js + poinController.js | **SERIUS**: poin punya 2 sumber kebenaran (kolom pelanggan.total_poin & tabel poin_pelanggan). `sesuaikan` update poin_pelanggan (no-op kalau row blm ada) tapi `upsertPoinPelanggan` hitung dari poin_pelanggan (kosong=0) lalu TIMPA pelanggan.total_poin→0. Akibat: poin pelanggan HILANG tiap transaksi setelah penyesuaian manual. Fix: pelanggan.total_poin jadi sumber kebenaran tunggal, poin_pelanggan di-upsert sbg cache sinkron. Diuji: sesuaikan+500→tukar200→300 (bukan 0), earn lunas→308 | FIXED |
| 8  | waController.js | Filter level broadcast pakai threshold hardcode (5000/2000/500), tdk ikut pengaturan level_*_min. Diperbaiki baca dari pengaturan | FIXED |
| 9  | paketPromoModel.js + transaksiController.js | findById saat order HANYA cek aktif, TIDAK validasi periode/hari → promo kedaluwarsa/di luar hari bisa dipakai via ID langsung (diskon tetap jalan). Tambah findByIdValid (cek periode+hari) & dipakai di store. Diuji: promo expired & promo hari-lain DITOLAK saat order; promo valid 10% diterapkan (8000→7200) | FIXED |

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

## Bug LOW/MEDIUM-priority belum diperbaiki:
| No | File | Bug | Priority |
|----|------|-----|----------|
| L1 | transaksiModel.js | generateNomor tidak atomic (race condition teoretis), tapi UNIQUE constraint melindungi | LOW |
| L2 | transaksiController.js store() | Pembuatan transaksi + potong deposit + poin + kas TIDAK dalam 1 DB transaction. Jika deposit.bayar gagal SETELAH transaksi dibuat → bisa phantom transaksi. Dilindungi pre-check saldo (line 133) utk kasus umum; risiko nyata kecil di single-kasir. Perlu refactor besar (pass trx) → ditunda | MEDIUM |

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

## Catatan AREA 6 (informasi, semua LULUS):
- generateURL default 'business' → api.whatsapp.com; 'regular' → wa.me. Diuji LIVE semua endpoint.
- nota/tagihan/notif: baca default dari wa_mode_default (DB), terima override ?mode. Diuji ✓.
- broadcast: baca default + terima body.mode. Default business, host api.whatsapp.com ✓.
- DB pengaturan: wa_mode_default=business (legacy wa_mode sudah di-rename, tidak ada lagi).
- Template wa_template_nota/tagihan/notif_selesai: SEMUA variabel {..} tersedia di builder.
  render() aman untuk var tak dikenal (dibiarkan sebagai {var}).
- formatPhone: strip non-digit, 0→62, prepend 62. Benar.

## Catatan AREA 7 (informasi, semua LULUS):
- Model deposit (getSaldo/topup/bayar/tambahKelebihan) pakai db.transaction atomik + catat mutasi.
- Diuji LIVE: topup 50k→mutasi tercatat; topup negatif ditolak (Joi positive);
  bayar deposit > saldo tanpa kekurangan → error "Saldo tidak cukup" (pre-check, tdk buat transaksi);
  bayar deposit+kekurangan → saldo jadi 0 (TIDAK minus); notif WA saldo tipis ter-log otomatis.
- bayar() throw bila saldo < nominal → saldo tidak pernah minus.
- Akunting: topup tidak masuk kas; kas dicatat saat deposit DIPAKAI (total_bayar order). Single-count, konsisten.
- Routing depositRoutes aman (Express cocokkan jumlah segmen; /mutasi/semua & /mutasi/export tak bentrok /:pelangganId).
- Data test (pelanggan DepoTest id=3) sudah DIHAPUS bersih.

## Catatan AREA 8 (informasi):
- TIDAK ADA "multiplier" earning per level. Poin earned flat = floor(total_bayar/poin_per_nominal).
  Level Bronze/Silver/Gold/Platinum = TIER loyalitas (display/filter), bukan pengali earning.
  getLevel pakai threshold konfigurabel (level_*_min) & dihitung benar. Bila bisnis ingin
  Gold dapat poin lebih, itu FITUR BARU (bukan bug) — tidak diimplementasi.
- Frontend wa-center.html getLevel masih hardcode 5000/2000/500 (hanya utk label di stepper
  broadcast) — kosmetik, backend broadcast sudah pakai threshold dinamis. LOW priority.
- Diuji: tukar poin kurangi saldo (verified setelah fix), riwayat_poin tercatat (tambah/kurang),
  earn saat lunas, level Silver pada 500 poin.
- Pelanggan asli: TIDAK ada desync poin saat audit (data konsisten).

## Catatan AREA 9 (informasi):
- hari_berlaku = JSON array hari [0..6] (0=Minggu). Match pakai LIKE %dow%. Aman krn hari
  cuma 1 digit (0-6), tidak ada false-match substring.
- hitungTotal: diskon_persen → round(total*persen/100); diskon_nominal → nominal;
  jika total < min_pembelian → diskon=0. Benar.
- Diuji LIVE: dropdown /promo/aktif sembunyikan expired & hari-lain; order tolak keduanya;
  promo valid 10% diterapkan benar.

## Langkah berikutnya saat sesi lanjut:
Lanjut ke AREA 10 — Margin layanan
