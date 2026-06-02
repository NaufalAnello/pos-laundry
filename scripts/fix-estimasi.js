#!/usr/bin/env node
/**
 * Script untuk memperbaiki data estimasi_hari yang salah
 * Karena import dari CSV dengan kolom estimasi_jam tidak dikonversi dengan benar
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/laundry.db');
const db = new Database(dbPath);

console.log('🔧 Memperbaiki data estimasi_hari...\n');

// 1 hari (24 jam) - Express/Kilat/Instant
const layanan1Hari = [
  'Cuci', 'Cuci Lipat Prima',
  'Cuci Setrika Prima', 'Setrika Prima', 'Topi',
  'Baju Putih Ekspress', 'Cuci Lipat Instan',
  'Cuci Lipat Kilat', 'Cuci Setrika Instan',
  'Cuci Setrika Kilat', 'Setrika Instan', 'Setrika Kilat',
  'Baju Bayi Kilat', 'Hanger Dan Plastik',
  // Layanan existing di DB
  'Setrika Saja', 'Cuci Express Plus',
  'Express Cuci Kering', 'Express Cuci + Setrika'
];

// 2 hari (48 jam) - Reguler
const layanan2Hari = [
  'Cuci Kering',  // <-- dipindah ke sini
  'Cuci Lipat Reguler', 'Cuci Setrika Reguler',
  'Setrika Reguler', 'Putih Kiloan',
  // Layanan existing di DB
  'Cuci Basah', 'Cuci Sepatu',
  'Premium Wash', 'Setrika Premium'
];

// 3 hari (72 jam) - Heavy items / Spesial
// Semua yang tidak masuk kategori 1 hari atau 2 hari
const layanan3Hari = [
  // Layanan existing di DB
  'Cuci + Setrika', 'Cuci Selimut',
  'Cuci Gordyn', 'Cuci Tas',
  'Cuci Jas / Blazer', 'Dry Clean'
];

try {
  // Start transaction
  db.prepare('BEGIN').run();

  let totalUpdated = 0;

  // Update 1 hari
  if (layanan1Hari.length > 0) {
    const placeholders = layanan1Hari.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE layanan SET estimasi_hari = 1 WHERE nama IN (${placeholders})`);
    const result = stmt.run(...layanan1Hari);
    console.log(`✅ Update 1 hari: ${result.changes} layanan`);
    totalUpdated += result.changes;
  }

  // Update 2 hari
  if (layanan2Hari.length > 0) {
    const placeholders = layanan2Hari.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE layanan SET estimasi_hari = 2 WHERE nama IN (${placeholders})`);
    const result = stmt.run(...layanan2Hari);
    console.log(`✅ Update 2 hari: ${result.changes} layanan`);
    totalUpdated += result.changes;
  }

  // Update 3 hari
  if (layanan3Hari.length > 0) {
    const placeholders = layanan3Hari.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE layanan SET estimasi_hari = 3 WHERE nama IN (${placeholders})`);
    const result = stmt.run(...layanan3Hari);
    console.log(`✅ Update 3 hari (explicit): ${result.changes} layanan`);
    totalUpdated += result.changes;
  }

  // Update sisanya yang belum ter-update ke 3 hari (default untuk layanan berat)
  const allUpdated = [...layanan1Hari, ...layanan2Hari];
  if (allUpdated.length > 0) {
    const placeholders = allUpdated.map(() => '?').join(',');
    const stmt = db.prepare(`
      UPDATE layanan SET estimasi_hari = 3
      WHERE nama NOT IN (${placeholders})
      AND estimasi_hari = 2
    `);
    const result = stmt.run(...allUpdated);
    console.log(`✅ Update 3 hari (sisanya): ${result.changes} layanan`);
    totalUpdated += result.changes;
  }

  // Commit transaction
  db.prepare('COMMIT').run();

  console.log(`\n🎉 Selesai! Total ${totalUpdated} layanan diupdate`);

  // Show all results grouped by estimasi_hari
  console.log('\n📊 Data setelah update (grouped by estimasi):');
  const results = db.prepare(`
    SELECT estimasi_hari, GROUP_CONCAT(nama, ', ') as layanan_list, COUNT(*) as jumlah
    FROM layanan
    GROUP BY estimasi_hari
    ORDER BY estimasi_hari
  `).all();

  results.forEach(r => {
    console.log(`\n${r.estimasi_hari} hari (${r.jumlah} layanan):`);
    const names = r.layanan_list.split(', ');
    names.forEach(n => console.log(`  • ${n}`));
  });

} catch (error) {
  db.prepare('ROLLBACK').run();
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  db.close();
}
