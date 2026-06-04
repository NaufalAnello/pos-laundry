exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('kas', function (table) {
    table.increments('id').primary();
    table.date('tanggal').notNullable();
    table.string('jenis', 10).notNullable(); // masuk, keluar
    table.string('kategori', 50).defaultTo('lainnya'); // transaksi, bahan, operasional, dll
    table.text('keterangan');
    table.decimal('jumlah', 12, 2).notNullable();
    table.integer('transaksi_id').unsigned()
      .references('id').inTable('transaksi').onDelete('SET NULL');
    table.integer('user_id').unsigned()
      .references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('kas');
};
