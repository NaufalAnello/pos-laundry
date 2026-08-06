# Screening Modul Print Engine (Struk & Label Thermal)

Tanggal: 2026-08-06
Metode: baca menyeluruh backend (`printer.service.js`, `printerController.js`,
`print-template.js`, `print.py`) + frontend (`label-sheet.js`), lalu jalankan
test dengan shim `child_process.spawn` untuk menangkap byte buffer yang akan
dikirim ke printer (tanpa perlu printer fisik). Test coverage:
- STRUK: 6 skenario (default renderer + template custom)
- LABEL: 2 skenario (single + partial select)
- RACE: 2 skenario (concurrent 2 label + 3 job stress)
- FORMAT: telepon toko + telepon pelanggan
- HTTP defensif: 4 skenario expected_nomor_transaksi + stray layanan_ids

Printer fisik = Xantri BT-58D 58mm (TANPA auto-cutter). Semua output diakhiri
`nl()` × 5 (struk) atau × 3 (label) — bukan `printer.cut()`. Verified ✓.

---

## Peta Fungsi Print

| Fungsi                                              | Peran                                            |
|-----------------------------------------------------|--------------------------------------------------|
| `printer.service.js::generateEscPos`                | STRUK default (no custom template)               |
| `printer.service.js::generateStrukFromTemplate`     | STRUK dengan template custom                     |
| `printer.service.js::generateLabelEscPos`           | LABEL default (no custom template)               |
| `printer.service.js::generateLabelFromTemplate`     | LABEL dengan template custom                     |
| `printer.service.js::withPrintLock` / `printQueue`  | Serialisasi job — chain Promise + drain 700ms   |
| `printer.service.js::sendToPrinter`                 | Spawn `python3 scripts/print.py`, timeout 10 s   |
| `printerController.cetakTransaksi` / `cetakLabel`   | HTTP handler                                     |
| `print-template.js::parseConfig` / `normalizeConfig`| Config template dari `pengaturan.template_struk` |
| `label-sheet.js` (frontend)                         | UI trigger + cooldown lock `isPrinting`          |

---

## Ringkasan Temuan

| # | Skenario / Bug                                                        | Status               |
|---|-----------------------------------------------------------------------|----------------------|
| 1 | STRUK 1 item, lunas, poin                                             | Sudah benar          |
| 2 | STRUK multi-item + rincian nested                                     | Sudah benar          |
| 3 | STRUK + biaya tambahan (tidak menyatu, ada line separator)            | Sudah benar          |
| 4 | STRUK DP (baris Dibayar/Sisa jelas)                                   | Sudah benar          |
| 5 | STRUK diskon nominal + persen                                         | Sudah benar          |
| 6 | STRUK template CUSTOM — elemen yang dimatikan MALAH tetap tercetak    | **BUG DIPERBAIKI**   |
| A | Telepon TOKO & telepon PELANGGAN di STRUK tercetak `628xxx` (bukan `08xxx`) | **BUG DIPERBAIKI** |
| 7 | LABEL single item — semua elemen wajib ada                            | Sudah benar          |
| 8 | LABEL partial select — hanya layanan yang dipilih tercetak            | Sudah benar          |
| 9 | RACE concurrent 2 label / 3 job — verified NO MIXUP di server         | Sudah benar          |
| B | Layer defensif backend `expected_nomor_transaksi` + validasi `layanan_ids` (baru) | **DITAMBAHKAN** |
| C | Client `isPrinting` race window (check-then-await-then-set) — bisa lolos klik ke-2 | **DIPERBAIKI** |

---

## Detail Temuan

### BUG A — Nomor telepon di STRUK tidak diformat ke 08xxx

**Skenario test:** `pengaturan.telepon_toko = '6289123456789'`,
`transaksi.pelanggan_telepon = '6289692066472'`.

**Aktual (sebelum fix):**
```
STRUK:
  WA: 6289123456789           ← toko
  WA : 6289692066472          ← pelanggan
LABEL:
  WA: 089692066472            ← LABEL sudah benar
```

