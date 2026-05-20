const requireAuth = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu', redirect: '/login' });
  }
  next();
};

module.exports = { requireAuth };
