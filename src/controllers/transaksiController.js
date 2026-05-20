const Joi = require('joi');
const transaksiModel  = require('../models/transaksiModel');
const layananModel    = require('../models/layananModel');
const paketPromoModel = require('../models/paketPromoModel');
const pelangganModel  = require('../models/pelangganModel');
const svc             = require('../services/transaksiService');

// ── Validation schemas ───────────────────────────────────────────────────────
const itemSchema = Joi.object({
  layanan_id: Joi.number().integer().positive().required(),
  jumlah:     Joi.number().positive().required(),
  catatan:    Joi.string().allow('', null)
});

const createSchema = Joi.object({
  pelanggan_id:   Joi.number().integer().positive().allow(null),
  paket_promo_id: Joi.number().integer().positive().allow(null),
  items:          Joi.array().items(itemSchema).min(1).required(),
  poin_digunakan: Joi.number().integer().min(0).default(0),
  metode_bayar:   Joi.string().valid('tunai', 'transfer', 'qris').default('tunai'),
  bayar:          Joi.number().min(0).default(0),
  catatan:        Joi.string().allow('', null),
  tanggal_selesai: Joi.date().iso().allow(null),
  antar_jemput:   Joi.boolean().default(false),
  alamat_jemput:  Joi.string().allow('', null),
  kirim_wa:       Joi.boolean().default(false)
});

const statusSchema = Joi.object({
  status: Joi.string().valid('pending', 'proses', 'selesai', 'diambil', 'dibatalkan').required(),
  bayar:  Joi.number().min(0)
});

// ── GET /api/v1/transaksi ────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const filters = {
      status:      req.query.status,
      tanggal:     req.query.tanggal,
      pelanggan_id: req.query.pelanggan_id,
      q:           req.query.q,
      page:        parseInt(req.query.page)  || 1,
      limit:       parseInt(req.query.limit) || 20
    };
    const [data, count] = await Promise.all([
      transaksiModel.findAll(filters),
      transaksiModel.countAll(filters)
    ]);
    res.json({ data, meta: { total: count.total, page: filters.page, limit: filters.limit } });
  } catch (err) {
    console.error('[transaksi:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data transaksi' });
  }
};

// ── GET /api/v1/transaksi/:id ────────────────────────────────────────────────
exports.show = async (req, res) => {
  try {
    const t = await transaksiModel.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json({ data: t });
  } catch (err) {
    console.error('[transaksi:show]', err);
    res.status(500).json({ error: 'Gagal mengambil transaksi' });
  }
};

