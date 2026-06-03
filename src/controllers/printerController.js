const transaksiModel = require('../models/transaksiModel');
const { getSettings, getPoinEarned } = require('../services/wa.service');
const { cekPrinter, cetakStruk, cetakTest, cetakLabel } = require('../services/printer.service');

// ── GET /api/v1/printer/status ────────────────────────────────────────────────
exports.status = async (req, res) => {
  try {
    const result = await cekPrinter();
    res.json(result);
  } catch (err) {
    console.error('[printer:status]', err);
    res.status(500).json({ connected: false, error: err.message });
  }
};

// ── POST /api/v1/printer/test ─────────────────────────────────────────────────
exports.test = async (req, res) => {
  try {
    await cetakTest();
    res.json({ success: true, message: 'Test print berhasil' });
  } catch (err) {
    console.error('[printer:test]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/v1/transaksi/:id/print ─────────────────────────────────────────
exports.cetakTransaksi = async (req, res) => {
  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    const [pengaturan, poinEarned] = await Promise.all([
      getSettings(),
      getPoinEarned(transaksi.id)
    ]);

    await cetakStruk(transaksi, pengaturan, poinEarned);
    res.json({ success: true, message: 'Struk berhasil dicetak' });
  } catch (err) {
    console.error('[printer:cetakTransaksi]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/v1/transaksi/:id/label ─────────────────────────────────────────
exports.cetakLabel = async (req, res) => {
  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    const pengaturan = await getSettings();

    await cetakLabel(transaksi, pengaturan);
    res.json({ success: true, message: 'Label berhasil dicetak' });
  } catch (err) {
    console.error('[printer:cetakLabel]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
