# Troubleshooting: Searchable Dropdown Tidak Muncul

## ✅ Implementasi SUDAH ADA di Code

Commit: `691b9b8` - feat: tambah searchable dropdown layanan di order baru

File: `public/pages/order.html`
- Baris 112-189: CSS untuk searchable dropdown
- Baris 835-1015: JavaScript function `addItemRow()` dengan searchable

## 🔍 Cara Test

### 1. Test File Standalone
Buka di browser:
```
http://localhost:3001/test-searchable.html
```

Jika ini berfungsi, berarti implementasi benar → masalah di cache browser.

### 2. Hard Refresh Browser
- **Chrome/Firefox**: `Ctrl + Shift + R` atau `Ctrl + F5`
- **Safari**: `Cmd + Shift + R`
- **Edge**: `Ctrl + Shift + Delete` → Clear cache

### 3. Clear Service Worker (jika ada)
Di Chrome DevTools:
1. F12 → Application tab
2. Service Workers → Unregister
3. Hard refresh

### 4. Cek Server Running
```bash
pm2 status pos-laundry
# atau
ps aux | grep node
```

Restart server:
```bash
pm2 restart pos-laundry
# atau
npm run dev
```

### 5. Cek File Version
```bash
git log --oneline public/pages/order.html | head -3
```

Pastikan ada commit:
```
691b9b8 feat: tambah searchable dropdown layanan di order baru
```

### 6. Verify Implementation
Buka `public/pages/order.html` dan search:
```bash
grep -n "svc-search-wrap" public/pages/order.html
```

Harus muncul di 2 tempat:
- CSS (baris ~112)
- HTML template di addItemRow() (baris ~855)

## 🐛 Jika Masih Tampil `<select>`

Cek di Browser DevTools (F12):
1. **Elements tab**: Inspect item layanan pertama
   - ✅ Benar: `<div class="svc-search-wrap">`
   - ❌ Salah: `<select class="item-layanan">`

2. **Console tab**: Cek error JavaScript
   - Error "layananList is not defined" → server belum load data
   - Error lain → screenshot ke developer

3. **Network tab**: Reload halaman
   - Cek request ke `/api/v1/layanan`
   - Status harus 200 OK
   - Response harus array layanan

## 📝 Cara Kerja Fitur

1. **Saat halaman load**: `layananList` di-fetch dari API
2. **Klik "+ Tambah Item"**: panggil `addItemRow()`
3. **addItemRow()** buat HTML:
   ```html
   <div class="svc-search-wrap">
     <input class="svc-search-input" placeholder="Cari layanan..." />
     <div class="svc-dropdown hidden"></div>
   </div>
   ```
4. **Saat ketik**: filter `layananList` → render dropdown
5. **Klik item**: update harga & satuan

## 🚀 Di Produksi (hg680p)

Setelah pull dari GitHub, pastikan:
```bash
cd /root/pos-laundry
git pull
pm2 restart pos-laundry

# Hard reload browser di komputer client
# Ctrl + Shift + R
```

## ✨ Expected Behavior

**Desktop:**
- Dropdown muncul di bawah input (max 300px height)
- Scroll jika > 10 layanan

**Mobile:**
- Bottom sheet dari bawah (60% layar)
- Animasi slide up
- Mudah ditap dengan jempol

**Fitur:**
- ✅ Filter real-time saat ketik
- ✅ Highlight teks yang cocok (background kuning)
- ✅ Terkelompok per kategori
- ✅ Tampil harga + satuan
- ✅ Tombol X untuk clear
- ✅ Input bold saat ada pilihan
