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
// Lapis pertahanan tambahan: kalau client mengirim `expected_nomor_transaksi`,
// backend memvalidasi bahwa nomor transaksi yang ada di DB untuk :id yg diminta
// benar-benar cocok dengan yang di-tampilkan di layar client. Kalau operator
// (atau bug client) somehow mengirim id ≠ order yang tampak di layar, request
// ditolak 409 Conflict — mencegah "label tertukar" dari sisi manapun.
exports.cetakLabel = async (req, res) => {
  try {
    const transaksi = await transaksiModel.findById(req.params.id);
    if (!transaksi) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });

    const { layanan_ids, expected_nomor_transaksi } = req.body;

    if (expected_nomor_transaksi && String(transaksi.nomor_transaksi) !== String(expected_nomor_transaksi)) {
      return res.status(409).json({
        error: `Order tidak cocok: yang tampil "${expected_nomor_transaksi}" tapi id ${req.params.id} = "${transaksi.nomor_transaksi}". Reload halaman lalu coba lagi.`,
        expected_nomor_transaksi,
        actual_nomor_transaksi: transaksi.nomor_transaksi
      });
    }

    // Validasi layanan_ids benar-benar milik order ini (defense in depth)
    if (Array.isArray(layanan_ids) && layanan_ids.length > 0) {
      const ownIds = new Set((transaksi.items || []).map(it => it.id));
      const strayIds = layanan_ids.filter(id => !ownIds.has(Number(id)));
      if (strayIds.length > 0) {
        return res.status(409).json({
          error: `Layanan ${strayIds.join(', ')} bukan milik order ${transaksi.nomor_transaksi}. Reload halaman lalu coba lagi.`,
          stray_layanan_ids: strayIds
        });
      }
    }

    const pengaturan = await getSettings();
    await cetakLabel(transaksi, pengaturan, layanan_ids);
    res.json({ success: true, message: 'Label berhasil dicetak' });
  } catch (err) {
    console.error('[printer:cetakLabel]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
