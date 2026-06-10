const Joi = require('joi');
const db  = require('../database/connection');
const ajService = require('../services/antarJemputService');

const SETTING_KEYS = {
  aj_harga_bbm:    { default: 10000, desc: 'Harga Pertalite per liter (Rp)' },
  aj_konsumsi_bbm: { default: 39,    desc: 'Konsumsi BBM motor (km/liter)' },
  aj_biaya_aus:    { default: 400,   desc: 'Biaya aus kendaraan (Rp/km)' },
  aj_kecepatan:    { default: 30,    desc: 'Kecepatan rata-rata (km/jam)' },
  aj_jam_kerja:    { default: 8,     desc: 'Jam kerja per hari' },
};

// ── POST /api/v1/antar-jemput/hitung ─────────────────────────────────────────
// Body: { pelanggan_ids: [1,2,3], jarak_overrides?: { "<id>": km } }
// jarak_overrides dipakai jika user input jarak baru dari popup tapi belum disimpan.
exports.hitung = async (req, res) => {
  const schema = Joi.object({
    pelanggan_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    jarak_overrides: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional()
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const pelangganRows = await db('pelanggan')
      .whereIn('id', value.pelanggan_ids)
      .select('id', 'nama', 'jarak_workshop_km');

    if (pelangganRows.length !== value.pelanggan_ids.length) {
      return res.status(400).json({ error: 'Sebagian pelanggan tidak ditemukan' });
    }

    const overrides = value.jarak_overrides || {};
    const tanpaJarak = [];
    const pelangganList = pelangganRows.map(p => {
      const override = overrides[String(p.id)];
      const jarak = override != null ? Number(override) : Number(p.jarak_workshop_km || 0);
      if (jarak <= 0) tanpaJarak.push({ id: p.id, nama: p.nama });
      return { id: p.id, nama: p.nama, jarak_km: jarak };
    });

    if (tanpaJarak.length > 0) {
      return res.status(400).json({
        error: 'Sebagian pelanggan belum punya data jarak',
        pelanggan_tanpa_jarak: tanpaJarak
      });
    }

    const hasil = await ajService.hitungHPP(pelangganList, db);
    const saranAI = await ajService.konsultasiAI(hasil, pelangganList, db);

    res.json({
      data: {
        ...hasil,
        saran_ai: saranAI,
        pelanggan: pelangganList,
      }
    });
  } catch (err) {
    console.error('[antarJemput:hitung]', err);
    res.status(500).json({ error: 'Gagal menghitung HPP antar jemput', detail: err.message });
  }
};

// ── POST /api/v1/antar-jemput/simpan ─────────────────────────────────────────
// Body: { tanggal, pelanggan_ids, jarak_overrides?, tarif_dikenakan, hasil_kalkulasi }
exports.simpan = async (req, res) => {
  const schema = Joi.object({
    tanggal: Joi.string().required(), // YYYY-MM-DD
    pelanggan_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    jarak_overrides: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
    tarif_dikenakan: Joi.number().min(0).required(),
    hasil_kalkulasi: Joi.object().required()
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const pelangganRows = await db('pelanggan')
      .whereIn('id', value.pelanggan_ids)
      .select('id', 'nama', 'jarak_workshop_km');

    if (pelangganRows.length !== value.pelanggan_ids.length) {
      return res.status(400).json({ error: 'Sebagian pelanggan tidak ditemukan' });
    }

    const overrides = value.jarak_overrides || {};

    // Simpan jarak baru ke profil pelanggan kalau ada override
    for (const [idStr, jarak] of Object.entries(overrides)) {
      await db('pelanggan').where({ id: Number(idStr) }).update({
        jarak_workshop_km: Number(jarak),
        updated_at: new Date()
      });
    }

    const pelangganList = pelangganRows.map(p => {
      const override = overrides[String(p.id)];
      const jarak = override != null ? Number(override) : Number(p.jarak_workshop_km || 0);
      return { id: p.id, nama: p.nama, jarak_km: jarak };
    });

    // Re-hitung dengan parameter aktual saat ini (== snapshot yang disimpan)
    const hasil = await ajService.hitungHPP(pelangganList, db);

    // Cari order aktif tiap pelanggan untuk dikaitkan
    const orderAktifMap = {};
    for (const p of pelangganList) {
      const order = await db('transaksi')
        .where('pelanggan_id', p.id)
        .whereIn('status', ['pending', 'proses'])
        .orderBy('id', 'desc')
        .first('id');
      orderAktifMap[p.id] = order?.id || null;
    }

    const pelangganDataJson = JSON.stringify(
      pelangganList.map(p => ({
        id: p.id,
        nama: p.nama,
        jarak_km: p.jarak_km,
        order_id: orderAktifMap[p.id]
      }))
    );

    const urutanRuteJson = JSON.stringify(hasil.ruteOptimal.map(p => p.nama));

    let ruteId;
    let biayaTerpasang = 0;

    await db.transaction(async (trx) => {
      const [id] = await trx('rute_antar_jemput').insert({
        tanggal: value.tanggal,
        pelanggan_data: pelangganDataJson,
        urutan_rute: urutanRuteJson,

        snapshot_harga_bbm:    hasil.snapshot.harga_bbm,
        snapshot_konsumsi_bbm: hasil.snapshot.konsumsi_bbm,
        snapshot_biaya_aus:    hasil.snapshot.biaya_aus,
        snapshot_kecepatan:    hasil.snapshot.kecepatan,
        snapshot_nilai_waktu:  hasil.snapshot.nilai_waktu,

        total_jarak_km:    hasil.totalJarak,
        biaya_bbm:         hasil.biayaBBM,
        biaya_waktu:       hasil.biayaWaktu,
        biaya_aus:         hasil.biayaAus,
        total_hpp:         hasil.totalHPP,
        hpp_per_pelanggan: hasil.hppPerPelanggan,
        tarif_dikenakan:   value.tarif_dikenakan,

        saran_ai: value.hasil_kalkulasi.saran_ai || null,
        created_at: new Date()
      });
      ruteId = id;

      // Tambahkan biaya AJ ke order aktif tiap pelanggan
      for (const p of pelangganList) {
        const orderId = orderAktifMap[p.id];
        if (!orderId) continue;

        await trx('biaya_tambahan').insert({
          transaksi_id: orderId,
          keterangan:   `Antar Jemput (rute #${ruteId})`,
          nominal:      value.tarif_dikenakan,
          created_by:   req.session?.userId || null,
          created_at:   new Date()
        });

        // Update total_harga & total_bayar transaksi
        const trxRow = await trx('transaksi').where({ id: orderId }).first();
        if (trxRow) {
          const totalHarga = Number(trxRow.total_harga || 0) + Number(value.tarif_dikenakan);
          const totalBayar = Number(trxRow.total_bayar || 0) + Number(value.tarif_dikenakan);
          await trx('transaksi').where({ id: orderId }).update({
            total_harga: totalHarga,
            total_bayar: totalBayar,
            antar_jemput: true,
            updated_at: new Date()
          });
        }
        biayaTerpasang++;
      }
    });

    res.json({
      success: true,
      rute_id: ruteId,
      biaya_terpasang: biayaTerpasang,
      total_pelanggan:  pelangganList.length,
    });
  } catch (err) {
    console.error('[antarJemput:simpan]', err);
    res.status(500).json({ error: 'Gagal menyimpan rute', detail: err.message });
  }
};

// ── GET /api/v1/antar-jemput/riwayat ─────────────────────────────────────────
exports.riwayat = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db('rute_antar_jemput')
      .orderBy('id', 'desc')
      .limit(limit);

    const data = rows.map(r => ({
      ...r,
      pelanggan_data: safeParse(r.pelanggan_data, []),
      urutan_rute:    safeParse(r.urutan_rute, []),
    }));

    res.json({ data });
  } catch (err) {
    console.error('[antarJemput:riwayat]', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat' });
  }
};

// ── GET /api/v1/antar-jemput/settings ────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    const keys = Object.keys(SETTING_KEYS);
    const rows = await db('pengaturan').whereIn('kunci', keys);
    const map = Object.fromEntries(rows.map(r => [r.kunci, r.nilai]));

    const result = {};
    for (const k of keys) {
      result[k] = Number(map[k] ?? SETTING_KEYS[k].default);
    }
    // Cari row updated_at terbaru untuk display
    const latest = rows.reduce((acc, r) => {
      if (!acc) return r;
      return new Date(r.updated_at) > new Date(acc.updated_at) ? r : acc;
    }, null);
    result.updated_at = latest?.updated_at || null;

    res.json({ data: result });
  } catch (err) {
    console.error('[antarJemput:getSettings]', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan AJ' });
  }
};