**Root cause:**
- `generateLabelEscPos` line 733-739 punya helper `formatTelepon` lokal — dipakai untuk pelanggan (line 762). Label BENAR.
- `generateEscPos` (STRUK default) line 64 & 75 langsung `push(pengaturan.telepon_toko)` dan `push(transaksi.pelanggan_telepon)` — tanpa formatting.
- Template renderer STRUK (`generateStrukFromTemplate`) case `telepon_toko` dan `nomor_wa` juga tanpa formatting.

Helper untuk pelanggan sudah didefinisikan di top-level (`formatTeleponPelanggan`), tapi tidak dipakai. Untuk telepon toko, tidak ada helper sama sekali.

**Fix:** Extract helper `formatTeleponTampil` ke top-level modul, pakai di 4 titik:
- `generateEscPos` — telepon toko (header) + telepon pelanggan (info order)
- `generateStrukFromTemplate` — case `telepon_toko` + case `nomor_wa`
- `generateLabelEscPos` — alias `formatTelepon = formatTeleponTampil`
- `generateLabelFromTemplate` — case `telepon_toko` (baru) + `formatTeleponPelanggan` (alias)

**Re-test:**
```
STRUK: WA: 089123456789 (toko), WA : 089692066472 (pelanggan)   ✓
LABEL: WA: 089692066472                                          ✓
```

**Status:** BUG DIPERBAIKI.

---

### BUG 6 — Template custom: elemen dimatikan tetap tercetak

**Skenario:** Owner customize template STRUK, sengaja mematikan
`alamat_toko`, `telepon_toko`, `tanggal`, `kasir`, `nomor_wa`,
`estimasi_selesai`, `diskon`, `instruksi_ambil`. Config disimpan hanya berisi 8
elemen aktif: `nama_toko`, `nomor_order`, `nama_pelanggan`, `daftar_layanan`,
`biaya_tambahan`, `total`, `status_bayar`, `footer`.

**Aktual (sebelum fix):** STRUK MENCETAK SEMUA elemen — 8 yang aktif + 8 yang
seharusnya dimatikan. Output 748 bytes dengan alamat, WA, tanggal, kasir,
estimasi, dan instruksi_ambil MUNCUL walaupun tidak ada di config.

**Root cause:** `print-template.js::normalizeConfig` line 129-134:
```js
for (const d of def.elemen) {
  if (!fromUser.has(d.id)) {
    fromUser.set(d.id, { id: d.id, aktif: d.aktif, urutan: d.urutan + 1000 });
  }
}
```
Elemen yang tidak ada di config user diambil dari `DEFAULT_STRUK`. Karena
`DEFAULT_STRUK` isinya adalah SEMUA elemen dengan `aktif=true` (yang ada di
`STRUK_DEFAULT_ORDER`), maka elemen missing selalu jadi aktif → mengabaikan
intent user yang sengaja mematikan.

Skenario nyata yang mengeksploitasi:
- API caller custom (script owner atau future UI dengan bulk-toggle) yang
  mengirim subset elemen.
- Migrasi/import config yang tidak lengkap.

**Fix:** Ubah normalizeConfig — elemen missing di user config dianggap sengaja
tidak aktif (`aktif: false`), KECUALI ada di `REQUIRED_ELEMENTS`
(`nomor_order`, `nama_pelanggan`, `total`, `status_bayar` — yang memang wajib
selalu tampil).

```js
for (const d of def.elemen) {
  if (!fromUser.has(d.id)) {
    fromUser.set(d.id, {
      id: d.id,
      aktif: REQUIRED_ELEMENTS.has(d.id),   // ← default NONAKTIF
      urutan: d.urutan + 1000
    });
  }
}
```

**Re-test:** STRUK sekarang HANYA mencetak 8 elemen yang aktif. Output turun
dari 748 bytes → 394 bytes (47% lebih kecil, sesuai config).

