# Screening Modul WA — `src/services/wa.service.js`

Tanggal: 2026-08-06
Metode: baca kode + jalankan test data mock (semua kombinasi edge case),
periksa output baris-per-baris, verifikasi fix dengan re-run.

Script test: `scratchpad/wa_test.js` (mock objek transaksi, tanpa insert ke DB —
hanya membaca template dari tabel `pengaturan` yang sudah di-seed).
Setelah screening selesai, script dihapus dan tidak menyisakan data di DB.

Tidak ada order/transaksi test yang di-insert ke DB. Hanya satu update
sementara ke `pengaturan.wa_template_notif_selesai` untuk test kasus 13,
yang segera dipulihkan setelah dump output.

---

## Ringkasan Temuan

| # | Skenario / Area                                                | Status               |
|---|----------------------------------------------------------------|----------------------|
| 1 | Baris kosong ganda saat `sisa_tagihan_block` kosong (lunas)    | **BUG DIPERBAIKI**   |
| 2 | Inkonsistensi spasi: `Rp3.000` di biaya tambahan vs `Rp 3.000` | **BUG DIPERBAIKI**   |
| 3 | `formatPhone("   ")` → `"62"` (nomor invalid tapi truthy)      | **BUG DIPERBAIKI**   |
| 4 | Placeholder tak dikenal tercetak literal `{typo_variable}`     | Sudah benar (by design) |
| 5 | `sisa_tagihan_block` saat DP (bayar sebagian)                  | Sudah benar          |
| 6 | Rincian pakaian (nested) dengan indentasi                      | Sudah benar          |
| 7 | Gabungan `buildItemLines()` + `buildBiayaTambahanLines()`      | Sudah benar          |
| 8 | `poin_total` = `'—'` saat `pelanggan_poin` null                | Sudah benar          |
| 9 | `buildBroadcast` filter pelanggan tanpa telepon                | Sudah benar          |
| 10| `fmtRp`/`fmtDate` guardrail null/undefined/NaN                 | Sudah benar          |
| 11| `buildTagihan` dengan `total_bayar`=null (Math.max→NaN→0)      | Sudah benar          |

---

## Detail per Temuan

### BUG 1 — Baris kosong ganda saat order lunas penuh

**Skenario test:** TEST 1, 2, 3, 4, 6, 7 (semua nota lunas).

**Output aktual (sebelum fix):**
```
💵 Kembalian  : Rp 0
                        ← baris kosong (dari template)
                        ← baris kosong (dari {sisa_tagihan_block} yg jadi '')
⭐ Poin didapat : +0 poin
```
Ada 2 baris kosong berturut-turut di antara "Kembalian" dan "Poin didapat".

**Root cause:** Template `wa_template_nota` punya:
```
💵 Kembalian  : Rp {kembalian}
{sisa_tagihan_block}

⭐ Poin didapat : +{poin_dapat} poin
```
Ketika `sisa_tagihan_block` = `''` (order lunas), placeholder-nya kosong tapi
newline sebelum & sesudahnya tetap ada → 3 newline berturut.

**Fix diterapkan** (`src/services/wa.service.js`, fungsi `render`):
```js
const render = (template, vars) =>
  template
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`)
    .replace(/\n{3,}/g, '\n\n');   // collapse 3+ newline → 2 newline
```
Aman untuk semua template karena hanya menghilangkan baris kosong ekstra;
tidak mengubah pemisah paragraf yang sudah benar (yang hanya 2 newline).

**Status:** BUG DIPERBAIKI. Re-run test 1 sekarang menampilkan hanya 1 baris
kosong di antara "Kembalian" dan "Poin didapat" (baris 17 di output).

---

### BUG 2 — Inkonsistensi spasi antara `Rp` dan angka di biaya tambahan

**Skenario test:** TEST 2, TEST 8 (order dengan biaya tambahan).

**Output aktual (sebelum fix):**
```
💰 *Biaya Tambahan:*
- Antar-jemput: Rp3.000        ← tidak ada spasi
- Parfum premium: Rp2.000
```
Bandingkan dengan format konsisten di baris item: `Rp 8.000`, `*Rp 16.000*`.

**Root cause:** `buildBiayaTambahanLines` di baris 63:
```js
`- ${b.keterangan}: Rp${fmtRp(b.nominal)}`
```
Tidak ada spasi setelah `Rp`.

**Fix diterapkan:**
```js
`- ${b.keterangan}: Rp ${fmtRp(b.nominal)}`
```

**Status:** BUG DIPERBAIKI. Re-run TEST 2/8 sekarang menampilkan `Rp 3.000`
dengan spasi konsisten.

---

### BUG 3 — `formatPhone` tidak reject nomor yang hanya berisi whitespace/non-digit

**Skenario test:** BONUS formatPhone edge cases.

**Output aktual (sebelum fix):**
```
"   " → "62"                    ← invalid — kirim ke wa.me/62
"" → null                       (OK)
null → null                     (OK)
```
Kalau `pelanggan.telepon` berisi `"   "` (input spasi doang), guard
`if (!telepon) return null` LOLOS (string non-empty = truthy), lalu
`.replace(/\D/g,'')` → `""`, lalu jatuh ke `'62' + ''` = `"62"`. Hasilnya
URL WA invalid `https://wa.me/62?text=...` yang bisa memicu error kirim.

