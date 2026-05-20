const Joi    = require('joi');
const db     = require('../database/connection');
const bcrypt = require('bcryptjs');

const SALT = 12;

const createSchema = Joi.object({
  nama:     Joi.string().max(100).required(),
  username: Joi.string().alphanum().min(3).max(50).required(),
  password: Joi.string().min(6).required(),
  role:     Joi.string().valid('admin', 'kasir', 'operator').default('kasir')
});

const updateSchema = Joi.object({
  nama:     Joi.string().max(100),
  username: Joi.string().alphanum().min(3).max(50),
  password: Joi.string().min(6).allow('', null),
  role:     Joi.string().valid('admin', 'kasir', 'operator'),
  aktif:    Joi.boolean()
}).min(1);

// ── GET /api/v1/users ─────────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const rows = await db('users').orderBy('nama').select('id', 'nama', 'username', 'role', 'aktif', 'created_at');
    res.json({ data: rows });
  } catch (err) {
    console.error('[users:index]', err);
    res.status(500).json({ error: 'Gagal mengambil data user' });
  }
};

// ── POST /api/v1/users ────────────────────────────────────────────────────────
exports.store = async (req, res) => {
  const { error, value } = createSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const exists = await db('users').where({ username: value.username }).first();
    if (exists) return res.status(400).json({ error: 'Username sudah digunakan' });

    const hashed = await bcrypt.hash(value.password, SALT);
    const [id]   = await db('users').insert({
      nama: value.nama, username: value.username, password: hashed,
      role: value.role, aktif: true, created_at: new Date(), updated_at: new Date()
    });

    const created = await db('users').where({ id }).select('id', 'nama', 'username', 'role', 'aktif').first();
    res.status(201).json({ message: 'User berhasil dibuat', data: created });
  } catch (err) {
    console.error('[users:store]', err);
    res.status(500).json({ error: 'Gagal membuat user' });
  }
};

// ── PUT /api/v1/users/:id ─────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    // Cannot deactivate yourself
    if ('aktif' in value && !value.aktif && Number(req.params.id) === req.session?.user?.id) {
      return res.status(400).json({ error: 'Tidak dapat menonaktifkan akun Anda sendiri' });
    }

    // Username uniqueness check
    if (value.username && value.username !== user.username) {
      const exists = await db('users').where({ username: value.username }).whereNot({ id: req.params.id }).first();
      if (exists) return res.status(400).json({ error: 'Username sudah digunakan' });
    }

    const patch = { updated_at: new Date() };
    if (value.nama)     patch.nama     = value.nama;
    if (value.username) patch.username = value.username;
    if (value.role)     patch.role     = value.role;
    if ('aktif' in value) patch.aktif  = value.aktif;
    if (value.password) patch.password = await bcrypt.hash(value.password, SALT);

    await db('users').where({ id: req.params.id }).update(patch);
    const updated = await db('users').where({ id: req.params.id }).select('id', 'nama', 'username', 'role', 'aktif').first();
    res.json({ message: 'User berhasil diperbarui', data: updated });
  } catch (err) {
    console.error('[users:update]', err);
    res.status(500).json({ error: 'Gagal memperbarui user' });
  }
};

// ── DELETE /api/v1/users/:id ──────────────────────────────────────────────────
exports.destroy = async (req, res) => {
  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    if (Number(req.params.id) === req.session?.user?.id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri' });
    }

    // Soft delete — nonaktifkan
    await db('users').where({ id: req.params.id }).update({ aktif: false, updated_at: new Date() });
    res.json({ message: 'User berhasil dinonaktifkan' });
  } catch (err) {
    console.error('[users:destroy]', err);
    res.status(500).json({ error: 'Gagal menghapus user' });
  }
};
