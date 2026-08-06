# Screening Modul Stok Bahan (Auto-Deduction + Restock + Alert)

Tanggal: 2026-08-06
Metode: baca `services/stokBahan.service.js` + integrasi di
`transaksiController.store` + `controllers/stokBahanController.js`. Buat 2
bahan test (Deterjen 20ml/kg, Plastik Sprei 1pcs/pcs), jalankan 5 skenario
order via HTTP API, verifikasi stok_sekarang & mutasi log baris per baris
di DB.

Baseline sebelum test (dipulihkan di akhir):
- `bahan_baku`: 0 row.
- `mutasi_stok_bahan`: 0 row terkait bahan test.

---

## Peta Fungsi

| Fungsi                                                | Peran                                              |
|-------------------------------------------------------|----------------------------------------------------|
| `stokBahan.service.js::hitungVolume(items, rasio)`    | Jumlahkan qty item sesuai satuan_rasio (per_kg / per_pcs) |
| `stokBahan.service.js::kurangiStokOtomatis(trxId, items)` | Iterasi bahan aktif, pakai=volume×rasio, update stok + insert mutasi 'keluar_otomatis'. **Non-blocking**: kalau stok minus → console.warn tapi tetap update. |
| `stokBahan.service.js::tambahStokManual(bahanId, qty, ket, user)` | Restock: stok+=qty, insert mutasi 'masuk' (transaksi_id=null) |
| `stokBahan.service.js::koreksiStok(bahanId, stokBaru, ket, user)` | Set stok=stokBaru absolut, insert mutasi 'koreksi' dgn selisih |
| `transaksiController.store` line 284-286              | Panggil `kurangiStokOtomatis` di dalam try/catch — error di-log saja, tidak menggagalkan order (fail-safe) |
| `stokBahanController.index`                           | Return list + kalkulasi `di_bawah_batas` + list `menipis` |
| `dashboardController` `stok_hampir_habis`             | Query `stok_sekarang < batas_minimum` untuk widget dashboard |

Formula pengurangan:
```
volume     = Σ qty item yg satuan-nya match dgn satuan_rasio bahan
             (per_kg → kumpulkan yg satuan='kg', per_pcs → kumpulkan yg satuan ≠ 'kg')
pakai      = volume × rasio_pemakaian
stok_baru  = stok_sekarang − pakai   (BOLEH negatif — fail-safe)
```

---

## Ringkasan Temuan

| # | Skenario                                                            | Status               |
|---|---------------------------------------------------------------------|----------------------|
| 1 | Order 5kg → Deterjen turun 100ml (5×20)                             | Sudah benar          |
| 2 | Multi-layanan 5kg + 3kg → Deterjen turun 160ml (8×20 total)         | Sudah benar          |
| 3 | Order 2 pcs → Plastik turun 2, Deterjen (per_kg) TIDAK berubah      | Sudah benar          |
| 4 | Order 30kg dgn stok 500ml → stok jadi -100 (minus), order TETAP DIBUAT, warning di log | Sudah benar (fail-safe by design) |
| 5 | Layanan pcs, Deterjen per_kg → no match, no error, stok tidak berubah | Sudah benar        |
| R1| Restock +1000 dari -100 → 900, mutasi jenis=masuk, created_by=1     | Sudah benar          |
| R2| Koreksi ke 2500 (absolut, dari 900) → stok=2500, selisih=1600       | Sudah benar          |
| R3| Koreksi negatif → HTTP 400 (Joi reject)                             | Sudah benar          |
| A1| Set batas=3000 dgn stok=2500 → `di_bawah_batas=true`, muncul di /stok-bahan menipis + /dashboard stok_hampir_habis | Sudah benar |
| A2| Restock supaya stok>batas → alert hilang di kedua tempat            | Sudah benar          |
| RBAC | Karyawan hanya bisa `POST /:id/tambah` (restock); store, update, koreksi, DELETE ditolak 403 | Sudah benar (verified di SCREENING_RBAC.md) |