// ── POST /api/v1/transaksi ───────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = createSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const settings = await svc.getPoinSettings();

    // Resolve layanan + hitung subtotal per item
    const resolvedItems = [];
    for (const it of value.items) {
      const layanan = await layananModel.findById(it.layanan_id);
      if (!layanan) return res.status(400).json({ error: `Layanan ID ${it.layanan_id} tidak ditemukan` });
      resolvedItems.push({
        layanan_id:    layanan.id,
        nama_layanan:  layanan.nama,
        jumlah:        it.jumlah,
        satuan:        layanan.satuan,
        harga_satuan:  layanan.harga,
        subtotal:      layanan.harga * it.jumlah,
        catatan:       it.catatan || null
      });
    }

    // Resolve promo
    let promo = null;
    if (value.paket_promo_id) {
      promo = await paketPromoModel.findById(value.paket_promo_id);
      if (!promo) return res.status(400).json({ error: 'Paket promo tidak ditemukan atau tidak aktif' });
    }

    // Validasi poin
    let pelanggan = null;
    if (value.pelanggan_id) {
      pelanggan = await pelangganModel.findById(value.pelanggan_id);
      if (!pelanggan) return res.status(400).json({ error: 'Pelanggan tidak ditemukan' });
      if (value.poin_digunakan > 0) {
        if (value.poin_digunakan < settings.minRedeem)
          return res.status(400).json({ error: `Minimum tukar poin: ${settings.minRedeem}` });
        if (value.poin_digunakan > pelanggan.total_poin)
          return res.status(400).json({ error: 'Poin tidak cukup' });
      }
    } else {
      value.poin_digunakan = 0; // non-member tidak bisa pakai poin
    }

    // Hitung harga
    const { totalHarga, diskon, totalBayar } = svc.hitungTotal(
      resolvedItems, promo, value.poin_digunakan, settings.nilaiPerPoin
    );
    const kembalian = Math.max(0, value.bayar - totalBayar);

    // Hitung estimasi selesai
    const maxHari = Math.max(...resolvedItems.map(i => {
      const l = value.items.find(x => x.layanan_id === i.layanan_id);
      return l?.estimasi_hari ?? 2;
    }), 2);
    const tanggalSelesai = value.tanggal_selesai
      ? new Date(value.tanggal_selesai)
      : new Date(Date.now() + maxHari * 86400000);

    const nomor = await transaksiModel.generateNomor();
    const lunas = value.bayar >= totalBayar && totalBayar > 0;

    const transaksiData = {
      nomor_transaksi: nomor,
      pelanggan_id:    value.pelanggan_id   || null,
      user_id:         req.session.user.id,
      paket_promo_id:  value.paket_promo_id || null,
      tanggal_masuk:   new Date(),
      tanggal_selesai: tanggalSelesai,
      status:          'pending',
      total_harga:     totalHarga,
      diskon,
      poin_digunakan:  value.poin_digunakan,
      total_bayar:     totalBayar,
      bayar:           value.bayar,
      kembalian,
      metode_bayar:    value.metode_bayar,
      catatan:         value.catatan        || null,
      antar_jemput:    value.antar_jemput   ? 1 : 0,
      alamat_jemput:   value.alamat_jemput  || null,
      created_at:      new Date(),
      updated_at:      new Date()
    };

    const transaksiId = await transaksiModel.create(transaksiData, resolvedItems);
    const created = await transaksiModel.findById(transaksiId);

    // ── Side effects ────────────────────────────────────────────────────────
    if (pelanggan) {
      // Kurang poin yang digunakan
      if (value.poin_digunakan > 0) {
        await svc.upsertPoinPelanggan(
          pelanggan.id, -value.poin_digunakan, transaksiId,
          'kurang', `Tukar poin untuk ${nomor}`
        );
      }
      // Tambah poin dari transaksi
      const poinEarned = Math.floor(totalBayar / settings.perNominal);
      if (poinEarned > 0) {
        await svc.upsertPoinPelanggan(
          pelanggan.id, poinEarned, transaksiId,
          'tambah', `Poin dari ${nomor}`
        );
      }
    }

    // Kas pemasukan jika lunas
    if (lunas) {
      await svc.buatEntriKas({ ...created, user_id: req.session.user.id });
    }

    // Log WA
    if (value.kirim_wa && pelanggan?.telepon) {
      const pesan = `Halo ${pelanggan.nama}, pesanan laundry Anda (${nomor}) telah kami terima. Total: Rp${totalBayar.toLocaleString('id-ID')}. Estimasi selesai: ${tanggalSelesai.toLocaleDateString('id-ID')}. Terima kasih!`;
      await svc.logWa(pelanggan.telepon, pesan, transaksiId);
    }

    res.status(201).json({ message: 'Transaksi berhasil dibuat', data: created });
  } catch (err) {
    console.error('[transaksi:store]', err);
    res.status(500).json({ error: 'Gagal membuat transaksi' });
  }
};

// ── PUT /api/v1/transaksi/:id ────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const t = await transaksiModel.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    if (t.status === 'diambil' || t.status === 'dibatalkan')
      return res.status(400).json({ error: `Transaksi sudah ${t.status}, tidak dapat diubah` });

    const allowed = ['catatan', 'metode_bayar', 'bayar', 'antar_jemput', 'alamat_jemput', 'tanggal_selesai'];
    const patch = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    if (patch.bayar !== undefined) {
      patch.kembalian = Math.max(0, patch.bayar - t.total_bayar);
    }

    await transaksiModel.update(req.params.id, patch);

    // Buat kas jika baru lunas
    if (patch.bayar >= t.total_bayar && t.total_bayar > 0) {
      await svc.buatEntriKas({ ...t, user_id: req.session.user.id });
    }

    res.json({ message: 'Transaksi berhasil diupdate', data: await transaksiModel.findById(req.params.id) });
  } catch (err) {
    console.error('[transaksi:update]', err);
    res.status(500).json({ error: 'Gagal update transaksi' });
  }
};

// ── PUT /api/v1/transaksi/:id/status ────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  const { error, value } = statusSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const t = await transaksiModel.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    if (t.status === 'dibatalkan')
      return res.status(400).json({ error: 'Transaksi sudah dibatalkan' });

    const extra = {};
    if (value.bayar !== undefined) {
      extra.bayar     = value.bayar;
      extra.kembalian = Math.max(0, value.bayar - t.total_bayar);
    }

    await transaksiModel.updateStatus(req.params.id, value.status, extra);

    const bayarFinal = extra.bayar ?? t.bayar;
    if (value.status === 'diambil' && bayarFinal >= t.total_bayar) {
      await svc.buatEntriKas({ ...t, bayar: bayarFinal, user_id: req.session.user.id });
    }

    res.json({ message: `Status diubah ke "${value.status}"`, data: await transaksiModel.findById(req.params.id) });
  } catch (err) {
    console.error('[transaksi:updateStatus]', err);
    res.status(500).json({ error: 'Gagal update status' });
  }
};
