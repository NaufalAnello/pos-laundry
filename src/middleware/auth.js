const requireAuth = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu', redirect: '/login' });
  }
  next();
};

// Alias ke requireOwner supaya route lama yang import requireAdmin dari
// middleware/auth tetap jalan. Semantik: hanya owner yang boleh.
const requireAdmin = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu', redirect: '/login' });
  }
  if (req.session?.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });
  }
  next();
};

const requireOwner = requireAdmin;

module.exports = { requireAuth, requireAdmin, requireOwner };
