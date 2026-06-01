/**
 * Rate limiter in-memory sederhana — tanpa dependency eksternal (ramah ARM/single-instance).
 * Fixed-window per key (default: IP). Cocok untuk lindungi endpoint login dari brute-force.
 */
const createRateLimiter = ({ windowMs = 5 * 60 * 1000, max = 20, message } = {}) => {
  const hits = new Map(); // key -> { count, resetAt }

  // Bersihkan entri kedaluwarsa berkala (unref agar tidak menahan proses keluar)
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count++;

    if (rec.count > max) {
      const retrySec = Math.ceil((rec.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: message || `Terlalu banyak percobaan. Coba lagi dalam ${retrySec} detik.`
      });
    }
    next();
  };
};

module.exports = { createRateLimiter };
