const Joi = require('joi');
const transaksiModel  = require('../models/transaksiModel');
const layananModel    = require('../models/layananModel');
const paketPromoModel = require('../models/paketPromoModel');
const pelangganModel  = require('../models/pelangganModel');
const svc             = require('../services/transaksiService');
const depositModel    = require('../models/deposit.model');
const riwayatBayarModel = require('../models/riwayatBayarModel');

// ── Validation schemas ───────────────────────────────────────────────────────
const itemSchema = Joi.object({
  layanan_id: Joi.number().integer().positive().required(),
  jumlah:     Joi.number().positive().required(),
  catatan:    Joi.string().allow('', null)
});

const createSchema = Joi.object({
  pelanggan_id:    Joi.number().integer().positive().allow(null),
  paket_promo_id:  Joi.number().integer().positive().allow(null),
  items:           Joi.array().items(itemSchema).min(1).required(),
  poin_digunakan:  Joi.number().integer().min(0).default(0),
  payment_mode:    Joi.string().valid('bayar-sekarang', 'dp', 'bayar-nanti').default('bayar-sekarang'),
  is_dp:           Joi.boolean().default(false),
  metode_bayar:    Joi.string().valid('tunai', 'transfer', 'qris', 'deposit').default('tunai'),
  bayar:           Joi.number().min(0).default(0),
  metode_kekurangan: Joi.string().valid('tunai', 'transfer', 'qris').allow(null),
  bayar_kekurangan:  Joi.number().min(0).allow(null),
  kelebihan_ke_deposit: Joi.boolean().default(false),
  catatan:         Joi.string().allow('', null),
  tanggal_selesai: Joi.date().iso().allow(null),
  antar_jemput:    Joi.boolean().default(false),
  alamat_jemput:   Joi.string().allow('', null),
  kirim_wa:        Joi.boolean().default(false),
  waktu_transaksi: Joi.date().iso().allow(null)  // Backdate feature
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

// ── GET /api/v1/transaksi/:id/detail ─────────────────────────────────────────
exports.detail = async (req, res) => {
  try {
    const t = await transaksiModel.findDetailById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json({ data: t });
  } catch (err) {
    console.error('[transaksi:detail]', err);
    res.status(500).json({ error: 'Gagal mengambil detail transaksi' });
  }
};

// ── POST /api/v1/transaksi ───────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = createSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    // Validasi waktu_transaksi: tidak boleh waktu masa depan
    if (value.waktu_transaksi) {
      const waktu = new Date(value.waktu_transaksi);
      if (waktu > new Date()) {
        return res.status(400).json({
          error: 'Waktu transaksi tidak boleh melebihi waktu saat ini'
        });
      }
    }

    const settings = await svc.getPoinSettings();

    // Resolve layanan + hitung subtotal per item
    const resolvedItems = [];
    const estimasiList  = []; // estimasi_hari per layanan (tidak disimpan di detail_transaksi)
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
      estimasiList.push(Number(layanan.estimasi_hari) || 2);
    }

    // Resolve promo
    let promo = null;
    if (value.paket_promo_id) {
      // Validasi termasuk periode & hari berlaku — cegah promo kedaluwarsa dipakai via ID
      promo = await paketPromoModel.findByIdValid(value.paket_promo_id);
      if (!promo) return res.status(400).json({ error: 'Paket promo tidak ditemukan, tidak aktif, atau di luar periode/hari berlaku' });
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

    // ── Deposit payment logic ───────────────────────────────────────────────
    let bayarFinal   = value.bayar;
    let kembalian    = 0;
    let metodeBayar  = value.metode_bayar;
    let depositInfo  = null; // { saldo_sebelum, saldo_sesudah }

    if (value.metode_bayar === 'deposit') {
      if (!pelanggan) {
        return res.status(400).json({ error: 'Pilih pelanggan untuk menggunakan deposit' });
      }
      const saldoRow = await depositModel.getSaldo(pelanggan.id);
      const saldo    = Number(saldoRow.saldo);

      if (saldo >= totalBayar) {
        // Saldo cukup — bayar penuh dengan deposit
        bayarFinal = totalBayar;
        kembalian  = 0;
      } else if (value.metode_kekurangan && value.bayar_kekurangan != null) {
        // Saldo tidak cukup — bayar sebagian deposit, sebagian metode lain
        // bayarFinal = deposit (saldo) + kekurangan
        bayarFinal  = saldo + Number(value.bayar_kekurangan);
        kembalian   = Math.max(0, bayarFinal - totalBayar);
        // Simpan info agar bisa dicatat di struk
        metodeBayar = 'deposit';
      } else {
        // Saldo tidak cukup tanpa kekurangan — tolak
        const kekurangan = totalBayar - saldo;
        return res.status(400).json({
          error:       `Saldo tidak cukup (Rp ${saldo.toLocaleString('id-ID')}). Kekurangan Rp ${kekurangan.toLocaleString('id-ID')}`,
          saldo,
          kekurangan
        });
      }
    } else {
      kembalian = Math.max(0, value.bayar - totalBayar);

      // Kelebihan bayar → masuk deposit
      if (
        kembalian > 0 &&
        value.kelebihan_ke_deposit &&
        pelanggan
      ) {
        // Kembalian akan masuk deposit, kembalian tunai = 0
        kembalian = 0;
      }
    }

    // Tentukan waktu mulai transaksi (backdate atau waktu sekarang)
    const waktuMasuk = value.waktu_transaksi
      ? new Date(value.waktu_transaksi)
      : new Date();

    // Hitung estimasi selesai dari estimasi_hari layanan terbesar (min 1 hari)
    // Gunakan setDate() untuk perhitungan yang benar (bukan getTime + ms)
    const maxHari = Math.max(...estimasiList, 1);
    let tanggalSelesai;
    if (value.tanggal_selesai) {
      tanggalSelesai = new Date(value.tanggal_selesai);
    } else {
      tanggalSelesai = new Date(waktuMasuk);
      tanggalSelesai.setDate(tanggalSelesai.getDate() + maxHari);
    }

    const nomor = await transaksiModel.generateNomor();
    const lunas = bayarFinal >= totalBayar && totalBayar > 0;

    const transaksiData = {
      nomor_transaksi: nomor,
      pelanggan_id:    value.pelanggan_id   || null,
      user_id:         req.session.user.id,
      paket_promo_id:  value.paket_promo_id || null,
      tanggal_masuk:   waktuMasuk,
      tanggal_selesai: tanggalSelesai,
      status:          'pending',
      total_harga:     totalHarga,
      diskon,
      poin_digunakan:  value.poin_digunakan,
      total_bayar:     totalBayar,
      bayar:           bayarFinal,
      total_dibayar:   bayarFinal,
      tanggal_lunas:   lunas ? new Date() : null,
      kembalian,
      metode_bayar:    metodeBayar,
      catatan:         value.catatan        || null,
      antar_jemput:    value.antar_jemput   ? 1 : 0,
      alamat_jemput:   value.alamat_jemput  || null,
      created_at:      new Date(),
      updated_at:      new Date()
    };

    const transaksiId = await transaksiModel.create(transaksiData, resolvedItems);
    const created = await transaksiModel.findById(transaksiId);

    // ── Catat riwayat pembayaran jika ada bayar awal ──────────────────────────
    if (bayarFinal > 0) {
      const jenis = value.is_dp || (bayarFinal < totalBayar) ? 'dp_awal' : 'pelunasan';
      const keterangan = jenis === 'dp_awal'
        ? `DP Awal (${metodeBayar})`
        : `Pembayaran Lunas (${metodeBayar})`;

      await riwayatBayarModel.create({
        transaksi_id: transaksiId,
        jenis,
        nominal: bayarFinal,
        metode: metodeBayar,
        kelebihan_ke_deposit: value.kelebihan_ke_deposit && kembalian > 0 ? kembalian : 0,
        created_by: req.session.user.id,
        keterangan,
        created_at: waktuMasuk
      });
    }

    // ── Side effects ────────────────────────────────────────────────────────
    if (pelanggan) {
      // Kurang poin yang digunakan
      if (value.poin_digunakan > 0) {
        await svc.upsertPoinPelanggan(
          pelanggan.id, -value.poin_digunakan, transaksiId,
          'kurang', `Tukar poin untuk ${nomor}`
        );
      }
      // Tambah poin dari transaksi — HANYA jika sudah lunas (sesuai spec)
      await svc.awardPoinJikaLunas(created, settings.perNominal);

      // ── Deposit: potong saldo jika bayar pakai deposit ──────────────────
      if (value.metode_bayar === 'deposit') {
        const saldoRow   = await depositModel.getSaldo(pelanggan.id);
        const saldo      = Number(saldoRow.saldo);
        const potongDepo = Math.min(saldo, totalBayar);
        depositInfo = await depositModel.bayar({
          pelangganId:  pelanggan.id,
          nominal:      potongDepo,
          transaksiId,
          createdBy:    req.session.user.id
        });

        // Cek saldo tipis setelah pemotongan
        const waService = require('../services/wa.service');
        await waService.cekNotifDepositTipis(pelanggan, depositInfo.saldoSesudah, transaksiId);
      }

      // ── Deposit: kelebihan bayar masuk deposit ──────────────────────────
      if (
        value.metode_bayar !== 'deposit' &&
        value.kelebihan_ke_deposit &&
        value.bayar > totalBayar
      ) {
        const kelebihan = value.bayar - totalBayar;
        await depositModel.tambahKelebihan({
          pelangganId:  pelanggan.id,
          nominal:      kelebihan,
          transaksiId,
          createdBy:    req.session.user.id
        });
        depositInfo = { kelebihan, jenis: 'kelebihan' };
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

    res.status(201).json({ message: 'Transaksi berhasil dibuat', data: created, deposit_info: depositInfo });
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
    const fresh = await transaksiModel.findById(req.params.id);

    // Buat kas + beri poin jika order menjadi lunas (idempotent — aman dipanggil ulang)
    if ((Number(fresh.bayar) || 0) >= Number(fresh.total_bayar) && Number(fresh.total_bayar) > 0) {
      const settings = await svc.getPoinSettings();
      await svc.buatEntriKas({ ...fresh, user_id: req.session.user.id });
      await svc.awardPoinJikaLunas(fresh, settings.perNominal);
    }

    res.json({ message: 'Transaksi berhasil diupdate', data: fresh });
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
    const fresh = await transaksiModel.findById(req.params.id);

    // Buat kas + beri poin jika lunas (idempotent). Tidak berlaku jika dibatalkan.
    if (value.status !== 'dibatalkan'
        && (Number(fresh.bayar) || 0) >= Number(fresh.total_bayar)
        && Number(fresh.total_bayar) > 0) {
      const settings = await svc.getPoinSettings();
      await svc.buatEntriKas({ ...fresh, user_id: req.session.user.id });
      await svc.awardPoinJikaLunas(fresh, settings.perNominal);
    }

    res.json({ message: `Status diubah ke "${value.status}"`, data: fresh });
  } catch (err) {
    console.error('[transaksi:updateStatus]', err);
    res.status(500).json({ error: 'Gagal update status' });
  }
};

// ── PUT /api/v1/transaksi/:id/lunasi ─────────────────────────────────────────
const lunasiSchema = Joi.object({
  metode_bayar: Joi.string().valid('tunai', 'transfer', 'qris', 'deposit').required(),
  nominal_diterima: Joi.number().min(0).required(),
  kelebihan_ke_deposit: Joi.boolean().default(false)
});

exports.lunasi = async (req, res) => {
  const { error, value } = lunasiSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const t = await transaksiModel.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    if (t.status === 'dibatalkan') {
      return res.status(400).json({ error: 'Transaksi sudah dibatalkan' });
    }

    const total = Number(t.total_bayar);
    const dibayar = Number(t.total_dibayar || t.bayar || 0);
    const sisa = Math.max(0, total - dibayar);

    if (sisa === 0) {
      return res.status(400).json({ error: 'Transaksi sudah lunas' });
    }

    if (value.nominal_diterima < sisa) {
      // Pembayaran sebagian (cicilan)
      const nominalBaru = dibayar + value.nominal_diterima;
      await transaksiModel.update(req.params.id, {
        bayar: nominalBaru,
        total_dibayar: nominalBaru
      });

      // Catat riwayat bayar
      await riwayatBayarModel.create({
        transaksi_id: req.params.id,
        jenis: 'dp_tambahan',
        nominal: value.nominal_diterima,
        metode: value.metode_bayar,
        kelebihan_ke_deposit: 0,
        created_by: req.session.user.id,
        keterangan: `Cicilan (${value.metode_bayar})`
      });

      const fresh = await transaksiModel.findById(req.params.id);
      return res.json({
        message: 'Pembayaran cicilan berhasil dicatat',
        data: fresh,
        lunas: false,
        sisa_bayar: total - nominalBaru
      });
    }

    // Pembayaran lunas atau lebih
    const kembalian = Math.max(0, value.nominal_diterima - sisa);
    let kelebihanKeDeposit = 0;
    let saldoDepositBaru = null;

    // Handle deposit payment
    if (value.metode_bayar === 'deposit') {
      const pelanggan = await pelangganModel.findById(t.pelanggan_id);
      if (!pelanggan) {
        return res.status(400).json({ error: 'Pelanggan tidak ditemukan' });
      }

      const saldoRow = await depositModel.getSaldo(pelanggan.id);
      const saldo = Number(saldoRow.saldo);

      if (saldo < sisa) {
        return res.status(400).json({
          error: `Saldo deposit tidak cukup. Saldo: Rp ${saldo.toLocaleString('id-ID')}, Sisa bayar: Rp ${sisa.toLocaleString('id-ID')}`
        });
      }

      // Potong deposit
      const depositInfo = await depositModel.bayar({
        pelangganId: pelanggan.id,
        nominal: sisa,
        transaksiId: req.params.id,
        createdBy: req.session.user.id
      });

      saldoDepositBaru = depositInfo.saldoSesudah;
    }

    // Handle kelebihan ke deposit
    if (kembalian > 0 && value.kelebihan_ke_deposit && t.pelanggan_id) {
      kelebihanKeDeposit = kembalian;
      await depositModel.tambahKelebihan({
        pelangganId: t.pelanggan_id,
        nominal: kembalian,
        transaksiId: req.params.id,
        createdBy: req.session.user.id
      });

      const saldoRow = await depositModel.getSaldo(t.pelanggan_id);
      saldoDepositBaru = Number(saldoRow.saldo);
    }

    // Update transaksi jadi lunas
    await transaksiModel.update(req.params.id, {
      bayar: total,
      total_dibayar: total,
      tanggal_lunas: new Date(),
      kembalian: kembalian > 0 && !value.kelebihan_ke_deposit ? kembalian : 0
    });

    // Catat riwayat bayar
    await riwayatBayarModel.create({
      transaksi_id: req.params.id,
      jenis: 'pelunasan',
      nominal: sisa,
      metode: value.metode_bayar,
      kelebihan_ke_deposit: kelebihanKeDeposit,
      created_by: req.session.user.id,
      keterangan: `Pelunasan (${value.metode_bayar})`
    });

    // Buat kas pemasukan
    const fresh = await transaksiModel.findById(req.params.id);
    await svc.buatEntriKas({ ...fresh, user_id: req.session.user.id });

    // Award poin jika belum
    const settings = await svc.getPoinSettings();
    await svc.awardPoinJikaLunas(fresh, settings.perNominal);

    res.json({
      message: 'Pembayaran berhasil, order lunas',
      data: fresh,
      lunas: true,
      kembalian: kembalian > 0 && !value.kelebihan_ke_deposit ? kembalian : 0,
      kelebihan_ke_deposit: kelebihanKeDeposit,
      saldo_deposit_baru: saldoDepositBaru
    });
  } catch (err) {
    console.error('[transaksi:lunasi]', err);
    res.status(500).json({ error: 'Gagal memproses pelunasan' });
  }
};

// ── DELETE /api/v1/transaksi/:id ─────────────────────────────────────────────
// Hard delete order - hanya untuk admin
exports.destroy = async (req, res) => {
  const db = require('../database/connection');

  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    const nomorOrder = transaksi.nomor_transaksi;

    // Hapus semua data terkait dalam satu transaction
    await db.transaction(async (trx) => {
      // Hapus riwayat bayar
      await trx('riwayat_bayar').where('transaksi_id', req.params.id).del();

      // Hapus detail transaksi
      await trx('detail_transaksi').where('transaksi_id', req.params.id).del();

      // Hapus wa_log terkait
      await trx('wa_log').where('transaksi_id', req.params.id).del();

      // Hapus kas terkait
      await trx('kas').where('transaksi_id', req.params.id).del();

      // Hapus mutasi deposit terkait (jika ada)
      await trx('mutasi_deposit').where('transaksi_id', req.params.id).del();

      // Hapus transaksi utama
      await trx('transaksi').where('id', req.params.id).del();
    });

    res.json({
      success: true,
      message: `Order ${nomorOrder} berhasil dihapus permanen`,
      nomor_order: nomorOrder
    });
  } catch (err) {
    console.error('[transaksi:destroy]', err);
    res.status(500).json({ error: 'Gagal menghapus order' });
  }
};