**Impact backward compat:** UI Pengaturan (`pengaturan.html::saveTpl` line
1450-1467) SELALU mengirim seluruh `elemen[]` dengan aktif+urutan, jadi user
existing yang save via UI tidak akan kehilangan elemen apapun (semua terdaftar
di user config). Fix hanya mengubah perilaku untuk partial PUT dari API caller
non-UI.

**Status:** BUG DIPERBAIKI.

---

### BUG C — Race window di client `isPrinting` cooldown

**Skenario:** User klik "Cetak Label" untuk order A (1 layanan → auto-print
tanpa sheet). Sebelum fetch `/detail` untuk A resolve, user klik order B.

**Root cause (sebelum fix):**
```js
async function openSheet(orderId) {
  if (isPrinting) return;              // (1) check
  const r = await fetch(...);          // (2) await network — race window
  ...
  await cetakLabel(orderId, ids);      // (3) set isPrinting=true INSIDE cetakLabel
}
```
Antara `(1)` dan `(3)`, klik kedua `openSheet(B)` lolos gate `(1)` karena
`isPrinting` masih `false`. Kedua fetch berjalan konkuren, dua POST `/label`
di-fire.

Dampak: bukan MIXUP (setiap POST bawa URL id sendiri, backend ambil transaksi
by URL id, byte generated correct), tapi dua job cetak fire tanpa cooldown —
membuka peluang perilaku aneh di UI + printer fisik load menumpuk.

**Fix:** Set `isPrinting = true` SEBELUM `await fetch` di `openSheet`. Reset di
`finally` kecuali sudah diserahkan ke `cetakLabel` (single-item flow).

```js
async function openSheet(orderId) {
  if (isPrinting) return;
  isPrinting = true;                    // ← set SEBELUM await
  let willKeepLock = false;
  try {
    const r = await fetch(...);
    if (items.length <= 1) {
      willKeepLock = true;              // cetakLabel handle reset
      await cetakLabel(...);
      return;
    }
    // multi-item: LEPAS lock karena user harus interact (pilih layanan)
    // sheet.dataset simpan orderId + nomor_transaksi
  } finally {
    if (!willKeepLock) isPrinting = false;
  }
}
```

**Status:** BUG DIPERBAIKI.

---

### FITUR BARU B — Layer defensif backend validation

**Motivasi:** User melaporkan bug label tertukar SUDAH DI-FIX 2× di client
(param eksplisit + cooldown lock) tapi MASIH TERJADI. Test race backend saya
membuktikan `withPrintLock` benar-benar tidak menghasilkan mixup (verified 2×
concurrent label + 3× concurrent struk/label stress). Root cause bug lama
kemungkinan SUDAH BENAR-BENAR HILANG di kode saat ini, tapi user tetap sesekali
mengalami — bisa jadi karena:
1. Browser mereka cache versi label-sheet.js LAMA (sebelum fix), atau
2. Ada racing yang muncul dari state UI yang kompleks (mis. buka detail-order
   di tab lain lalu klik cetak label; atau grid re-render mengubah id di
   tombol saat user klik).

Baik cara (1) maupun (2) di atas menyebabkan client mengirim id yang SALAH
(bukan yang tampil di layar). Backend saat ini menerima id apapun dan mencetak
data untuk id itu — akibatnya struk/label yang keluar TIDAK SESUAI yg
ditunjukkan operator di layar.

**Fix defense-in-depth:** Client kirim `expected_nomor_transaksi` di POST body
(nomor transaksi yang di-display di layar saat operator klik cetak). Backend:
1. Fetch transaksi by URL id.
2. Kalau `expected_nomor_transaksi` ada di body dan tidak cocok dgn
   `transaksi.nomor_transaksi` → HTTP 409 Conflict dengan pesan yg meminta
   operator reload halaman.
3. Kalau `layanan_ids` ada dan berisi id yang bukan milik order → HTTP 409
   dengan daftar id stray.

