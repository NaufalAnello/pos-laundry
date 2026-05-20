// Factory: hanya role yang disebutkan yang boleh lanjut
const requireRole = (...roles) => (req, res, next) => {
  const role = req.session?.user?.role;
  if (!role || !roles.includes(role)) {
    return res.status(403).json({ error: 'Akses ditolak. Anda tidak memiliki izin.' });
  }
  next();
};

const requireAdmin = requireRole('admin');

// Blokir DELETE untuk non-admin (diterapkan secara global di /api)
const blockOperatorDelete = (req, res, next) => {
  if (req.method === 'DELETE' && req.session?.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya admin yang dapat menghapus data.' });
  }
  next();
};

// Blokir non-admin dari mengakses rute tertentu (misal: manajemen user)
const blockOperatorAccess = (req, res, next) => {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Fitur ini khusus admin.' });
  }
  next();
};

module.exports = { requireRole, requireAdmin, blockOperatorDelete, blockOperatorAccess };
