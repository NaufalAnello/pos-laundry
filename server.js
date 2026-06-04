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

    // Step 1: Jalankan migration
    const [batch, migrations] = await db.migrate.latest();

    if (migrations.length === 0) {
      console.log('✓ Database sudah up-to-date');
    } else {
      console.log(`✓ Berhasil menjalankan ${migrations.length} migration(s):`);
      migrations.forEach(m => console.log(`  - ${m}`));
    }

    // Step 2: Verifikasi tabel critical
    let hasBiayaTambahan = await db.schema.hasTable('biaya_tambahan');
    let hasRiwayatBayar = await db.schema.hasTable('riwayat_bayar');

    console.log('✓ Verifikasi tabel:');
    console.log(`  - biaya_tambahan: ${hasBiayaTambahan ? '✓' : '✗ MISSING'}`);
    console.log(`  - riwayat_bayar: ${hasRiwayatBayar ? '✓' : '✗ MISSING'}`);

    // Step 3: Force re-run jika tabel tidak ada
    if (!hasBiayaTambahan || !hasRiwayatBayar) {
      console.error('⚠️  PERINGATAN: Beberapa tabel tidak ditemukan!');
      console.error('   Mencoba force re-run migration...');

      try {
        await db.migrate.rollback();
        const [newBatch, newMigrations] = await db.migrate.latest();
        console.log(`✓ Force re-run berhasil: ${newMigrations.length} migration(s)`);

        // Verifikasi ulang setelah re-run
        hasBiayaTambahan = await db.schema.hasTable('biaya_tambahan');
        hasRiwayatBayar = await db.schema.hasTable('riwayat_bayar');

        console.log('✓ Verifikasi ulang:');
        console.log(`  - biaya_tambahan: ${hasBiayaTambahan ? '✓' : '✗ STILL MISSING'}`);
        console.log(`  - riwayat_bayar: ${hasRiwayatBayar ? '✓' : '✗ STILL MISSING'}`);

        if (!hasBiayaTambahan || !hasRiwayatBayar) {
          throw new Error('Tabel masih tidak ada setelah force re-run');
        }
      } catch (retryErr) {
        console.error('❌ Force re-run gagal:', retryErr.message);
        console.error('   Solusi: Jalankan manual "npm run migrate" atau hapus data/laundry.db');
        throw retryErr; // Throw error agar server tidak start
      }
    }

    console.log('✓ Database migration selesai - Server siap dijalankan');
  } catch (err) {
    console.error('❌ FATAL: Gagal menjalankan migrations:', err.message);
    console.error('   Stack:', err.stack);
    console.error('   Server TIDAK BISA START karena database tidak siap.');
    throw err; // Throw error untuk stop server startup
  }
}

// ── Start server dengan auto-migration ─────────────────────────────────────────
async function startServer() {
  try {
    // STEP 1: Tunggu sampai migration selesai
    await runMigrations();

    // STEP 2: Baru jalankan server setelah database siap
    app.listen(PORT, '0.0.0.0', () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ POS Laundry berjalan di port ${PORT}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (err) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ FATAL: Server tidak bisa start');
    console.error('   Alasan:', err.message);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

startServer();
