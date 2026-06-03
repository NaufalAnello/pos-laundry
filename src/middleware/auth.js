const requireAuth = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu', redirect: '/login' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu', redirect: '/login' });
  }
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya admin yang dapat menghapus order.' });
  }
  next();
};

module.exports = { requireAuth, requireAdmin };
