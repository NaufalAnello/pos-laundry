require('dotenv').config();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = require('./src/app');
const db = require('./src/database/connection');
const PORT = process.env.PORT || 3000;

// ── Auto-migrate: Jalankan migration otomatis saat server start ───────────────
async function runMigrations() {
  try {
    console.log('🔄 Menjalankan database migrations...');
    const [batch, migrations] = await db.migrate.latest();

    if (migrations.length === 0) {
      console.log('✓ Database sudah up-to-date');
    } else {
      console.log(`✓ Berhasil menjalankan ${migrations.length} migration(s):`);
      migrations.forEach(m => console.log(`  - ${m}`));
    }
  } catch (err) {
    console.error('❌ Gagal menjalankan migrations:', err.message);
    console.error('   Server tetap berjalan, tapi beberapa fitur mungkin error.');
    // Tidak exit process, biar server tetap jalan untuk debugging
  }
}

// ── Start server dengan auto-migration ─────────────────────────────────────────
runMigrations().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ POS Laundry berjalan di port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Fatal error saat startup:', err);
  process.exit(1);
});