// ── PUT /api/v1/antar-jemput/settings ────────────────────────────────────────
exports.updateSettings = async (req, res) => {
  const schema = Joi.object({
    aj_harga_bbm:    Joi.number().min(0).required(),
    aj_konsumsi_bbm: Joi.number().min(0.1).required(),
    aj_biaya_aus:    Joi.number().min(0).required(),
    aj_kecepatan:    Joi.number().min(1).required(),
    aj_jam_kerja:    Joi.number().min(1).max(24).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    for (const [kunci, nilai] of Object.entries(value)) {
      const existing = await db('pengaturan').where({ kunci }).first();
      if (existing) {
        await db('pengaturan').where({ kunci }).update({
          nilai: String(nilai), updated_at: new Date()
        });
      } else {
        await db('pengaturan').insert({
          kunci, nilai: String(nilai),
          deskripsi: SETTING_KEYS[kunci]?.desc || '',
          created_at: new Date(), updated_at: new Date()
        });
      }
    }
    res.json({ message: 'Pengaturan antar jemput berhasil disimpan' });
  } catch (err) {
    console.error('[antarJemput:updateSettings]', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan AJ' });
  }
};

function safeParse(text, fallback) {
  if (!text) return fallback;
  try { return JSON.parse(text); }
  catch { return fallback; }
}
