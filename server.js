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
    console.log(`   Database: ${process.env.DB_PATH || './data/laundry.db'}`);

    const [batch, migrations] = await db.migrate.latest();

    if (migrations.length === 0) {
      console.log('✓ Database sudah up-to-date');
    } else {
      console.log(`✓ Berhasil menjalankan ${migrations.length} migration(s):`);
      migrations.forEach(m => console.log(`  - ${m}`));
    }

    // Verifikasi tabel critical
    const hasBiayaTambahan = await db.schema.hasTable('biaya_tambahan');
    const hasRiwayatBayar = await db.schema.hasTable('riwayat_bayar');

    console.log('✓ Verifikasi tabel:');
    console.log(`  - biaya_tambahan: ${hasBiayaTambahan ? '✓' : '✗ MISSING'}`);
    console.log(`  - riwayat_bayar: ${hasRiwayatBayar ? '✓' : '✗ MISSING'}`);

    if (!hasBiayaTambahan || !hasRiwayatBayar) {
      console.error('⚠️  PERINGATAN: Beberapa tabel tidak ditemukan!');
      console.error('   Mencoba force re-run migration...');

      // Force rollback dan re-run migration terakhir
      try {
        await db.migrate.rollback();
        const [newBatch, newMigrations] = await db.migrate.latest();
        console.log(`✓ Force re-run berhasil: ${newMigrations.length} migration(s)`);
      } catch (retryErr) {
        console.error('❌ Force re-run gagal:', retryErr.message);
        console.error('   Solusi: Jalankan manual "npm run migrate" atau hapus data/laundry.db');
      }
    } else {
      console.log('✓ Database migration selesai');
    }
  } catch (err) {
    console.error('❌ Gagal menjalankan migrations:', err.message);
    console.error('   Stack:', err.stack);
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