**Root cause:** Tidak ada guard setelah stripping non-digit.

**Fix diterapkan** (`formatPhone`):
```js
const clean = telepon.replace(/\D/g, '');
if (!clean) return null;   // guard tambahan
```

**Status:** BUG DIPERBAIKI. Re-run BONUS formatPhone sekarang menampilkan
`"   " → null`.

---

### SUDAH BENAR — Placeholder tak dikenal tercetak literal (TEST 13)

**Skenario:** Template dengan `{typo_variable}` yang tidak di-supply oleh
vars object.

**Output:**
```
Halo Budi Santoso untuk order {nomor_transaksi} — variable typo: {typo_variable} — selesai 03 Agustus 2026
```
(Note: `{nomor_transaksi}` tetap literal karena vars object pakai key `nomor`
saja — ini indikasi bagus buat admin bahwa nama variabel di template salah.)

**Analisa:** Perilaku ini by design dari fungsi `render` (baris 42):
```js
(_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`
```
Kalau variabel tidak ditemukan, tetap dicetak literal. Ini sengaja agar
admin bisa deteksi typo di template. Alternatif "silently replace with ''"
malah menyembunyikan bug template.

**Status:** SUDAH BENAR — tidak diubah.

---

### SUDAH BENAR — `sisa_tagihan_block` saat DP

**Skenario:** TEST 5 (bayar Rp 10.000 dari total Rp 25.000).

**Output (baris relevan):**
```
💵 Kembalian  : Rp 0
⚠️ *Sisa Tagihan: Rp 15.000* (bayar saat ambil)

⭐ Poin didapat : +0 poin
```
Format rapi, angka benar (25.000 − 10.000 = 15.000), block muncul di
tempat yang tepat.

**Status:** SUDAH BENAR.

---

### SUDAH BENAR — Rincian pakaian nested (TEST 6, TEST 8)

`buildItemLines` melampirkan rincian dengan `\n` + `     - ` (5 spasi
indent). Nested list muncul rapi di bawah baris item, dan baris berikutnya
(item ke-2 atau biaya tambahan) tidak menyatu.

Cek gabungan `buildItemLines() + buildBiayaTambahanLines()`:
- `buildItemLines` menghasilkan string TANPA trailing `\n`
- `buildBiayaTambahanLines` MENGAWALI dengan `\n\n` (kalau ada isi) atau
  return `''` (kalau kosong)

Jadi tidak ada dua baris yang menyatu tanpa pemisah. Verified via TEST 2, 6, 8.

**Status:** SUDAH BENAR.

---

### SUDAH BENAR — `poin_total` fallback

`vars.poin_total = transaksi.pelanggan_poin ?? '—'`. Untuk pelanggan yang
`total_poin` = null, template merender:
```
💎 Total poin  : — poin
```
Sedikit awkward secara diksi (`— poin`) tapi tidak salah dan tidak memicu
`undefined`/`null` literal.

**Status:** SUDAH BENAR.

---

### SUDAH BENAR — `buildBroadcast` filter

TEST 12 menunjukkan:
- `null` telepon → ke-filter ✓
- `""` telepon → ke-filter ✓
- Nomor dengan format aneh `"+62 813-4444-5555"` → di-clean jadi
  `6281344445555` (URL benar).

**Status:** SUDAH BENAR.

---

### SUDAH BENAR — `fmtRp` / `fmtDate` guardrails

`fmtRp`: `Number(n || 0)` menangani `null`/`undefined`/`NaN` → `0`.
`fmtDate`: falsy → `'—'`. Dates parseable → format Indonesia. Cek nilai
non-standar (angka minus `-500` → `"-500"`) juga benar.

**Status:** SUDAH BENAR.

---

### SUDAH BENAR — `buildTagihan` dengan `total_bayar` null

`Math.max(0, null - (null || 0))` = `Math.max(0, NaN)` = `NaN`, lalu
`fmtRp(NaN)` — `NaN || 0` → `0`. Output `Sisa Tagihan: Rp 0` (bukan
`NaN` literal). Aman.

**Status:** SUDAH BENAR.

---

## Diff Akhir

```diff
--- a/src/services/wa.service.js
+++ b/src/services/wa.service.js
@@ formatPhone
   if (!telepon) return null;
   const clean = telepon.replace(/\D/g, '');
+  if (!clean) return null;
   if (clean.startsWith('62')) return clean;

@@ render
-const render = (template, vars) =>
-  template.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);
+const render = (template, vars) =>
+  template
+    .replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`)
+    .replace(/\n{3,}/g, '\n\n');

@@ buildBiayaTambahanLines
-  const lines = biayaTambahan.map(b => `- ${b.keterangan}: Rp${fmtRp(b.nominal)}`).join('\n');
+  const lines = biayaTambahan.map(b => `- ${b.keterangan}: Rp ${fmtRp(b.nominal)}`).join('\n');
```
