const Joi = require('joi');
const biayaTambahanModel = require('../models/biayaTambahanModel');
const transaksiModel = require('../models/transaksiModel');
const db = require('../database/connection');

// ── Validation schema ─────────────────────────────────────────────────────────
const biayaSchema = Joi.object({
  keterangan: Joi.string().required(),
  nominal:    Joi.number().min(0).required()
});

// ── Helper: Recalculate total transaksi dengan biaya tambahan ────────────────
async function recalculateTransaksiWithBiaya(trx, transaksiId) {
  // Ambil transaksi
  const transaksi = await trx('transaksi').where('id', transaksiId).first();
  if (!transaksi) throw new Error('Transaksi tidak ditemukan');

  // Hitung total dari item layanan
  const items = await trx('detail_transaksi').where('transaksi_id', transaksiId);
  const totalItem = items.reduce((sum, it) => sum + Number(it.subtotal), 0);

  // Hitung total biaya tambahan
  const biayaList = await trx('biaya_tambahan').where('transaksi_id', transaksiId);
  const totalBiaya = biayaList.reduce((sum, b) => sum + Number(b.nominal), 0);

  // Total harga = total item + total biaya tambahan
  const totalHarga = totalItem + totalBiaya;

  // Recalculate total_bayar (dengan diskon & poin yang ada)
  const svc = require('../services/transaksiService');
  const settings = await svc.getPoinSettings();
  const { totalBayar } = svc.hitungTotal(
    items,
    transaksi.paket_promo_id ? { diskon_nominal: transaksi.diskon } : null,
    transaksi.poin_digunakan || 0,
    settings.nilaiPerPoin
  );

  // Tambahkan biaya tambahan ke total_bayar
  const totalBayarFinal = totalBayar + totalBiaya;

  // Update transaksi
  await trx('transaksi')
    .where('id', transaksiId)
    .update({
      total_harga: totalHarga,
      total_bayar: totalBayarFinal,
      updated_at:  new Date()
    });

  return { totalHarga, totalBayarFinal };
}

// ── GET /api/v1/transaksi/:id/biaya-tambahan ─────────────────────────────────
exports.index = async (req, res) => {
  try {
    const data = await biayaTambahanModel.findByTransaksiId(req.params.id);
    res.json({ data });
  } catch (err) {
    console.error('[biayaTambahan:index]', err);
    res.status(500).json({ error: 'Gagal mengambil biaya tambahan' });
  }
};

// ── POST /api/v1/transaksi/:id/biaya-tambahan ────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = biayaSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    // Validasi status harus pending atau proses
    if (!['pending', 'proses'].includes(transaksi.status)) {
      return res.status(400).json({
        error: 'Hanya order dengan status pending atau proses yang bisa ditambah biaya'
      });
    }

    await db.transaction(async (trx) => {
      // Insert biaya tambahan
      await trx('biaya_tambahan').insert({
        transaksi_id: req.params.id,
        keterangan:   value.keterangan,
        nominal:      value.nominal,
        created_by:   req.session.user?.id || null,
        created_at:   new Date()
      });

      // Recalculate total
      await recalculateTransaksiWithBiaya(trx, req.params.id);
    });

    // Return data updated
    const updated = await transaksiModel.findDetailById(req.params.id);
    res.json({ message: 'Biaya tambahan berhasil ditambahkan', data: updated });
  } catch (err) {
    console.error('[biayaTambahan:store]', err);
    res.status(500).json({ error: 'Gagal menambah biaya tambahan' });
  }
};

// ── PUT /api/v1/transaksi/:id/biaya-tambahan/:biaya_id ───────────────────────
exports.update = async (req, res) => {
  const { error, value } = biayaSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    if (!['pending', 'proses'].includes(transaksi.status)) {
      return res.status(400).json({
        error: 'Hanya order dengan status pending atau proses yang bisa diedit'
      });
    }

    // Cek biaya ada
    const biaya = await biayaTambahanModel.findById(req.params.biaya_id);
    if (!biaya || biaya.transaksi_id != req.params.id) {
      return res.status(404).json({ error: 'Biaya tambahan tidak ditemukan' });
    }

    await db.transaction(async (trx) => {
      // Update biaya
      await trx('biaya_tambahan')
        .where('id', req.params.biaya_id)
        .update({
          keterangan: value.keterangan,
          nominal:    value.nominal
        });

      // Recalculate total
      await recalculateTransaksiWithBiaya(trx, req.params.id);
    });

    const updated = await transaksiModel.findDetailById(req.params.id);
    res.json({ message: 'Biaya tambahan berhasil diupdate', data: updated });
  } catch (err) {
    console.error('[biayaTambahan:update]', err);
    res.status(500).json({ error: 'Gagal mengupdate biaya tambahan' });
  }
};

// ── DELETE /api/v1/transaksi/:id/biaya-tambahan/:biaya_id ────────────────────
exports.destroy = async (req, res) => {
  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    if (!['pending', 'proses'].includes(transaksi.status)) {
      return res.status(400).json({
        error: 'Hanya order dengan status pending atau proses yang bisa diedit'
      });
    }

    // Cek biaya ada
    const biaya = await biayaTambahanModel.findById(req.params.biaya_id);
    if (!biaya || biaya.transaksi_id != req.params.id) {
      return res.status(404).json({ error: 'Biaya tambahan tidak ditemukan' });
    }

    await db.transaction(async (trx) => {
      // Hapus biaya
      await trx('biaya_tambahan').where('id', req.params.biaya_id).del();

      // Recalculate total
      await recalculateTransaksiWithBiaya(trx, req.params.id);
    });

    const updated = await transaksiModel.findDetailById(req.params.id);
    res.json({ message: 'Biaya tambahan berhasil dihapus', data: updated });
  } catch (err) {
    console.error('[biayaTambahan:destroy]', err);
    res.status(500).json({ error: 'Gagal menghapus biaya tambahan' });
  }
};


