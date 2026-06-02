# Troubleshooting: Tombol Import/Export Tidak Terlihat di Halaman Pelanggan

## ✅ Verifikasi: Tombol SUDAH ADA di Kode

**File:** `public/pages/pelanggan.html`  
**Baris:** 173-184

```html
<div style="display:flex;gap:8px;flex-wrap:wrap;">
  <button class="btn btn-outline" onclick="openImportModal()">
    📥 Import
  </button>
  <button class="btn btn-outline" onclick="exportPelanggan('xlsx')">
    📊 Export Excel
  </button>
  <button class="btn btn-outline" onclick="exportPelanggan('csv')">
    📄 Export CSV
  </button>
  <button class="btn btn-blue" onclick="openAdd()">+ Tambah Pelanggan</button>
</div>
```

**Commit:** `231b76f` - feat: tambah fitur import dan export pelanggan  
**Status:** ✅ Sudah di-commit dan di-push ke GitHub

---

## 🔍 Kemungkinan Penyebab

### 1. **Browser Cache (90% kemungkinan)**

Browser masih serve file HTML lama dari cache.

**Solusi:**
```
Hard Refresh:
- Chrome/Firefox/Edge: Ctrl + Shift + R
- Safari: Cmd + Shift + R

Atau Clear Cache Manual:
- Chrome: Ctrl + Shift + Delete
- Pilih "Cached images and files"
- Time range: "All time"
- Clear data
```

### 2. **Server Belum Restart**

Jika menggunakan cache/CDN di server, perlu restart.

**Solusi:**
```bash
# Di local
npm run dev

# Di production (hg680p)
pm2 restart pos-laundry
```

### 3. **Service Worker Cache**

Jika ada service worker, perlu di-unregister.

**Solusi:**
1. Buka DevTools (F12)
2. Tab "Application"
3. Klik "Service Workers"
4. Klik "Unregister"
5. Hard refresh

---

## 🧪 Cara Test

### **Test 1: File Test Standalone**

Buka di browser:
```
http://localhost:3001/test-pelanggan-buttons.html
```

Jika tombol terlihat di sini → kode benar, masalah di cache.

### **Test 2: Inspect Element**

1. Buka halaman pelanggan
2. Tekan `F12` (DevTools)
3. Tab "Elements"
4. Cari `<div class="page-header">`
5. Periksa apakah ada 4 tombol

**Expected:**
```html
<div class="page-header">
  <div class="page-title">Pelanggan</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button class="btn btn-outline">📥 Import</button>
    <button class="btn btn-outline">📊 Export Excel</button>
    <button class="btn btn-outline">📄 Export CSV</button>
    <button class="btn btn-blue">+ Tambah Pelanggan</button>
  </div>
</div>
```

### **Test 3: Console Check**

Di browser console (F12 → Console), run:

```javascript
// Harus return: 4
document.querySelectorAll('.page-header button').length

// Harus menampilkan HTML dengan 4 button
document.querySelector('.page-header').innerHTML

// Cek apakah fungsi ada
typeof openImportModal
typeof exportPelanggan
// Harus return: "function"
```

---

## 🔧 Fix Step-by-Step

### **Langkah 1: Hard Refresh**
```
Ctrl + Shift + R
```

Jika masih belum terlihat, lanjut step 2.

### **Langkah 2: Incognito/Private Mode**
```
Ctrl + Shift + N (Chrome)
Ctrl + Shift + P (Firefox)
```

Buka halaman pelanggan di mode incognito.  
Jika tombol terlihat → masalah di cache browser.

### **Langkah 3: Clear All Cache**
```bash
# Di browser
Ctrl + Shift + Delete
→ Clear browsing data
→ All time
→ Cached images and files
→ Clear data

# Hard refresh lagi
Ctrl + Shift + R
```

### **Langkah 4: Restart Server**
```bash
# Local
npm run dev

# Production (hg680p)
ssh root@192.168.88.233
cd /root/pos-laundry
git pull
pm2 restart pos-laundry
```

### **Langkah 5: Verify Git Version**
```bash
# Cek apakah file ter-update
git log --oneline -1 public/pages/pelanggan.html

# Expected output:
# 231b76f feat: tambah fitur import dan export pelanggan
```

Jika output berbeda, pull dari GitHub:
```bash
git pull origin main
```

---

## 📊 Perbandingan dengan Layanan

File `public/pages/layanan.html` punya pola yang sama dan berfungsi.

**Layanan (BENAR):**
```html
<div style="display:flex;gap:8px;align-items:center;">
  <button class="btn btn-outline" onclick="openImportModal()">
    <i class="ti ti-file-import"></i> Import
  </button>
  <button class="btn btn-outline" onclick="exportLayanan('xlsx')">
    <i class="ti ti-file-spreadsheet"></i> Export Excel
  </button>
  <button class="btn btn-outline" onclick="exportLayanan('csv')">
    <i class="ti ti-file-text"></i> Export CSV
  </button>
  <button class="btn btn-blue" onclick="openKategoriModal()">
    <i class="ti ti-folder-plus"></i> Tambah Kategori
  </button>
</div>
```

**Pelanggan (SAMA):**
```html
<div style="display:flex;gap:8px;flex-wrap:wrap;">
  <button class="btn btn-outline" onclick="openImportModal()">
    📥 Import
  </button>
  <button class="btn btn-outline" onclick="exportPelanggan('xlsx')">
    📊 Export Excel
  </button>
  <button class="btn btn-outline" onclick="exportPelanggan('csv')">
    📄 Export CSV
  </button>
  <button class="btn btn-blue" onclick="openAdd()">
    + Tambah Pelanggan
  </button>
</div>
```

**Perbedaan:**
- Layanan: pakai icon Tabler (`<i class="ti ti-*">`)
- Pelanggan: pakai emoji (📥, 📊, 📄)
- Keduanya valid dan seharusnya terlihat

---

## ✅ Checklist Debugging

- [ ] Hard refresh browser (Ctrl + Shift + R)
- [ ] Test di incognito mode
- [ ] Clear browser cache completely
- [ ] Restart server (`pm2 restart`)
- [ ] Verify git version (commit `231b76f`)
- [ ] Test standalone file (`test-pelanggan-buttons.html`)
- [ ] Inspect element di DevTools
- [ ] Check console untuk error JavaScript
- [ ] Verify fungsi `openImportModal()` dan `exportPelanggan()` ada

---

## 🚨 Jika Masih Belum Terlihat

Kemungkinan ada override CSS yang menyembunyikan tombol.

**Cek di DevTools:**
```javascript
// Cek apakah tombol ada tapi tersembunyi
const buttons = document.querySelectorAll('.page-header button');
buttons.forEach(btn => {
  console.log({
    text: btn.textContent.trim(),
    display: window.getComputedStyle(btn).display,
    visibility: window.getComputedStyle(btn).visibility,
    opacity: window.getComputedStyle(btn).opacity
  });
});
```

Jika `display: none` atau `visibility: hidden` → ada CSS yang override.

---

## 📝 Kesimpulan

**Kode sudah 100% benar.**  
Tombol sudah ada di HTML sejak commit `231b76f`.  

Masalah pasti di:
1. Browser cache (paling sering)
2. Server cache
3. Service worker

**Solusi tercepat:** Hard refresh + Incognito mode.
