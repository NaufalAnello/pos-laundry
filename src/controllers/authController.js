const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { findByUsername } = require('../models/userModel');

const SALT_ROUNDS = 12;

const loginSchema = Joi.object({
  username: Joi.string().min(3).max(50).required().messages({
    'string.min': 'Username minimal 3 karakter',
    'any.required': 'Username wajib diisi'
  }),
  password: Joi.string().min(1).required().messages({
    'any.required': 'Password wajib diisi'
  })
});

const login = async (req, res) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });
  }

  try {
    const user = await findByUsername(value.username);
    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const valid = await bcrypt.compare(value.password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    req.session.userId = user.id;
    req.session.user = {
      id:       user.id,
      nama:     user.nama,
      username: user.username,
      role:     user.role
    };

    return res.json({
      message: 'Login berhasil',
      user: req.session.user
    });
  } catch (err) {
    console.error('[auth:login]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[auth:logout]', err);
      return res.status(500).json({ error: 'Gagal logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logout berhasil' });
  });
};

const getMe = (req, res) => {
  return res.json({ user: req.session.user });
};

// Utility: hash password (dipakai controller lain saat buat/update user)
const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);

module.exports = { login, logout, getMe, hashPassword };
