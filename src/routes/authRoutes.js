const express = require('express');
const router = express.Router();
const { login, logout, getMe } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/login',  login);
router.post('/logout', requireAuth, logout);
router.get('/me',      requireAuth, getMe);

module.exports = router;
