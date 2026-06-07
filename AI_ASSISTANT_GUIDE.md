# 🤖 AI Assistant — POS Laundry

Fitur AI Assistant menggunakan **DeepSeek API** untuk membantu operator menganalisis data bisnis dan membuat keputusan.

## 📋 Fitur

### 1. AI Chat di Dashboard
- **Akses**: Klik tombol `🤖 Tanya AI` di Dashboard
- **Fungsi**: Chat interaktif dengan AI tentang data bisnis
- **Contoh pertanyaan**:
  - "Layanan apa yang paling laku bulan ini?"
  - "Berapa total pendapatan minggu ini?"
  - "Pelanggan mana yang paling sering order?"
  - "Order mana yang sudah lewat estimasi?"
  - "Berapa rata-rata nilai order per hari?"

**Fitur Chat:**
- Panel chat slide dari kanan
- Quick question buttons untuk pertanyaan cepat
- History chat tersimpan dalam sesi
- Responsif untuk mobile

### 2. AI Insight (Analitik Otomatis)
- **Akses**: Menu `🤖 AI Insight` di sidebar
- **Fungsi**: Analisis otomatis data 30 hari terakhir
- **Konten**:
  
  **📊 Ringkasan Bisnis Hari Ini**
  - Ringkasan kondisi bisnis dalam 2-3 kalimat
  
  **📈 Insight Tren (30 Hari)**
  - Hari tersibuk dalam seminggu
  - Layanan yang tren naik/turun
  - Pelanggan dengan frekuensi order meningkat
  
  **⚠️ Peringatan & Rekomendasi**
  - Order lewat estimasi
  - Rekomendasi operasional
  - Tren yang perlu diperhatikan
  
  **🔮 Prediksi**
  - Estimasi pendapatan minggu depan
  - Layanan yang kemungkinan ramai

**Cache:**
- Insight di-cache selama **1 jam** untuk efisiensi
- Klik `🔄 Refresh Insight` untuk update manual

## ⚙️ Konfigurasi

### 1. Dapatkan API Key DeepSeek
1. Kunjungi [platform.deepseek.com](https://platform.deepseek.com)
2. Daftar/login
3. Buat API key baru
4. Copy API key (format: `sk-xxxxx`)

### 2. Aktivasi di POS Laundry
1. Buka menu **Pengaturan** → Tab **🤖 AI Assistant**
2. Toggle **Aktifkan AI Assistant** → ON
3. Paste **DeepSeek API Key**
4. (Opsional) Ubah **Model** jika diperlukan:
   - `deepseek-chat` (recommended) — model utama
   - `deepseek-reasoner` — untuk reasoning lebih dalam
5. Klik **🔌 Test Koneksi** untuk validasi
6. Klik **💾 Simpan Pengaturan AI**

### 3. Environment Variables (Opsional)
Alternatif konfigurasi via `.env`:

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
DEEPSEEK_MODEL=deepseek-chat
```

Prioritas: **Pengaturan DB > .env**

## 🔧 Technical Details

### API Endpoints
```
POST /api/v1/ai/chat
Body: { pesan: string, riwayat: array }
Response: { jawaban: string }

GET /api/v1/ai/insight
Response: { ringkasan_hari_ini, insight_tren, peringatan, prediksi }

POST /api/v1/ai/test-connection
Body: { apiKey, apiUrl?, model? }
Response: { success: boolean, message: string }
```

### Database Schema
```sql
-- Tabel: pengaturan
ai_enabled            BOOLEAN   -- Toggle AI on/off
deepseek_api_key      TEXT      -- API key (encrypted recommended)
ai_insight_cache      TEXT      -- JSON cache insight
ai_insight_cache_time DATETIME  -- Timestamp cache
```

### Data Context yang Dikirim ke AI

**Untuk Chat:**
- Total order & pendapatan (hari ini, minggu ini, bulan ini)
- Order yang sedang berjalan
- Order lewat estimasi
- 5 layanan terlaris bulan ini
- 5 pelanggan paling aktif
- Total piutang (belum lunas)
- Total saldo deposit

**Untuk Insight:**
- Data transaksi 30 hari terakhir
- Detail layanan & frekuensi order
- Pola order per hari dalam seminggu
- Data pelanggan aktif

### System Prompt
```
Kamu adalah asisten bisnis untuk Nala Laundry 
di Mempawah Hilir, Kalimantan Barat.
Kamu membantu operator menganalisis data bisnis 
dan membuat keputusan. 
Jawab dalam Bahasa Indonesia yang ramah dan profesional.
```

## 💰 Biaya & Quota

**DeepSeek Pricing** (per 1M tokens):
- Input: ~$0.14 - $0.28
- Output: ~$0.28 - $1.10

**Estimasi Penggunaan:**
- Chat (rata-rata): ~500 tokens/request
- Insight: ~2000 tokens/request
- Cache insight 1 jam = maksimal 24 request/hari

**Tips Hemat:**
- Gunakan cache insight (jangan terlalu sering refresh)
- Pertanyaan chat yang spesifik lebih efisien
- Monitor usage di DeepSeek dashboard

## 🐛 Troubleshooting

### Error: "AI Assistant belum diaktifkan"
✅ Aktifkan toggle di Pengaturan → AI Assistant

### Error: "DeepSeek API Key belum dikonfigurasi"
✅ Isi API Key di Pengaturan → AI Assistant

### Error: "Koneksi gagal"
- ✅ Cek API Key valid
- ✅ Cek koneksi internet
- ✅ Cek quota DeepSeek belum habis

### Chat tidak muncul jawaban
- ✅ Cek console browser untuk error
- ✅ Pastikan server running
- ✅ Cek log server: `pm2 logs pos-laundry`

### Insight tidak muncul
- ✅ Pastikan ada data transaksi minimal 7 hari
- ✅ Clear cache: klik Refresh Insight
- ✅ Cek API quota

## 📱 Mobile Support

✅ **Fully responsive**
- Chat panel: full-width pada mobile
- AI Insight: grid columns menyesuaikan
- Quick question buttons: scrollable horizontal

## 🔒 Security Notes

⚠️ **API Key Storage:**
- Saat ini API key disimpan **plain text** di database
- **Rekomendasi**: Gunakan encryption untuk production
- Jangan commit `.env` dengan API key ke git

⚠️ **Rate Limiting:**
- Tidak ada rate limiting di aplikasi
- Bergantung pada rate limit DeepSeek API
- Consider menambahkan rate limiting untuk production

## 📄 License & Attribution

- **DeepSeek API**: [DeepSeek Terms of Service](https://platform.deepseek.com/terms)
- Pastikan comply dengan DeepSeek usage policy
- Data bisnis tidak di-training oleh DeepSeek (sesuai privacy policy)

---

**Developed for:** Nala Laundry, Mempawah Hilir, Kalimantan Barat  
**Version:** 1.0.0  
**Date:** June 2026
