const express = require('express');
const router = express.Router();
const { login, logout, getMe } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

// Maks 20 percobaan login / 5 menit / IP — cegah brute-force tanpa ganggu kasir
const loginLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max:      20,
  message:  'Terlalu banyak percobaan login. Silakan tunggu beberapa menit.'
});

router.post('/login',  loginLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me',      requireAuth, getMe);

module.exports = router;
