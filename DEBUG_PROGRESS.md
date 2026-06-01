# Debug Progress POS Laundry

## Status: IN PROGRESS
## Terakhir diupdate: 2026-06-01 (sesi 1)

## Area yang SUDAH selesai di-debug:
- [x] AREA 1 — Dependency & setup — selesai, 1 bug ditemukan & diperbaiki
- [ ] AREA 2 — Database & migration
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

## Catatan AREA 1 (bukan bug, informasi):
- Semua dependency ARM64-compatible: better-sqlite3 compile from source (python3/make/g++ ada di Dockerfile), sisanya pure-JS (bcryptjs, joi, express, knex). Tidak ada package x86-only.
- .env lengkap: DB_PATH, NODE_ENV, PORT, SESSION_SECRET semua dipakai kode.
- PRINTER_* di .env TIDAK dipakai kode (printer pakai USB ID hardcode 0x0fe6:0x811e). Harmless leftover.
- SESSION_SECRET=ganti_ini masih placeholder → dicatat untuk AREA 13 (Keamanan).

## Bug yang ditemukan tapi BELUM diperbaiki:
| No | File | Bug | Priority |
|----|------|-----|----------|
| -  | .env | SESSION_SECRET masih placeholder `ganti_ini` | akan ditangani di AREA 13 |

## Langkah berikutnya saat sesi lanjut:
Lanjut ke AREA 2 — Database & migration
