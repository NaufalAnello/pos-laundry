const express = require('express');
const cors = require('cors');
const session = require('express-session');
const KnexSessionStore = require('connect-session-knex')(session);
const path = require('path');
const db = require('./database/connection');

const { requireAuth } = require('./middleware/auth');
const { blockOperatorDelete } = require('./middleware/role');
const authRoutes      = require('./routes/authRoutes');
const transaksiRoutes = require('./routes/transaksiRoutes');
const supportRoutes   = require('./routes/supportRoutes');
const waRoutes        = require('./routes/waRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const layananRoutes   = require('./routes/layananRoutes');
const kasRoutes       = require('./routes/kasRoutes');
const promoRoutes     = require('./routes/promoRoutes');
const poinRoutes        = require('./routes/poinRoutes');
const pelangganRoutes   = require('./routes/pelangganRoutes');
const laporanRoutes     = require('./routes/laporanRoutes');
const pengaturanRoutes  = require('./routes/pengaturanRoutes');
const usersRoutes       = require('./routes/usersRoutes');
const printerRoutes     = require('./routes/printerRoutes');
const depositRoutes     = require('./routes/depositRoutes');

const app = express();

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets — CSS, JS, images (tidak perlu auth)
app.use('/css',    express.static(path.join(__dirname, '../public/css')));
app.use('/js',     express.static(path.join(__dirname, '../public/js')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// ── Session ────────────────────────────────────────────────────────────────────
app.use(session({
  store: new KnexSessionStore({
    knex:        db,
    tablename:   'sessions',
    createtable: true
  }),
  secret:            process.env.SESSION_SECRET || 'dev-secret-ganti-di-production',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,
    httpOnly: true,
    maxAge:   24 * 60 * 60 * 1000  // 24 jam
  }
}));

// ── API Routes ─────────────────────────────────────────────────────────────────

// Health check — tanpa auth, dipakai Docker HEALTHCHECK
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok' }));

// Auth — TIDAK memerlukan sesi aktif
app.use('/api/v1/auth', authRoutes);

// Semua /api/* selain auth → wajib login
app.use('/api', requireAuth);

// Non-admin tidak bisa DELETE di seluruh /api/*
app.use('/api', blockOperatorDelete);

// Dashboard
app.use('/api/v1/dashboard', dashboardRoutes);

// Transaksi CRUD
app.use('/api/v1/transaksi', transaksiRoutes);

// Layanan & Kategori CRUD (harus sebelum supportRoutes agar /layanan/all tidak masuk /layanan)
app.use('/api/v1', layananRoutes);

// Pelanggan CRUD (harus sebelum supportRoutes yang juga handle /pelanggan search)
app.use('/api/v1/pelanggan', pelangganRoutes);

// Pengaturan (harus sebelum supportRoutes yang juga punya GET /pengaturan)
app.use('/api/v1/pengaturan', pengaturanRoutes);

// Lookup data (layanan aktif, promo — pelanggan & pengaturan sudah ditangani di atas)
app.use('/api/v1', supportRoutes);

// WA log
app.use('/api/v1/wa', waRoutes);

// Kas
app.use('/api/v1/kas', kasRoutes);

// Promo CRUD
app.use('/api/v1/promo', promoRoutes);

// Poin
app.use('/api/v1/poin', poinRoutes);

// Laporan
app.use('/api/v1/laporan', laporanRoutes);

// Users (admin only)
app.use('/api/v1/users', usersRoutes);

// Printer thermal
app.use('/api/v1/printer', printerRoutes);

// Deposit pelanggan
app.use('/api/v1/deposit', depositRoutes);

// ── Web page routes ────────────────────────────────────────────────────────────

// Halaman login
app.get('/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../public/pages/login.html'));
});

// Dashboard
app.get('/', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/dashboard.html'));
});

// Halaman order baru
app.get('/order/baru', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/order.html'));
});

// Kelola order
app.get('/order', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/orders.html'));
});

// Layanan & Kategori
app.get('/layanan', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/layanan.html'));
});

// Buku Kas
app.get('/kas', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/kas.html'));
});

// Promo
app.get('/promo', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/promo.html'));
});

// Poin Pelanggan
app.get('/poin', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/poin.html'));
});

// Pelanggan
app.get('/pelanggan', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/pelanggan.html'));
});

// Laporan
app.get('/laporan', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/laporan.html'));
});

// Preview WA
app.get('/wa-preview', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/wa-preview.html'));
});

// Pusat WA
app.get('/wa-center', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/wa-center.html'));
});

// Pengaturan
app.get('/pengaturan', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/pengaturan.html'));
});

// Deposit
app.get('/deposit', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, '../public/pages/deposit.html'));
});

// Semua route web lain → redirect ke dashboard
app.get('*', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.redirect('/');
});

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
  res.status(500).send('Server Error');
});

module.exports = app;