**Tidak ada bug ditemukan.**

---

## Detail Verifikasi (angka aktual)

### TEST 1 — Order 5kg Cuci Kering (satuan 'kg')
```
Deterjen stok SEBELUM: 5000
POST /transaksi items=[{layanan_id:1, jumlah:5}] → order id=85
Deterjen stok SESUDAH: 4900 ✓ (expected: 5000 - 5×20 = 4900)
Mutasi: keluar_otomatis, jumlah=100, sebelum=5000, sesudah=4900,
        transaksi_id=85, ket="Pemakaian otomatis: 5 × 20 ml"
```

### TEST 2 — Multi-layanan (5kg + 3kg = 8kg total)
```
Deterjen SEBELUM: 4900
POST items=[{layanan_id:1(kg), jumlah:5}, {layanan_id:3(kg), jumlah:3}] → order id=86
Deterjen SESUDAH: 4740 ✓ (expected: 4900 - 8×20 = 4740)
Mutasi: jumlah=160, transaksi_id=86, ket="Pemakaian otomatis: 8 × 20 ml"
```
Semua layanan dgn satuan=kg dijumlahkan → volume=8 → pakai=160. Bukan hanya
layanan pertama.

### TEST 3 — Satuan pcs (layanan Cuci Selimut 2 item)
```
Plastik SEBELUM: 100, Deterjen SEBELUM: 4740
POST items=[{layanan_id:7(item), jumlah:2}] → order id=87
Plastik SESUDAH: 98 ✓ (100 - 2×1)
Deterjen SESUDAH: 4740 ✓ (TIDAK berubah — satuan bukan 'kg')
```
`hitungVolume` untuk `satuan_rasio='per_pcs'` menjumlahkan qty item yg
satuan-nya bukan 'kg'. Deterjen (per_kg) tidak match dgn item satuan 'item'.

### TEST 4 — Fail-safe MINUS stok
```
Deterjen di-set manual: stok=500ml
POST items=[{layanan_id:1(kg), jumlah:30}] → order id=88 (HTTP 201)
Deterjen SESUDAH: -100.0  (minus!)
Warning di server log:
  [stokBahan] Bahan "Deterjen Test" jadi minus (-100 ml) setelah order #88
```
Order **TETAP DIBUAT** — response 201 dgn data lengkap. Stok DB tercatat -100
sesuai perhitungan (500 - 30×20 = -100). Warning tercetak untuk operator
tindak lanjut. Fail-safe behavior sesuai spek (order tidak diblokir demi
pengalaman kasir).

### TEST 5 — No-match layanan (Plastik dinonaktifkan sementara)
```
Plastik aktif=0 dulu.
POST items=[{layanan_id:7(item), jumlah:1}] → order id=89 (HTTP 201)
Deterjen SESUDAH: -100 (tidak berubah — layanan pcs, per_kg no match)
Mutasi utk trx 89: kosong (0 row) — tidak crash, senyap.
```
Bahan Plastik non-aktif → di-skip di `where('aktif', 1)`. Deterjen aktif tapi
per_kg tidak match dgn satuan item → volume=0 → `continue`, tidak insert
mutasi. Konsisten & aman.

### RESTOCK
```
POST /stok-bahan/8/tambah {jumlah:1000, keterangan:"Restock test 1"}
  → stok_sebelum:-100, stok_sesudah:900 ✓
Mutasi: jenis='masuk', jumlah=1000, transaksi_id=null, created_by=1,
        keterangan="Restock test 1"
```

### KOREKSI (absolut, bukan penambahan)
```
POST /stok-bahan/8/koreksi {stok_baru:2500, keterangan:"Stok opname test"}
  → stok_sebelum:900, stok_sesudah:2500, selisih:1600 ✓
Mutasi: jenis='koreksi', jumlah=1600 (selisih), stok_sebelum=900,
        stok_sesudah=2500 — BUKAN 900+2500=3400. ✓
```
Verifikasi: `koreksiStok` set stok_sekarang PERSIS ke `stok_baru`, tidak
ditambahkan ke stok existing. Selisih dicatat di `jumlah` untuk audit.

