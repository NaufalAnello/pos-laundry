const Joi = require('joi');
const masterItemModel = require('../models/masterItemModel');

// ── Validation schemas ───────────────────────────────────────────────────────
const createSchema = Joi.object({
  nama:   Joi.string().required().max(100),
  satuan: Joi.string().valid('pcs', 'pasang', 'set').default('pcs')
});

const updateSchema = Joi.object({
  nama:   Joi.string().max(100),
  satuan: Joi.string().valid('pcs', 'pasang', 'set'),
  urutan: Joi.number().integer().min(0)
});

const reorderSchema = Joi.object({
  itemIds: Joi.array().items(Joi.number().integer().positive()).min(1).required()
});

// ── GET /api/v1/master-item ──────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const items = await masterItemModel.findAll();
    res.json({ data: items });
  } catch (err) {
    console.error('[master-item:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data master item' });
  }
};

// ── GET /api/v1/master-item/:id ──────────────────────────────────────────────
exports.show = async (req, res) => {
  try {
    const item = await masterItemModel.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json({ data: item });
  } catch (err) {
    console.error('[master-item:show]', err);
    res.status(500).json({ error: 'Gagal mengambil data item' });
  }
};

// ── POST /api/v1/master-item ─────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = createSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    // Cek duplikat nama (case-insensitive)
    const existing = await require('../database/connection')('master_item')
      .whereRaw('LOWER(nama) = LOWER(?)', [value.nama])
      .first();

    if (existing) {
      return res.status(400).json({ error: 'Nama item sudah ada' });
    }

    const id = await masterItemModel.create(value);
    const item = await masterItemModel.findById(id);
    res.status(201).json({ data: item, message: 'Master item berhasil ditambahkan' });
  } catch (err) {
    console.error('[master-item:store]', err);
    res.status(500).json({ error: 'Gagal menyimpan master item' });
  }
};

// ── PUT /api/v1/master-item/:id ──────────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const item = await masterItemModel.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });

    // Jika ada perubahan nama, cek duplikat
    if (value.nama && value.nama !== item.nama) {
      const existing = await require('../database/connection')('master_item')
        .whereRaw('LOWER(nama) = LOWER(?)', [value.nama])
        .whereNot('id', req.params.id)
        .first();

      if (existing) {
        return res.status(400).json({ error: 'Nama item sudah ada' });
      }
    }

    await masterItemModel.update(req.params.id, value);
    const updated = await masterItemModel.findById(req.params.id);
    res.json({ data: updated, message: 'Master item berhasil diperbarui' });
  } catch (err) {
    console.error('[master-item:update]', err);
    res.status(500).json({ error: 'Gagal memperbarui master item' });
  }
};

// ── DELETE /api/v1/master-item/:id ───────────────────────────────────────────
exports.destroy = async (req, res) => {
  try {
    const item = await masterItemModel.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan' });

    await masterItemModel.remove(req.params.id);
    res.json({ message: 'Master item berhasil dihapus' });
  } catch (err) {
    console.error('[master-item:destroy]', err);
    res.status(500).json({ error: 'Gagal menghapus master item' });
  }
};

// ── POST /api/v1/master-item/reorder ─────────────────────────────────────────
exports.reorder = async (req, res) => {
  const { error, value } = reorderSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    await masterItemModel.reorder(value.itemIds);
    res.json({ message: 'Urutan master item berhasil diperbarui' });
  } catch (err) {
    console.error('[master-item:reorder]', err);
    res.status(500).json({ error: 'Gagal mengubah urutan master item' });
  }
};

module.exports = exports;
