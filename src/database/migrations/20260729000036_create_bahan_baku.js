// Fitur manajemen stok bahan baku laundry (pemakaian otomatis dari volume order).
// Idempoten — pakai hasTable + createTable manual (bukan createTableIfNotExists
// yang tidak jalankan callback kalau tabel sudah ada, tapi tetap aman di re-run).
exports.up = async function (knex) {
  const hasBahanBaku = await knex.schema.hasTable('bahan_baku');
  if (!hasBahanBaku) {
    await knex.schema.createTable('bahan_baku', function (table) {
      table.increments('id').primary();
      table.string('nama', 100).notNullable();
      table.string('satuan', 20).notNullable();          // ml, liter, gram, kg, pcs
      table.decimal('stok_sekarang', 12, 2).defaultTo(0);
      table.decimal('batas_minimum', 12, 2).defaultTo(0);
      table.decimal('rasio_pemakaian', 10, 4).defaultTo(0);
      table.string('satuan_rasio', 20).defaultTo('per_kg'); // per_kg | per_pcs
      table.boolean('aktif').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  const hasMutasi = await knex.schema.hasTable('mutasi_stok_bahan');
  if (!hasMutasi) {
    await knex.schema.createTable('mutasi_stok_bahan', function (table) {
      table.increments('id').primary();
      table.integer('bahan_id').unsigned()
        .references('id').inTable('bahan_baku').notNullable();
      table.string('jenis', 30).notNullable(); // masuk | keluar_otomatis | keluar_manual | koreksi
      table.decimal('jumlah', 12, 2).notNullable();
      table.decimal('stok_sebelum', 12, 2).notNullable();
      table.decimal('stok_sesudah', 12, 2).notNullable();
      table.integer('transaksi_id').unsigned()
        .references('id').inTable('transaksi').nullable();
      table.string('keterangan', 255);
      table.integer('created_by').unsigned()
        .references('id').inTable('users').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_mutasi_stok_bahan_bahan_id ON mutasi_stok_bahan(bahan_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_mutasi_stok_bahan_transaksi_id ON mutasi_stok_bahan(transaksi_id)');
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('mutasi_stok_bahan');
  await knex.schema.dropTableIfExists('bahan_baku');
};
