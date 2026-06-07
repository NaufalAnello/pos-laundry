const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// POST /api/v1/ai/chat - Chat dengan AI Assistant
router.post('/chat', aiController.chat);

// GET /api/v1/ai/insight - Analitik otomatis
router.get('/insight', aiController.getInsight);

// POST /api/v1/ai/test-connection - Test koneksi DeepSeek API
router.post('/test-connection', aiController.testConnection);

module.exports = router;