Koreksi negatif ditolak:
```
POST {stok_baru:-100} → HTTP 400 {"error":"\"stok_baru\" must be greater than or equal to 0"}
```

### MUTASI LOG lengkap (audit trail)
```
id | jenis            | jumlah | sebelum | sesudah | trx_id | ket
18 | masuk            | 5000   | 0       | 5000    | null   | Stok awal
20 | keluar_otomatis  | 100    | 5000    | 4900    | 85     | Pemakaian otomatis: 5 × 20 ml
21 | keluar_otomatis  | 160    | 4900    | 4740    | 86     | Pemakaian otomatis: 8 × 20 ml
23 | keluar_otomatis  | 600    | 500     | -100    | 88     | Pemakaian otomatis: 30 × 20 ml
25 | masuk            | 1000   | -100    | 900     | null   | Restock test 1
26 | koreksi          | 1600   | 900     | 2500    | null   | Stok opname test
```
Semua jenis tercatat: masuk (restock/stok awal), keluar_otomatis (dari order,
dgn transaksi_id benar-benar terhubung), koreksi. transaksi_id null untuk
manual (restock, koreksi, stok awal) — sesuai spek.

### ALERT batas minimum
```
Set batas_minimum=3000 (stok 2500):
  GET /stok-bahan → Deterjen: di_bawah_batas=True, menipis count=1
  GET /dashboard  → stok_hampir_habis: [{nama: "Deterjen Test", stok:2500, batas:3000}]

Restock +1000 (stok jadi 3500 > batas 3000):
  GET /stok-bahan → Deterjen: di_bawah_batas=False, menipis count=0
  Alert HILANG di kedua tempat ✓
```

### RBAC (cross-check dgn SCREENING_RBAC.md)
Verified di sesi RBAC bahwa untuk karyawan:
- `POST /api/v1/stok-bahan` (tambah bahan) → 403
- `PUT /api/v1/stok-bahan/:id` (edit bahan) → 403
- `POST /api/v1/stok-bahan/:id/koreksi` → 403
- `DELETE /api/v1/stok-bahan/:id` → 403 (via `blockOperatorDelete` global)
- `POST /api/v1/stok-bahan/:id/tambah` (restock) → **200 (allowed)**
- `GET /api/v1/stok-bahan` + `GET /:id/mutasi` → 200 (read-only lookup)

Konsisten dgn spek: karyawan bisa restock harian, tapi tidak koreksi/edit.

---

## Kesimpulan

Modul Stok Bahan bekerja SEMPURNA sesuai spek. **Tidak ada perubahan kode.**

Fail-safe behavior benar-benar diterapkan pada 3 layer:
1. `stokBahan.service.kurangiStokOtomatis` tidak throw untuk stok minus,
   hanya `console.warn`.
2. Caller `transaksiController.store` bungkus di try/catch dgn `console.error`
   saja — order tetap dibuat.
3. Bahan yg non-match satuan tidak error, sekedar `continue` di loop.

Alert batas_minimum tampil konsisten di 2 tempat (halaman Stok Bahan + widget
Dashboard) dan hilang otomatis setelah restock.

---

## Cleanup

- 2 bahan test (`Deterjen Test` id=8, `Plastik Sprei Test` id=9) dihapus.
- Mutasi stok terkait (6+ row) dihapus.
- Order test (id 85-90) dihapus beserta detail_transaksi + riwayat_bayar + kas.
- Reset saldo deposit & poin pelanggan 1 ke baseline (29000, 8).
- Reset AJ settings (dari screening sebelumnya) juga sudah OK.
- Verifikasi baseline: MAX(transaksi.id)=36, 0 bahan_baku, 0 mutasi.
