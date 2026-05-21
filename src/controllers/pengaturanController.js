const Joi  = require('joi');
const db   = require('../database/connection');
const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/laundry.db');

// ── GET /api/v1/pengaturan ────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const rows = await db('pengaturan').orderBy('kunci');
    res.json({ data: Object.fromEntries(rows.map(r => [r.kunci, r.nilai ?? ''])) });
  } catch (err) {
    console.error('[pengaturan:getAll]', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan' });
  }
};

// ── PUT /api/v1/pengaturan ────────────────────────────────────────────────────
exports.updateBulk = async (req, res) => {
  const { error, value } = Joi.object({}).pattern(Joi.string(), Joi.string().allow('', null).max(5000))
    .min(1).validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    for (const [kunci, nilai] of Object.entries(value)) {
      const existing = await db('pengaturan').where({ kunci }).first();
      if (existing) {
        await db('pengaturan').where({ kunci }).update({ nilai: nilai ?? '', updated_at: new Date() });
      } else {
        await db('pengaturan').insert({
          kunci, nilai: nilai ?? '', deskripsi: '', created_at: new Date(), updated_at: new Date()
        });
      }
    }

    const rows = await db('pengaturan').orderBy('kunci');
    res.json({ message: 'Pengaturan berhasil disimpan', data: Object.fromEntries(rows.map(r => [r.kunci, r.nilai ?? ''])) });
  } catch (err) {
    console.error('[pengaturan:updateBulk]', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan' });
  }
};

// ── GET /api/v1/pengaturan/wa-mode ───────────────────────────────────────────
exports.getWAMode = async (req, res) => {
  try {
    const row = await db('pengaturan').where({ kunci: 'wa_mode_default' }).first();
    if (!row) {
      // fallback to legacy key
      const legacy = await db('pengaturan').where({ kunci: 'wa_mode' }).first();
      return res.json({ wa_mode: legacy?.nilai || 'business' });
    }
    res.json({ wa_mode: row.nilai || 'business' });
  } catch (err) {
    console.error('[pengaturan:getWAMode]', err);
    res.status(500).json({ error: 'Gagal mengambil mode WA' });
  }
};

// ── PUT /api/v1/pengaturan/wa-mode ────────────────────────────────────────────
exports.updateWAMode = async (req, res) => {
  const { mode } = req.body;
  if (!['regular', 'business'].includes(mode)) {
    return res.status(400).json({ error: 'Mode tidak valid. Gunakan "regular" atau "business"' });
  }
  try {
    const existing = await db('pengaturan').where({ kunci: 'wa_mode_default' }).first();
    if (existing) {
      await db('pengaturan').where({ kunci: 'wa_mode_default' }).update({ nilai: mode, updated_at: new Date() });
    } else {
      await db('pengaturan').insert({
        kunci: 'wa_mode_default', nilai: mode, deskripsi: 'Mode WhatsApp default (regular/business)',
        created_at: new Date(), updated_at: new Date()
      });
    }
    res.json({ message: 'Mode WA berhasil disimpan', wa_mode: mode });
  } catch (err) {
    console.error('[pengaturan:updateWAMode]', err);
    res.status(500).json({ error: 'Gagal menyimpan mode WA' });
  }
};

// ── GET /api/v1/pengaturan/backup ─────────────────────────────────────────────
exports.backup = (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: 'File database tidak ditemukan' });
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename  = `backup-laundry-${timestamp}.db`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fs.statSync(DB_PATH).size);

    const stream = fs.createReadStream(DB_PATH);
    stream.pipe(res);
    stream.on('error', (e) => { console.error('[backup:stream]', e); res.destroy(); });
  } catch (err) {
    console.error('[pengaturan:backup]', err);
    res.status(500).json({ error: 'Gagal membuat backup' });
  }
};

// ── POST /api/v1/pengaturan/restore ──────────────────────────────────────────
exports.restore = (req, res) => {
  try {
    const buf = req.body; // express.raw() puts Buffer here
    if (!buf || buf.length < 16) {
      return res.status(400).json({ error: 'File tidak valid atau kosong' });
    }

    // Validate SQLite magic bytes "SQLite format 3\0"
    const magic = buf.slice(0, 15).toString('utf8');
    if (!magic.startsWith('SQLite format 3')) {
      return res.status(400).json({ error: 'File bukan SQLite database yang valid' });
    }

    // Write to restore staging path
    const restorePath = DB_PATH + '.restore';
    fs.writeFileSync(restorePath, buf);

    res.json({
      message: 'File backup diterima dan disimpan. Restart server untuk menerapkan restore.',
      path: restorePath,
      note: 'Hentikan server → rename laundry.db.restore ke laundry.db → jalankan ulang server'
    });
  } catch (err) {
    console.error('[pengaturan:restore]', err);
    res.status(500).json({ error: 'Gagal memproses restore' });
  }
};
