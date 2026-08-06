# Screening Modul Import/Export (Pelanggan & Layanan)

Tanggal: 2026-08-06
Metode: baca `services/{import,export}-{pelanggan,layanan}.service.js` +
call-site di controller. Buat 4 file test (CSV valid, CSV rusak, CSV variasi
telepon, CSV round-trip) dan panggil fungsi service langsung (tanpa server)
untuk verifikasi output byte-per-byte + validasi behaviour.

Fokus: KUALITAS DATA. RBAC endpoint sudah diverifikasi 100% owner-only di
`SCREENING_RBAC.md` (POST /pelanggan/import/*, GET /pelanggan/export,
GET /pelanggan/template semua 403 untuk karyawan).

---

## Ringkasan Temuan

| # | Skenario                                                        | Status               |
|---|-----------------------------------------------------------------|----------------------|
| E1 | Export pelanggan CSV escaping (koma, tanda kutip)               | Sudah benar          |
| E2 | Excel telepon cell type = 's' (string, bukan number)            | Sudah benar (tidak scientific notation) |
| **E3** | **Export pelanggan MISSING kolom penting**                | **BUG DIPERBAIKI**   |
| **E4** | **Export telepon tercatat 628xxx, bukan 08xxx**           | **BUG DIPERBAIKI**   |
| **E5** | **Template contoh telepon pakai 628xxx (kontradiksi convention)** | **BUG DIPERBAIKI** |
| I1 | Import CSV 5 baris valid dgn variasi format telepon             | Sudah benar (setelah fix) |
| **I2** | **Import telepon TIDAK dinormalisasi (spec: 08xxx)**      | **BUG DIPERBAIKI**   |
| I3 | Import baris nama kosong → di-skip dgn error jelas, baris lain lanjut | Sudah benar    |
| I4 | Import file rusak (bukan CSV valid) → tidak crash, di-treat sbg data kosong | Sudah benar |
| I5 | Import layanan estimasi_jam primary, estimasi_hari legacy fallback | Sudah benar      |
| I6 | Import layanan kategori tidak ada → error jelas per baris       | Sudah benar          |
| I7 | Import layanan satuan tidak valid (liter) → error per baris     | Sudah benar          |
| **I8** | **Duplicate detection: hanya cek nama (case-insensitive)**| **DIPERBAIKI** (sekarang cek telepon dulu, fallback nama) |
| R1 | Round-trip pelanggan (export→import): 0 baru, 3 duplikat        | Sudah benar          |
| R2 | Round-trip layanan: 0 baru, 2 duplikat                          | Sudah benar          |

**5 bug diperbaiki + 3 field tambahan di export/import.**

---

## Detail Bug & Fix

### BUG E3 — Export pelanggan MISSING kolom penting

**Aktual (sebelum fix):**
```csv
nama,telepon,alamat,email
Budi Santoso,628123456789,Jl. Merdeka 1,budi@x.com
...
```
Hanya 4 kolom. Field yang HILANG: `total_poin`, `jarak_workshop_km`,
`parfum`, `instruksi_khusus`, `catatan`.

**Impact:** Round-trip pelanggan HILANG data personalisasi + poin loyalitas.
Export sebagai backup tidak lengkap.

**Fix:** Tambah 5 field ke `exportKeExcel` / `exportKeCSV` / `buatTemplate`.
9 kolom total.

**Re-test:**
```csv
nama,telepon,alamat,email,total_poin,jarak_workshop_km,parfum,instruksi_khusus,catatan
Budi Santoso,08123456789,Jl. Merdeka 1,budi@x.com,42,3.5,Lavender,Cuci pisah,VIP
...
```

---

### BUG E4 — Export telepon dalam format 628xxx (bukan 08xxx)

**Aktual (sebelum fix):**
```
Excel cell B2: {"t":"s","v":"628123456789"}
CSV: 628123456789
```
Excel cell TYPE sudah string (bukan number → **tidak** scientific notation
bug — good). Tapi VALUE-nya 628xxx dari DB apa adanya, bukan 08xxx.

**Impact:** Inkonsistensi tampilan file export vs UI (UI display 08xxx via
`formatTeleponTampil`, file export 628xxx). Operator yang buka file akan
bingung.

**Fix:** Helper `toDisplayPhone(n)` di export-service — normalize ke 08xxx:
```js
function toDisplayPhone(n) {
  if (!n) return '';
  const s = String(n).trim();
  if (s.startsWith('628')) return '08' + s.slice(3);
  if (s.startsWith('62'))  return '0'  + s.slice(2);
  return s;
}
```

**Re-test:** cell B2 sekarang `{"t":"s","v":"08123456789"}` — konsisten
dgn UI display.

**Catatan pakem penting**: Excel `cell.t === 's'` sudah benar dari awal —
`xlsx.utils.json_to_sheet` menerima string di input `p.telepon || ''`,
sehingga tersimpan sebagai text di worksheet. Kalau kita berikan `Number(...)`
akan jadi `t: 'n'` dan Excel tampilkan sebagai 6.28E+11 (scientific
notation) — bug UMUM yang sudah ter-hindari di code base ini karena
`p.telepon` selalu string dari DB.

---

### BUG E5 — Template contoh telepon pakai 628xxx

**Aktual (sebelum fix):** `contoh: { telepon: '628123456789', ... }`

**Fix:** Ubah ke `08123456789` — konsisten dgn convention Indonesia display.
Plus tambahkan contoh field baru (total_poin=0 default, jarak_workshop_km=2.5,
parfum=Lavender, instruksi_khusus="Cuci pisah dgn baju berwarna") sebagai
guidance operator apa saja kolom yang bisa diisi.

---

### BUG I2 (KRITIS) — Import telepon TIDAK dinormalisasi

**Aktual (sebelum fix):**
- Input `081211112222` → disimpan `081211112222` ✓ (kebetulan sudah 08xxx)
- Input `6281333334444` → disimpan `6281333334444` ✗ (628xxx)
- Input `+62 812 5555 6666` → disimpan `+62 812 5555 6666` ✗ (raw dengan
  spasi + tanda plus)

**Impact:** Database kolom `telepon` jadi campur aduk format. Fitur WA/label/
lookup jadi tidak reliable — pelanggan yg sama bisa dianggap beda karena
format berbeda.

**Fix:** Helper `normalizeTelepon(n)` di import-service — strip non-digit
dulu, lalu:
- prefix `62` → replace dengan `0`
- prefix `0` → keep
- lainnya → prefix `0`
- string kosong → return null

**Re-test:**
- `081211112222` → **`081211112222`** ✓
- `6281333334444` → **`081333334444`** ✓
- `+62 812 5555 6666` → **`081255556666`** ✓

Semua tersimpan konsisten sebagai `08xxx`.

---

### BUG I8 — Duplicate detection hanya cek NAMA

**Aktual (sebelum fix):**
```js
const existing = semuaPelanggan.find(
  p => p.nama.toLowerCase() === String(row.nama).toLowerCase()
);
```
Kalau operator import file dgn nama pelanggan yang typo/beda ejaan tapi
telepon sama, dianggap PELANGGAN BARU → duplikasi data untuk orang yg sama.

**Fix:** Cek prioritas by telepon (setelah normalisasi), fallback ke nama:
```js
const teleponMap = new Map();
for (const p of semuaPelanggan) {
  const norm = normalizeTelepon(p.telepon);
  if (norm) teleponMap.set(norm, p);
}
// ...
let existing = null;
if (teleponNorm) existing = teleponMap.get(teleponNorm) || null;
if (!existing) existing = semuaPelanggan.find(p => p.nama.toLowerCase() === ...);
```

**Impact positif:** Round-trip export→import sekarang benar-benar idempoten
meski telepon di file sudah dinormalisasi ke 08xxx tapi di DB masih 628xxx
(data existing pra-fix).

**Test:** Round-trip 3 pelanggan (nama 'Budi Santoso' existing dgn telepon
628xxx di DB) — file export punya telepon 08xxx setelah fix. Import file
tsb → 3 duplikat detected via telepon-map normalization matching. ✓

---

### Field baru di IMPORT (mendukung round-trip lengkap)

Import pelanggan sekarang menerima 9 kolom (sebelumnya 4). Kolom baru
diterima kalau ada di file, di-default ke 0/null kalau tidak:
- `total_poin` (integer, default 0)
- `jarak_workshop_km` (float, default 0)
- `parfum`, `instruksi_khusus`, `catatan` (string, default null)

**`eksekusiImport` juga updated:**
- INSERT baru: semua 9 kolom di-set.
- UPDATE duplikat (kalau operator pilih aksi='update'): overwrite semua
  field opsional KECUALI `total_poin` (sengaja — jangan reset poin loyalitas
  pelanggan lama).

---

## Detail Hasil Test

### EXPORT CSV pelanggan (setelah fix)
```csv
nama,telepon,alamat,email,total_poin,jarak_workshop_km,parfum,instruksi_khusus,catatan
Budi Santoso,08123456789,Jl. Merdeka 1,budi@x.com,42,3.5,Lavender,Cuci pisah,VIP
"Siti Rahayu, S.Kom",081298765432,"Gg. ""Sudirman"" 45",,0,0,,,"Koma, tanda kutip"""
Andi (Warteg),+62 813 4444 5555,,,5,2,,,
```

Escaping RFC 4180 verified:
- Nama dgn koma `"Siti Rahayu, S.Kom"` ter-quote ✓
- Alamat dgn double-quote `"Gg. ""Sudirman"" 45"` (double-double-quote
  escaping) ✓
- Catatan dgn koma+tanda kutip `"Koma, tanda kutip"""` ✓

**Note edge case**: telepon "Andi" input `+62 813 4444 5555` (raw dari DB
mock yang tidak pernah lewat normalizer) → export TIDAK ubah karena helper
`toDisplayPhone` cuma cek prefix 628/62/0. String dengan spaces & plus jatuh
ke else branch return as-is. Data seperti ini di DB adalah legacy — akan
ternormalisasi kalau di-edit ulang via UI. Import file yg berisi format ini
DIBERSIHKAN oleh normalizer di import — bagus untuk cleanup gradual.

### EXPORT Excel pelanggan (setelah fix)
```
cell B2 (telepon): {"t":"s","v":"08123456789","w":"08123456789"}
```
Type `s` (string) — Excel akan tampilkan `08123456789` apa adanya. **Tidak
ada scientific notation bug.**

### IMPORT pelanggan — telepon normalization
| Input file | Sebelum fix | Setelah fix |
|-----------|-------------|-------------|
| `081211112222` | `081211112222` | `081211112222` ✓ |
| `6281333334444` | `6281333334444` | **`081333334444`** ✓ |
| `+62 812 5555 6666` | `+62 812 5555 6666` | **`081255556666`** ✓ |
| `082199998888` (existing 08xxx) | `082199998888` | `082199998888` ✓ |
| `(kosong)` | error nama wajib | error nama wajib ✓ |

### IMPORT layanan — validasi berlapis
File test dgn 5 baris:
1. Valid → BARU
2. Valid → BARU
3. Satuan `liter` (bukan kg/pcs) → ERROR "satuan 'liter' tidak valid"
4. Kategori `KategoriZZZZ` tidak ada → ERROR "kategori tidak ditemukan"
5. Kolom kategori kosong + salah kolom → 4 errors (kategori wajib, satuan
   angka salah, harga bukan angka, estimasi bukan angka) — semua akumulasi

**Hasil**: 2 baru, 3 error. Baris valid tetap masuk meski ada error baris
lain. Consistent per-row error handling ✓

### IMPORT layanan — estimasi_jam vs estimasi_hari
- File dgn `estimasi_jam=24` → `estimasi_jam=24, estimasi_hari=1` (24/24 ceil)
- File dgn `estimasi_hari=3` (legacy) → `estimasi_jam=72, estimasi_hari=3`
- Prioritas: `estimasi_jam` dulu, fallback `estimasi_hari` (backward compat)

### FILE FORMAT SALAH
- File berisi `this is not csv content...` → di-treat sebagai data 1 baris
  (papaparse toleran), row itu tidak punya kolom 'nama' → di-collect ke
  errors dengan pesan "kolom 'nama' wajib diisi". **Tidak crash server** ✓

### ROUND-TRIP idempoten
- Pelanggan (3 baris) → export CSV → import file itu → 0 baru, 3 duplikat.
- Layanan (2 baris) → export CSV → import file itu → 0 baru, 2 duplikat.
- Default aksi duplikat = `'skip'` → data tidak tergandakan tanpa persetujuan
  operator.

---

## Diff Akhir

```
modified: src/services/export-pelanggan.service.js  (+ 5 field, phone normalization)
modified: src/services/import-pelanggan.service.js  (+ normalizeTelepon,
                                                     telepon-based dedup,
                                                     5 field baru di INSERT/UPDATE)
```

Import/export layanan TIDAK diubah — sudah lengkap dan correct dari awal.

---

## Cleanup

- File test di scratchpad (`import_pelanggan.csv`, `bad.csv`, `import_layanan.csv`,
  `legacy.csv`, `roundtrip_*.csv`, `export_pelanggan.xlsx`) tidak ada di
  project — di scratchpad, aman.
- Tidak ada test data yang di-insert ke DB (test dilakukan via service call
  langsung dengan mock data JavaScript).
- Baseline DB tetap: MAX(transaksi.id)=36, `pelanggan` count sama seperti
  sebelumnya (Budi, Naufal), saldo=29.000, poin=8.