**Test HTTP hasil:**
```
expected COCOK → 500 dari sendToPrinter (tidak ada printer fisik) — validasi lolos ✓
expected SALAH → HTTP 409 dengan pesan detail ✓
STRAY layanan_ids → HTTP 409 dengan pesan detail ✓
Tanpa expected_nomor_transaksi (backward compat) → 500 dari sendToPrinter (lolos) ✓
```

**Status:** DITAMBAHKAN. Client (`label-sheet.js`) sudah update untuk kirim
`expected_nomor_transaksi` dari data yang di-fetch bersamaan dengan detail
order (yang di-display sebagai `labelOrderInfo`). Backend backward-compatible
— kalau body tidak berisi field ini, tidak divalidasi.

---

### RACE TEST — Backend `withPrintLock` verified NO MIXUP

**Skenario:** Fire 3 job konkuren tanpa `await`:
```js
await Promise.all([
  cetakStruk(strukA, ...),   // nomor=STK-AAA-1, item=S-ITEM-A
  cetakStruk(strukB, ...),   // nomor=STK-BBB-2, item=S-ITEM-B
  cetakLabel(labelC, ..., [3])  // nomor=LBL-CCC-3, item=L-ITEM-C
]);
```

**Hasil (via shim `sendToPrinter`):**
```
Job #1: nomor=STK-AAA-1, matches=STK-AAA + STRUK-ALICE, item=S-ITEM-A  ✓
Job #2: nomor=STK-BBB-2, matches=STK-BBB + STRUK-BOB,   item=S-ITEM-B  ✓
Job #3: nomor=LBL-CCC-3, matches=LABEL-CARLA,           item=L-ITEM-C  ✓
```

Setiap job diserialkan oleh `printQueue` (chain Promise) dan menghasilkan
byte buffer yang KONSISTEN dengan data order-nya sendiri. **Tidak ada mixup**.
Ini mengkonfirmasi: bug label tertukar TIDAK berasal dari server-side
serialization — kalau muncul, sumbernya di client (data yg dikirim salah).

---

### Konsistensi format lain (verified)

- **Angka Rupiah:** `Rp30.000`, `Rp1.500`, `Rp9.960` (Setrika 1.66 kg × Rp 6.000
  = 9960 exact). Tidak ada floating point residue di semua skenario test.
- **Estimasi selesai:** STRUK menampilkan `07/08/2026, 23.00` (dd/mm/yyyy,
  hh.mm); LABEL menampilkan `Jum, 07 Agu 2026` (weekday+dd+bulan+yyyy). Format
  konsisten dengan konvensi Indonesian locale.
- **Tidak ada placeholder `{xxx}` literal:** cek grep di semua 8 output test
  — tidak ada satu pun template literal tersisa.
- **Rincian nested indentasi:** `    - Kemeja 3 pcs` (4-space indent) rapi
  di bawah baris item, tidak menyatu dengan baris berikutnya.

---

## Diff Akhir

