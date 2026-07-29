const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireOwner } = require('../middleware/role');

// AI Insight / Chat — analitik bisnis sensitif, khusus owner
router.use(requireOwner);

// POST /api/v1/ai/chat - Chat dengan AI Assistant
router.post('/chat', aiController.chat);

// GET /api/v1/ai/insight - Analitik otomatis
router.get('/insight', aiController.getInsight);

// GET /api/v1/ai/prediksi-sibuk - Prediksi hari & jam tersibuk (90 hari)
router.get('/prediksi-sibuk', aiController.getPrediksiSibuk);

// POST /api/v1/ai/test-connection - Test koneksi DeepSeek API
router.post('/test-connection', aiController.testConnection);

module.exports = router;
