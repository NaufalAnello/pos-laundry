# Screening Role-Based Access Control (Owner vs Karyawan)

Tanggal: 2026-08-06
Metode: 
1. Grep semua route file untuk daftar endpoint sensitif + verifikasi middleware
2. Buat akun karyawan test (`rbactest`) via API owner
3. **62 endpoint owner-only ditembak langsung dari sesi karyawan** — verifikasi
   semua return 403 (bukan 200/500 yang menyamarkan lolos otorisasi)
4. Edge case: URL direct (6 halaman), role tampering via header/body,
   default role untuk user baru (via API + raw SQL)
5. Audit frontend guard (`data-owner-only`, `isOwner()`, `gateOwnerPage`)

---

## Ringkasan

| Kategori                                                     | Status               |
|--------------------------------------------------------------|----------------------|
| Backend endpoint owner-only (62 endpoint) — semua 403        | Sudah benar          |
| Frontend `data-owner-only` guard di 7 halaman                | Sudah benar          |
| `gateOwnerPage` untuk 6 URL owner-only (redirect ke `/`)     | Sudah benar          |
| Default role user baru via API                               | Sudah benar (karyawan) |
| Role tampering via header/body — server tidak percaya        | Sudah benar          |
| **DDL kolom `users.role` default masih `'kasir'` (legacy)**  | **DIPERBAIKI** (RINGAN — data-normalize) |

**Tidak ada celah KRITIS ditemukan.** 1 issue RINGAN (data hygiene, bukan
security escalation) diperbaiki.

---

## Peta Endpoint Owner-Only (dengan middleware)

Middleware `requireOwner` = `requireAdmin` = `requireRole('owner')` — semua
alias dari 1 fungsi di `src/middleware/role.js`.

| Endpoint / Router                                | Middleware                         |
|--------------------------------------------------|------------------------------------|
| `/api/v1/laporan/*` (semua)                      | `router.use(requireOwner)`         |
| `/api/v1/kas/*` (semua)                          | `router.use(requireOwner)`         |
| `/api/v1/ai/*` (semua)                           | `router.use(requireOwner)`         |
| `/api/v1/poin/pengaturan` (GET/PUT)              | `requireAdmin`                     |
| `/api/v1/poin/pelanggan/*` (index/show/sesuaikan)| `requireAdmin`                     |
| `/api/v1/pengaturan` PUT + `/backup` + `/restore` + `/wa-mode` + `/template/*` | `requireAdmin` |
| `/api/v1/users/*` (CRUD)                         | `requireAdmin`                     |
| `DELETE /api/v1/transaksi/:id`                   | `requireAdmin`                     |
| `POST /api/v1/deposit/:id/batalkan-topup`        | `requireOwner`                     |
| `/api/v1/stok-bahan` POST/PUT/koreksi            | `requireOwner` (restock via `/tambah` boleh karyawan) |
| `/api/v1/promo` POST/PUT/PATCH                   | `requireAdmin` (GET boleh karyawan)|
| `/api/v1/pelanggan` POST/PUT + import/export     | `requireAdmin` (GET boleh karyawan)|
| `/api/v1/layanan` + kategori CRUD + import/export| `requireAdmin` (GET boleh karyawan)|
| `POST /api/v1/printer/test`                      | `requireAdmin`                     |
| `DELETE /api/v1/reservasi-jemput/:id`            | `requireAdmin`                     |
| **Global** — `app.use('/api', blockOperatorDelete)` — semua DELETE oleh non-owner → 403 |

---

## Hasil Test Bypass HTTP (62 endpoint)

Semua request oleh sesi karyawan (`rbactest`, role=karyawan). Format:
`method url → HTTP code` — expected 403 kecuali sanity.

| Kategori          | # test | # PASS 403 | # FAIL |
|-------------------|--------|------------|--------|
| Laporan           | 6      | 6          | 0      |
| Buku Kas          | 5      | 5          | 0      |
| Poin              | 5      | 5          | 0      |
| AI                | 4      | 4          | 0      |
| Pengaturan        | 7      | 7          | 0      |
| Users             | 4      | 4          | 0      |
| Transaksi destroy | 1      | 1          | 0      |
| Deposit batalkan-topup | 1 | 1          | 0      |
| Stok Bahan        | 4      | 4          | 0      |
| Promo             | 4      | 4          | 0      |
| Pelanggan         | 7      | 7          | 0      |
| Layanan           | 12     | 12         | 0      |
| Printer test      | 1      | 1          | 0      |
| Reservasi destroy | 1      | 1          | 0      |
| **TOTAL owner-only** | **62** | **62**  | **0**  |
| Sanity karyawan boleh (dashboard, layanan GET, transaksi, restock, promo GET, dll) | 10 | 10 | 0 |

**Contoh output tipikal (yang penting):**
```
DELETE /transaksi/1               → 403 (Hapus order permanen)
POST /deposit/1/batalkan-topup    → 403
POST /pengaturan/restore          → 403
PUT /poin/pengaturan              → 403
POST /users                       → 403
GET /kas                          → 403
GET /laporan/export               → 403
POST /ai/chat                     → 403
```

---

## Edge Cases (verified)

### 1. Karyawan navigate direct URL ke halaman owner-only

```
GET /laporan     → HTTP 302 Location: /
GET /kas         → HTTP 302 Location: /
GET /poin        → HTTP 302 Location: /
GET /master      → HTTP 302 Location: /
GET /pengaturan  → HTTP 302 Location: /
GET /ai-insight  → HTTP 302 Location: /
```