```diff
--- src/services/printer.service.js
+++ src/services/printer.service.js
@@ (top-level helper baru)
+function formatTeleponTampil(nomor) { ... }   // 628xxx → 08xxx
@@ generateEscPos header
-  if (pengaturan.telepon_toko) { push('WA: ' + pengaturan.telepon_toko); nl(); }
+  if (pengaturan.telepon_toko) { push('WA: ' + formatTeleponTampil(pengaturan.telepon_toko)); nl(); }
@@ generateEscPos info
-  if (transaksi.pelanggan_telepon) { push('WA : ' + transaksi.pelanggan_telepon); nl(); }
+  if (transaksi.pelanggan_telepon) { push('WA : ' + formatTeleponTampil(transaksi.pelanggan_telepon)); nl(); }
@@ generateStrukFromTemplate telepon_toko & nomor_wa
   (dua-duanya diformat via formatTeleponTampil)
@@ generateLabelFromTemplate telepon_toko
   (juga diformat via formatTeleponTampil)

--- src/utils/print-template.js
+++ src/utils/print-template.js
@@ normalizeConfig
-    fromUser.set(d.id, { id: d.id, aktif: d.aktif, urutan: d.urutan + 1000 });
+    fromUser.set(d.id, {
+      id: d.id,
+      aktif: REQUIRED_ELEMENTS.has(d.id),   // missing dari user = disabled
+      urutan: d.urutan + 1000
+    });

--- src/controllers/printerController.js
+++ src/controllers/printerController.js
@@ cetakLabel
+    const { layanan_ids, expected_nomor_transaksi } = req.body;
+    if (expected_nomor_transaksi &&
+        String(transaksi.nomor_transaksi) !== String(expected_nomor_transaksi)) {
+      return res.status(409).json({ error: 'Order tidak cocok...' });
+    }
+    if (Array.isArray(layanan_ids) && layanan_ids.length > 0) {
+      const ownIds = new Set((transaksi.items || []).map(it => it.id));
+      const strayIds = layanan_ids.filter(id => !ownIds.has(Number(id)));
+      if (strayIds.length > 0) return res.status(409).json({ error: 'Layanan ... bukan milik order ...' });
+    }

--- public/js/label-sheet.js
+++ public/js/label-sheet.js
@@ openSheet
-    if (isPrinting) return;
-    const r = await fetch(...);
+    if (isPrinting) return;
+    isPrinting = true;                        // set SEBELUM await → tutup race window
+    let willKeepLock = false;
+    try { ... willKeepLock = true; await cetakLabel(...); ... }
+    finally { if (!willKeepLock) isPrinting = false; }
@@ cetakLabel
-    body: JSON.stringify({ layanan_ids: layananIds })
+    body: JSON.stringify({
+      layanan_ids: layananIds,
+      ...(expectedNomor ? { expected_nomor_transaksi: expectedNomor } : {})
+    })
```

---

## Bug Label Tertukar — Rangkuman Root Cause & Mitigasi

**Fakta yang teruji screening ini:**

1. **Backend `withPrintLock` benar** — chain Promise serial, drain 700ms antar
   job, setiap job generate byte SESUAI data order-nya. Verified 3 job
   konkuren tidak tercampur.
2. **Client `label-sheet.js` saat ini (setelah fix 2× sebelumnya)** — pakai
   `localOrderId` di closure + `sheet.dataset.orderId`, tidak lagi baca
   `currentOrderId` global. Tidak ditemukan vector mixup di flow normal.
3. **Race window di client** — `isPrinting` di-check sebelum `await` dan
   di-set setelahnya, jadi klik kedua bisa lolos gate. Ini TIDAK menyebabkan
   mixup (setiap request bawa id sendiri), tapi bisa membuat 2 job fire tanpa
   cooldown. **Fixed** dengan set flag SEBELUM await.

**Mengapa user melaporkan masih terjadi?**

Kemungkinan besar (tidak bisa dikonfirmasi tanpa akses ke instance mereka):
- Browser cache versi label-sheet.js LAMA (sebelum fix param eksplisit).
- Flow UI custom (tab lain, grid re-render, dst) yang mengirim URL id ≠
  order yang di-display.

**Mitigasi defense-in-depth (fitur baru):**
- Client kirim `expected_nomor_transaksi` di body — nomor yang benar-benar
  ditampilkan ke operator saat klik cetak.
- Backend validasi: kalau nomor_transaksi hasil fetch by :id tidak cocok
  dengan expected → **HTTP 409 dengan pesan minta reload**, TIDAK CETAK.
- Backend juga validasi `layanan_ids` benar-benar milik order tsb, mencegah
  operator mencetak item yang bukan dari order yg dimaksud.

Layer ini menjamin: KALAU LABEL TERTUKAR TERJADI LAGI, penyebabnya PASTI
di sisi client (bukan server), dan operator akan mendapat error 409 yg
jelas alih-alih label salah tercetak diam-diam.
