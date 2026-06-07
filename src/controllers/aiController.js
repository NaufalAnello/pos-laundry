const db = require('../database/connection');

// Helper untuk memanggil DeepSeek API
async function callDeepSeek(messages, apiKey, apiUrl, model) {
  const response = await fetch(apiUrl || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Helper untuk mengambil data konteks bisnis
async function getBusinessContext() {
  const now = new Date();
  // Kolom tanggal di DB disimpan sebagai Unix epoch milidetik (integer), bukan ISO string
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStartMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nowMs = now.getTime();

  // Total order dan pendapatan hari ini
  const orderHariIni = db('transaksi')
    .where('tanggal_masuk', '>=', todayStartMs)
    .select(
      db.raw('COUNT(*) as jumlah_order'),
      db.raw('COALESCE(SUM(total_bayar), 0) as total_pendapatan')
    )
    .first();

  // Total order dan pendapatan minggu ini
  const orderMingguIni = db('transaksi')
    .where('tanggal_masuk', '>=', weekStartMs)
    .select(
      db.raw('COUNT(*) as jumlah_order'),
      db.raw('COALESCE(SUM(total_bayar), 0) as total_pendapatan')
    )
    .first();

  // Total order dan pendapatan bulan ini
  const orderBulanIni = db('transaksi')
    .where('tanggal_masuk', '>=', monthStartMs)
    .select(
      db.raw('COUNT(*) as jumlah_order'),
      db.raw('COALESCE(SUM(total_bayar), 0) as total_pendapatan')
    )
    .first();

  // Order yang sedang berjalan
  const orderBerjalan = db('transaksi')
    .whereIn('status', ['pending', 'proses'])
    .count('* as total')
    .first();

  // Order lewat estimasi
  const orderLewatEstimasi = db('transaksi')
    .where('tanggal_selesai', '<', nowMs)
    .whereIn('status', ['pending', 'proses'])
    .count('* as total')
    .first();

  // 5 layanan terlaris bulan ini
  const layananTerlaris = db('detail_transaksi')
    .join('transaksi', 'detail_transaksi.transaksi_id', 'transaksi.id')
    .join('layanan', 'detail_transaksi.layanan_id', 'layanan.id')
    .where('transaksi.tanggal_masuk', '>=', monthStartMs)
    .groupBy('detail_transaksi.layanan_id')
    .select(
      'layanan.nama',
      db.raw('COUNT(*) as jumlah_order'),
      db.raw('COALESCE(SUM(detail_transaksi.subtotal), 0) as total_pendapatan')
    )
    .orderBy('jumlah_order', 'desc')
    .limit(5);

  // 5 pelanggan paling aktif
  const pelangganAktif = db('transaksi')
    .join('pelanggan', 'transaksi.pelanggan_id', 'pelanggan.id')
    .where('transaksi.tanggal_masuk', '>=', monthStartMs)
    .groupBy('transaksi.pelanggan_id')
    .select(
      'pelanggan.nama',
      'pelanggan.telepon',
      db.raw('COUNT(*) as jumlah_order'),
      db.raw('COALESCE(SUM(transaksi.total_bayar), 0) as total_belanja')
    )
    .orderBy('jumlah_order', 'desc')
    .limit(5);

  // Total piutang (transaksi yang masih ada sisa pembayaran, belum dibatalkan/diambil)
  const piutang = db('transaksi')
    .whereRaw('bayar < total_bayar')
    .whereNotIn('status', ['dibatalkan', 'diambil'])
    .select(
      db.raw('COUNT(*) as jumlah_order'),
      db.raw('COALESCE(SUM(total_bayar - bayar), 0) as total_piutang')
    )
    .first();

  // Total deposit pelanggan
  const totalDeposit = db('deposit_pelanggan')
    .sum('saldo as total')
    .first();

  // Eksekusi semua query paralel
  const [
    hariIni,
    mingguIni,
    bulanIni,
    berjalan,
    lewatEstimasi,
    terlaris,
    aktif,
    hutang,
    deposit
  ] = await Promise.all([
    orderHariIni,
    orderMingguIni,
    orderBulanIni,
    orderBerjalan,
    orderLewatEstimasi,
    layananTerlaris,
    pelangganAktif,
    piutang,
    totalDeposit
  ]);

  return {
    hari_ini: {
      jumlah_order: Number(hariIni?.jumlah_order || 0),
      total_pendapatan: Number(hariIni?.total_pendapatan || 0)
    },
    minggu_ini: {
      jumlah_order: Number(mingguIni?.jumlah_order || 0),
      total_pendapatan: Number(mingguIni?.total_pendapatan || 0)
    },
    bulan_ini: {
      jumlah_order: Number(bulanIni?.jumlah_order || 0),
      total_pendapatan: Number(bulanIni?.total_pendapatan || 0)
    },
    order_berjalan: Number(berjalan?.total || 0),
    order_lewat_estimasi: Number(lewatEstimasi?.total || 0),
    layanan_terlaris: (terlaris || []).map(l => ({
      nama: l.nama,
      jumlah_order: Number(l.jumlah_order || 0),
      total_pendapatan: Number(l.total_pendapatan || 0)
    })),
    pelanggan_aktif: (aktif || []).map(p => ({
      nama: p.nama,
      telepon: p.telepon,
      jumlah_order: Number(p.jumlah_order || 0),
      total_belanja: Number(p.total_belanja || 0)
    })),
    piutang: {
      jumlah_order: Number(hutang?.jumlah_order || 0),
      total_piutang: Number(hutang?.total_piutang || 0)
    },
    total_deposit: Number(deposit?.total || 0)
  };
}

// POST /api/v1/ai/chat
exports.chat = async (req, res) => {
  try {
    const { pesan, riwayat } = req.body;

    if (!pesan || typeof pesan !== 'string') {
      return res.status(400).json({ error: 'Pesan harus diisi' });
    }

    // Cek apakah AI diaktifkan dan API key tersedia
    const pengaturanRows = await db('pengaturan').select('kunci', 'nilai');
    const pengaturan = Object.fromEntries(pengaturanRows.map(r => [r.kunci, r.nilai]));
    const aiEnabled = pengaturan.ai_enabled === 'true' || pengaturan.ai_enabled === '1' || pengaturan.ai_enabled === true;
    const apiKey = pengaturan.deepseek_api_key || process.env.DEEPSEEK_API_KEY;

    if (!aiEnabled) {
      return res.status(400).json({ error: 'AI Assistant belum diaktifkan. Silakan aktifkan di halaman Pengaturan.' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'DeepSeek API Key belum dikonfigurasi. Silakan isi di halaman Pengaturan.' });
    }

    // Ambil data konteks bisnis
    const context = await getBusinessContext();

    // Build system prompt dengan data konteks
    const systemPrompt = `Kamu adalah asisten bisnis untuk Nala Laundry di Mempawah Hilir, Kalimantan Barat.
Kamu membantu operator menganalisis data bisnis dan membuat keputusan.
Jawab dalam Bahasa Indonesia yang ramah dan profesional.

DATA BISNIS TERKINI:

Hari Ini:
- Jumlah order: ${context.hari_ini.jumlah_order}
- Total pendapatan: Rp ${context.hari_ini.total_pendapatan.toLocaleString('id-ID')}

Minggu Ini (7 hari terakhir):
- Jumlah order: ${context.minggu_ini.jumlah_order}
- Total pendapatan: Rp ${context.minggu_ini.total_pendapatan.toLocaleString('id-ID')}

Bulan Ini:
- Jumlah order: ${context.bulan_ini.jumlah_order}
- Total pendapatan: Rp ${context.bulan_ini.total_pendapatan.toLocaleString('id-ID')}

Order yang Sedang Berjalan: ${context.order_berjalan}
Order Lewat Estimasi: ${context.order_lewat_estimasi}

5 Layanan Terlaris Bulan Ini:
${context.layanan_terlaris.map((l, i) => `${i + 1}. ${l.nama} - ${l.jumlah_order} order (Rp ${l.total_pendapatan.toLocaleString('id-ID')})`).join('\n')}

5 Pelanggan Paling Aktif:
${context.pelanggan_aktif.map((p, i) => `${i + 1}. ${p.nama} (${p.telepon || '-'}) - ${p.jumlah_order} order (Rp ${p.total_belanja.toLocaleString('id-ID')})`).join('\n')}

Piutang (Belum Lunas):
- Jumlah order: ${context.piutang.jumlah_order}
- Total piutang: Rp ${context.piutang.total_piutang.toLocaleString('id-ID')}

Total Saldo Deposit Pelanggan: Rp ${context.total_deposit.toLocaleString('id-ID')}`;

    // Build messages untuk API
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Tambahkan riwayat chat jika ada (max 10 pesan terakhir)
    if (Array.isArray(riwayat) && riwayat.length > 0) {
      const recentHistory = riwayat.slice(-10);
      messages.push(...recentHistory);
    }

    // Tambahkan pesan user terbaru
    messages.push({ role: 'user', content: pesan });

    // Panggil DeepSeek API
    const jawaban = await callDeepSeek(messages, apiKey);

    res.json({ jawaban });
  } catch (error) {
    console.error('Error AI chat:', error);
    res.status(500).json({
      error: 'Gagal menghubungi AI Assistant',
      detail: error.message
    });
  }
};

// GET /api/v1/ai/insight
exports.getInsight = async (req, res) => {
  try {
    // Cek apakah AI diaktifkan dan API key tersedia
    const pengaturanRows = await db('pengaturan').select('kunci', 'nilai');
    const pengaturan = Object.fromEntries(pengaturanRows.map(r => [r.kunci, r.nilai]));
    const aiEnabled = pengaturan.ai_enabled === 'true' || pengaturan.ai_enabled === '1' || pengaturan.ai_enabled === true;
    const apiKey = pengaturan.deepseek_api_key || process.env.DEEPSEEK_API_KEY;

    if (!aiEnabled) {
      return res.status(400).json({ error: 'AI Assistant belum diaktifkan. Silakan aktifkan di halaman Pengaturan.' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'DeepSeek API Key belum dikonfigurasi. Silakan isi di halaman Pengaturan.' });
    }

    // Cek cache (1 jam)
    const cachedInsight = pengaturan.ai_insight_cache;
    const cacheTime = pengaturan.ai_insight_cache_time;
    if (cachedInsight && cacheTime) {
      const cacheAge = Date.now() - new Date(cacheTime).getTime();
      if (cacheAge < 60 * 60 * 1000) { // 1 jam
        return res.json(JSON.parse(cachedInsight));
      }
    }

    // Ambil data 30 hari terakhir (tanggal_masuk = unix epoch ms)
    const now = new Date();
    const thirtyDaysAgoMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    const transaksi30Hari = await db('transaksi')
      .where('tanggal_masuk', '>=', thirtyDaysAgoMs)
      .select('*');

    const detail30Hari = await db('detail_transaksi')
      .join('transaksi', 'detail_transaksi.transaksi_id', 'transaksi.id')
      .join('layanan', 'detail_transaksi.layanan_id', 'layanan.id')
      .where('transaksi.tanggal_masuk', '>=', thirtyDaysAgoMs)
      .select('detail_transaksi.*', 'layanan.nama as layanan_nama', 'transaksi.tanggal_masuk');

    // Ambil data konteks bisnis terkini
    const context = await getBusinessContext();

    // Analisis per hari dalam seminggu (tanggal_masuk = ms epoch)
    const orderPerHari = {};
    transaksi30Hari.forEach(t => {
      const day = new Date(Number(t.tanggal_masuk)).toLocaleDateString('id-ID', { weekday: 'long' });
      orderPerHari[day] = (orderPerHari[day] || 0) + 1;
    });

    // Build prompt untuk insight
    const prompt = `Berdasarkan data 30 hari terakhir dan kondisi bisnis saat ini, buatlah analisis lengkap dalam format JSON berikut:

{
  "ringkasan_hari_ini": "string (2-3 kalimat ringkasan kondisi hari ini)",
  "insight_tren": {
    "hari_tersibuk": "string (nama hari)",
    "layanan_tren_naik": ["string (nama layanan)"],
    "layanan_tren_turun": ["string (nama layanan)"],
    "pelanggan_meningkat": ["string (nama pelanggan)"]
  },
  "peringatan": [
    {
      "jenis": "warning|info|success",
      "icon": "⚠️|💡|📈|👥",
      "pesan": "string"
    }
  ],
  "prediksi": {
    "pendapatan_minggu_depan": "string (estimasi range)",
    "layanan_ramai": ["string (nama layanan)"]
  }
}

DATA:
${JSON.stringify({
  transaksi_30_hari: transaksi30Hari.length,
  total_pendapatan_30_hari: transaksi30Hari.reduce((sum, t) => sum + Number(t.total_bayar || 0), 0),
  order_per_hari: orderPerHari,
  kondisi_hari_ini: context.hari_ini,
  order_lewat_estimasi: context.order_lewat_estimasi,
  layanan_terlaris: context.layanan_terlaris,
  pelanggan_aktif: context.pelanggan_aktif
}, null, 2)}

Jawab HANYA dengan JSON yang valid, tanpa penjelasan tambahan.`;

    const messages = [
      { role: 'system', content: 'Kamu adalah analis bisnis yang ahli dalam menganalisis data laundry dan memberikan insight dalam format JSON.' },
      { role: 'user', content: prompt }
    ];

    // Panggil DeepSeek API
    const response = await callDeepSeek(messages, apiKey);

    // Parse JSON response
    let insight;
    try {
      // Bersihkan response dari markdown code block jika ada
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      insight = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', response);
      throw new Error('AI response tidak dalam format JSON yang valid');
    }

    // Simpan cache (pola kunci/nilai, konsisten dengan pembacaan di atas)
    const cachePayload = [
      { kunci: 'ai_insight_cache', nilai: JSON.stringify(insight) },
      { kunci: 'ai_insight_cache_time', nilai: new Date().toISOString() }
    ];
    for (const { kunci, nilai } of cachePayload) {
      const existing = await db('pengaturan').where({ kunci }).first();
      if (existing) {
        await db('pengaturan').where({ kunci }).update({ nilai, updated_at: new Date() });
      } else {
        await db('pengaturan').insert({
          kunci, nilai, deskripsi: '', created_at: new Date(), updated_at: new Date()
        });
      }
    }

    res.json(insight);
  } catch (error) {
    console.error('Error AI insight:', error);
    res.status(500).json({
      error: 'Gagal menghasilkan insight',
      detail: error.message
    });
  }
};

// GET /api/v1/ai/prediksi-sibuk
// Analisis pola hari & jam tersibuk dari order 90 hari terakhir (timezone WITA / UTC+8).
exports.getPrediksiSibuk = async (req, res) => {
  try {
    // Cek AI enabled + API key
    const pengaturanRows = await db('pengaturan').select('kunci', 'nilai');
    const pengaturan = Object.fromEntries(pengaturanRows.map(r => [r.kunci, r.nilai]));
    const aiEnabled = pengaturan.ai_enabled === 'true' || pengaturan.ai_enabled === '1' || pengaturan.ai_enabled === true;
    const apiKey = pengaturan.deepseek_api_key || process.env.DEEPSEEK_API_KEY;

    if (!aiEnabled) {
      return res.status(400).json({ error: 'AI Assistant belum diaktifkan. Silakan aktifkan di halaman Pengaturan.' });
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'DeepSeek API Key belum dikonfigurasi. Silakan isi di halaman Pengaturan.' });
    }

    // Cache 1 jam
    const cachedRaw = pengaturan.ai_prediksi_sibuk_cache;
    const cacheTime = pengaturan.ai_prediksi_sibuk_cache_time;
    if (cachedRaw && cacheTime) {
      const cacheAge = Date.now() - new Date(cacheTime).getTime();
      if (cacheAge < 60 * 60 * 1000) {
        try { return res.json(JSON.parse(cachedRaw)); } catch {}
      }
    }

    const now = Date.now();
    const ninetyDaysAgoMs = now - 90 * 24 * 60 * 60 * 1000;
    const fourWeeksAgoMs = now - 28 * 24 * 60 * 60 * 1000;
    const eightWeeksAgoMs = now - 56 * 24 * 60 * 60 * 1000;

    // WITA = UTC+8 (28800 detik). Konversi epoch ms -> detik + offset.
    const tzExpr = "datetime(tanggal_masuk/1000 + 28800, 'unixepoch')";

    // 1) Order per hari dalam seminggu (0=Minggu .. 6=Sabtu)
    const perHariRows = await db('transaksi')
      .where('tanggal_masuk', '>=', ninetyDaysAgoMs)
      .whereNot('status', 'dibatalkan')
      .select(
        db.raw(`strftime('%w', ${tzExpr}) as hari`),
        db.raw('COUNT(*) as total_order'),
        db.raw(`COUNT(DISTINCT strftime('%Y-%m-%d', ${tzExpr})) as jumlah_minggu`)
      )
      .groupBy('hari')
      .orderBy('hari');

    // 2) Order per jam (00-23)
    const perJamRows = await db('transaksi')
      .where('tanggal_masuk', '>=', ninetyDaysAgoMs)
      .whereNot('status', 'dibatalkan')
      .select(
        db.raw(`strftime('%H', ${tzExpr}) as jam`),
        db.raw('COUNT(*) as total_order'),
        db.raw(`COUNT(DISTINCT strftime('%Y-%m-%d', ${tzExpr})) as jumlah_hari`)
      )
      .groupBy('jam')
      .orderBy('jam');

    // 3) Tren 4 minggu terakhir vs 4 minggu sebelumnya
    const [tren4Akhir, tren4Sebelumnya] = await Promise.all([
      db('transaksi')
        .where('tanggal_masuk', '>=', fourWeeksAgoMs)
        .whereNot('status', 'dibatalkan')
        .count('id as total')
        .first(),
      db('transaksi')
        .where('tanggal_masuk', '>=', eightWeeksAgoMs)
        .where('tanggal_masuk', '<', fourWeeksAgoMs)
        .whereNot('status', 'dibatalkan')
        .count('id as total')
        .first()
    ]);

    // Susun per-hari lengkap (7 hari) dengan rata-rata
    const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const perHariMap = Object.fromEntries(perHariRows.map(r => [Number(r.hari), r]));
    const perHari = namaHari.map((nama, idx) => {
      const row = perHariMap[idx];
      const total = Number(row?.total_order || 0);
      const minggu = Number(row?.jumlah_minggu || 0);
      return {
        hari: idx,
        nama,
        total_order: total,
        rata_rata: minggu > 0 ? Number((total / minggu).toFixed(2)) : 0
      };
    });

    // Susun per-jam lengkap (24 jam) dengan rata-rata
    const perJamMap = Object.fromEntries(perJamRows.map(r => [Number(r.jam), r]));
    const perJam = Array.from({ length: 24 }, (_, jam) => {
      const row = perJamMap[jam];
      const total = Number(row?.total_order || 0);
      const hari = Number(row?.jumlah_hari || 0);
      return {
        jam,
        label: String(jam).padStart(2, '0') + ':00',
        total_order: total,
        rata_rata: hari > 0 ? Number((total / hari).toFixed(2)) : 0
      };
    });

    // Hari tersibuk
    const hariTersibuk = perHari.reduce((max, cur) =>
      cur.rata_rata > max.rata_rata ? cur : max, perHari[0]);

    // Jam tersibuk — cari window 2 jam tertinggi
    let jamTersibukStart = 0;
    let jamTersibukMax = 0;
    for (let i = 0; i < 23; i++) {
      const sum = perJam[i].rata_rata + perJam[i + 1].rata_rata;
      if (sum > jamTersibukMax) {
        jamTersibukMax = sum;
        jamTersibukStart = i;
      }
    }
    const jamTersibukLabel = `${String(jamTersibukStart).padStart(2,'0')}:00-${String(jamTersibukStart+2).padStart(2,'0')}:00`;
    const jamTersibukRata = Number((jamTersibukMax / 2).toFixed(2));

    // Tren minggu ini vs rata-rata
    const total4Akhir = Number(tren4Akhir?.total || 0);
    const total4Sebelumnya = Number(tren4Sebelumnya?.total || 0);
    const trenPersen = total4Sebelumnya > 0
      ? Number((((total4Akhir - total4Sebelumnya) / total4Sebelumnya) * 100).toFixed(1))
      : 0;

    // Layanan terlaris di hari tersibuk (90 hari)
    const layananHariSibuk = await db('detail_transaksi')
      .join('transaksi', 'detail_transaksi.transaksi_id', 'transaksi.id')
      .join('layanan', 'detail_transaksi.layanan_id', 'layanan.id')
      .where('transaksi.tanggal_masuk', '>=', ninetyDaysAgoMs)
      .whereNot('transaksi.status', 'dibatalkan')
      .whereRaw(`strftime('%w', ${tzExpr.replace(/tanggal_masuk/g, 'transaksi.tanggal_masuk')}) = ?`, [String(hariTersibuk.hari)])
      .groupBy('detail_transaksi.layanan_id')
      .select(
        'layanan.nama',
        db.raw('COUNT(*) as jumlah_order')
      )
      .orderBy('jumlah_order', 'desc')
      .limit(3);

    // Generate rekomendasi via DeepSeek
    const ringkasanData = {
      hari_tersibuk: { nama: hariTersibuk.nama, rata_rata: hariTersibuk.rata_rata },
      jam_tersibuk: { label: jamTersibukLabel, rata_rata: jamTersibukRata },
      tren_persen: trenPersen,
      layanan_di_hari_sibuk: layananHariSibuk.map(l => l.nama)
    };

    const prompt = `Berdasarkan analisis 90 hari order terakhir di Nala Laundry (Mempawah Hilir, Kalimantan Barat), berikan rekomendasi operasional singkat (maksimal 3 kalimat) dalam Bahasa Indonesia.

Data:
- Hari tersibuk: ${hariTersibuk.nama} (rata-rata ${hariTersibuk.rata_rata} order/hari)
- Jam tersibuk: ${jamTersibukLabel} WITA (rata-rata ${jamTersibukRata} order/jam)
- Tren 4 minggu terakhir vs 4 minggu sebelumnya: ${trenPersen >= 0 ? '+' : ''}${trenPersen}%
- Layanan paling banyak di hari tersibuk: ${ringkasanData.layanan_di_hari_sibuk.join(', ') || '-'}

Jawab dengan rekomendasi praktis (kapasitas, staffing, promo), tanpa pembukaan basa-basi.`;

    let rekomendasi = '';
    try {
      rekomendasi = await callDeepSeek(
        [
          { role: 'system', content: 'Kamu adalah konsultan operasional bisnis laundry yang to the point.' },
          { role: 'user', content: prompt }
        ],
        apiKey
      );
    } catch (e) {
      console.error('[ai:prediksi-sibuk] gagal generate rekomendasi:', e.message);
      rekomendasi = `Hari tersibuk: ${hariTersibuk.nama} (rata-rata ${hariTersibuk.rata_rata} order). Jam tersibuk: ${jamTersibukLabel}. Pertimbangkan menambah kapasitas di window ini.`;
    }

    const result = {
      periode: { dari: new Date(ninetyDaysAgoMs).toISOString(), sampai: new Date(now).toISOString() },
      per_hari: perHari,
      per_jam: perJam,
      ringkasan: {
        hari_tersibuk: { nama: hariTersibuk.nama, rata_rata: hariTersibuk.rata_rata },
        jam_tersibuk: { label: jamTersibukLabel, rata_rata: jamTersibukRata },
        tren_persen: trenPersen,
        total_4_minggu_terakhir: total4Akhir,
        total_4_minggu_sebelumnya: total4Sebelumnya,
        layanan_di_hari_sibuk: layananHariSibuk.map(l => ({
          nama: l.nama,
          jumlah_order: Number(l.jumlah_order || 0)
        }))
      },
      rekomendasi_ai: rekomendasi
    };

    // Simpan cache (pola kunci/nilai)
    const cachePayload = [
      { kunci: 'ai_prediksi_sibuk_cache', nilai: JSON.stringify(result) },
      { kunci: 'ai_prediksi_sibuk_cache_time', nilai: new Date().toISOString() }
    ];
    for (const { kunci, nilai } of cachePayload) {
      const existing = await db('pengaturan').where({ kunci }).first();
      if (existing) {
        await db('pengaturan').where({ kunci }).update({ nilai, updated_at: new Date() });
      } else {
        await db('pengaturan').insert({
          kunci, nilai, deskripsi: '', created_at: new Date(), updated_at: new Date()
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error AI prediksi-sibuk:', error);
    res.status(500).json({
      error: 'Gagal menghasilkan prediksi hari & jam tersibuk',
      detail: error.message
    });
  }
};

// POST /api/v1/ai/test-connection
exports.testConnection = async (req, res) => {
  try {
    const { apiKey, apiUrl, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API Key harus diisi' });
    }

    // Test dengan pesan sederhana
    const messages = [
      { role: 'system', content: 'Kamu adalah asisten yang membantu.' },
      { role: 'user', content: 'Halo, ini adalah test koneksi. Balas dengan "OK".' }
    ];

    const response = await callDeepSeek(messages, apiKey, apiUrl, model);

    res.json({
      success: true,
      message: 'Koneksi berhasil!',
      response
    });
  } catch (error) {
    console.error('Error test connection:', error);
    res.status(500).json({
      success: false,
      error: 'Koneksi gagal',
      detail: error.message
    });
  }
};