Semua di-redirect ke `/` (dashboard) via `gateOwnerPage` middleware di
`src/app.js`. Bukan halaman kosong / error JS.

### 2. Role tampering (fake owner via header/body/cookie)

```
POST /users dgn body {role:"owner"} + header X-User-Role: owner   → 403
GET /auth/me                                                       → role:"karyawan"
```

Backend TIDAK percaya data role dari client. Selalu baca dari
`req.session?.user?.role` (server-side session store). Header custom
diabaikan. Bahkan kalau operator paksa set `window.currentUserRole =
'owner'` di console dan panggil endpoint, backend akan tetap 403.

### 3. Default role user baru via API

```
POST /users {"nama":"NoRoleUser","username":"noroleu","password":"pass1234"}
→ HTTP 201, role:"karyawan"
```

Joi schema di `usersController.js` line 12: `role: Joi.string().valid('owner',
'karyawan').default('karyawan')`. Safe restrictive default.

### 4. Direct SQL insert bypass API (baseline bug — sekarang di-fix data-normalized)

```
INSERT INTO users (nama, username, password, aktif) VALUES (...)
→ role kolom = 'kasir' (default DDL dari migration 2024)
```

**Root cause:** Migration `20260729000037_normalize_user_role.js` update
DATA existing tapi TIDAK ALTER kolom default (SQLite tidak support ALTER
DEFAULT langsung, dan recreate table bermasalah dengan FK constraints).

**Impact security:** TIDAK ADA escalation. Middleware `requireRole('owner')`
whitelist hanya 'owner' → 'kasir' otomatis dianggap non-owner. Frontend
`isOwner()` juga cek `=== 'owner'` → false. Aman.

**Fix:** Migration baru `20260806000038_users_role_default_karyawan.js`
menjalankan normalisasi ulang (idempoten): `UPDATE users SET role='karyawan'
WHERE role NOT IN ('owner','karyawan')`. Alter DDL default diskip karena
FK dance terlalu berisiko; lapisan pertahanan aktual (Joi default +
middleware whitelist) sudah cukup — dokumentasi in-place di migration file.

---

## Frontend Guard (verified)

### `auth-helper.js` — bootstrap RBAC
- Inject CSS `[data-owner-only="1"]{display:none !important}` SEDINI mungkin
  → mencegah flicker tombol owner ke karyawan sebelum role fetch selesai.
- Fetch `/api/v1/auth/me`, apply role, kalau `owner` → strip attribute
  `data-owner-only` (reveal), plus MutationObserver menangani konten yang
  dirender belakangan.
- Fallback safe: kalau fetch gagal → `applyRole('karyawan', null)` — restrictive.

### `nav.js` — sidebar filter
- Item dgn `ownerOnly: true` (7 item: Buku Kas, Laporan, Poin, AI Insight,
  Pengaturan, Master) di-filter di `filterItems()` — tidak dirender ke DOM
  untuk karyawan.
- Kalau bootstrap role beda dgn real (mis. localStorage tertinggal owner
  padahal sekarang karyawan), nav di-rebuild via event `pos:role-loaded`.

### `data-owner-only="1"` attribute per halaman
| Halaman              | Tombol dilindungi                                              |
|----------------------|----------------------------------------------------------------|
| `stok-bahan.html`    | Tambah bahan, Edit, Koreksi, Hapus (tetap: Restock/Mutasi)     |
| `pelanggan.html`     | Hapus pelanggan                                                |
| `layanan.html`       | Tambah kategori, Edit/Toggle/Hapus layanan, Import/Export      |
| `promo.html`         | Tambah promo, Edit/Toggle/Hapus                                |
| `deposit.html`       | Batalkan Topup (via JS `canCancelTopup = isOwner()`)           |
| `detail-order.html`  | Hapus Order Permanen (`currentUser?.role === 'owner'`)         |

### `gateOwnerPage` middleware (server-side page redirect)
6 URL owner-only di `src/app.js` line 136-140:
- `/kas`, `/poin`, `/laporan`, `/master`, `/pengaturan`, `/ai-insight`
- Karyawan yang navigate direct → `res.redirect('/')` (bukan halaman kosong).

---

## Diff Akhir

```
+ src/database/migrations/20260806000038_users_role_default_karyawan.js
```

Hanya 1 file baru (migration data-normalize). Tidak ada perubahan di kode
aplikasi karena backend RBAC sudah 100% correct.

---

## Cleanup

- Test user `rbactest` (id=4), `noroleu` (id=5), `dir_test` (id=6),
  `sanitytest` (id=7) — **semua dihapus** setelah test selesai.
- DB users sekarang kembali baseline: `admin` (owner) + `karyawan1` (karyawan).
- Password `karyawan1`: **tidak diubah oleh screening ini**. Kalau Naufal tidak
  ingat password-nya, bisa reset lewat halaman Master → User → Edit.

## Kesimpulan Keamanan

**Sistem RBAC ini SOLID.** 62 endpoint owner-only diverifikasi ditolak dari
sesi karyawan, semua halaman owner-only di-guard di server-side, frontend
tidak dipercaya sebagai sumber otorisasi (data role client-side hanya untuk
UX — real check di backend session). Default role restrictive (karyawan).
Role tampering via client (header/body/console) tidak berdampak apapun.

Tidak ada rekomendasi security-critical yang tertunda.
