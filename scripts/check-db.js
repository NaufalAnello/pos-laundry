#!/usr/bin/env node

/**
 * Script untuk cek status database dan migration
 * Gunakan untuk troubleshooting "no such table" error
 */

require('dotenv').config();
const db = require('../src/database/connection');

async function checkDatabase() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Database Health Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Database path
    const dbPath = process.env.DB_PATH || './data/laundry.db';
    console.log(`📁 Database Path: ${dbPath}`);

    // 2. Migration status
    console.log('\n📋 Migration Status:');
    const migrations = await db.migrate.list();
    const [completed, pending] = migrations;

    console.log(`   Completed: ${completed.length}`);
    if (completed.length > 0) {
      console.log('   Latest:');
      completed.slice(-3).forEach(m => console.log(`     - ${m}`));
    }

    if (pending.length > 0) {
      console.log(`\n   ⚠️  Pending: ${pending.length}`);
      pending.forEach(m => console.log(`     - ${m}`));
      console.log('\n   Run: npm run migrate');
    }

    // 3. Critical tables
    console.log('\n🗂️  Critical Tables:');
    const criticalTables = [
      'users',
      'transaksi',
      'detail_transaksi',
      'biaya_tambahan',
      'riwayat_bayar',
      'pelanggan',
      'layanan',
      'mutasi_deposit'
    ];

    let allTablesExist = true;
    for (const table of criticalTables) {
      const exists = await db.schema.hasTable(table);
      const status = exists ? '✓' : '✗ MISSING';
      console.log(`   ${status} ${table}`);
      if (!exists) allTablesExist = false;
    }

    // 4. Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (allTablesExist && pending.length === 0) {
      console.log('✅ Database OK - Semua tabel ada & migration up-to-date');
    } else if (pending.length > 0) {
      console.log('⚠️  Migration Pending - Jalankan: npm run migrate');
    } else {
      console.log('❌ Missing Tables - Jalankan: npm run migrate');
      console.log('   Atau hapus database dan re-run migration:');
      console.log(`   rm ${dbPath} && npm run migrate && npm run seed`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(allTablesExist && pending.length === 0 ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

checkDatabase();
