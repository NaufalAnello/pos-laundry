# Debug Progress POS Laundry

## Status: IN PROGRESS
## Terakhir diupdate: 2026-06-01 (sesi 1)

## Area yang SUDAH selesai di-debug:
- [x] AREA 1 — Dependency & setup — selesai, 1 bug ditemukan & diperbaiki
- [x] AREA 2 — Database & migration — selesai, index performa ditambahkan
- [ ] AREA 3 — Autentikasi & session
- [ ] AREA 4 — Order baru (KRITIS)
- [ ] AREA 5 — Print thermal (KRITIS)
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

## Langkah berikutnya saat sesi lanjut:
Lanjut ke AREA 3 — Autentikasi & session
