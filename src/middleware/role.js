// RBAC — dua role: owner (full access) & karyawan (operasional harian).
// Factory: hanya role yang disebutkan yang boleh lanjut
const requireRole = (...roles) => (req, res, next) => {
  const role = req.session?.user?.role;
  if (!role || !roles.includes(role)) {
    return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });
  }
  next();
};

const requireOwner = requireRole('owner');

// Alias untuk backward-compat dengan route lama yang masih import requireAdmin.
// (Semantik sama: hanya owner yang boleh — 'admin' lama sudah dipetakan ke 'owner'.)
const requireAdmin = requireOwner;

// Blokir DELETE untuk non-owner (diterapkan secara global di /api).
// Karyawan tidak boleh menghapus data apapun; kalau perlu, gunakan endpoint
// khusus yang eksplisit membolehkan (mis. soft-delete pelanggan) — tapi
// endpoint tersebut harus pakai POST/PUT, bukan DELETE.
const blockOperatorDelete = (req, res, next) => {
  if (req.method === 'DELETE' && req.session?.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });
  }
  next();
};

const blockOperatorAccess = (req, res, next) => {
  if (req.session?.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });
  }
  next();
};

module.exports = {
  requireRole,
  requireOwner,
  requireAdmin,        // backward-compat alias
  blockOperatorDelete,
  blockOperatorAccess
};
