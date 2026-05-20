exports.up = function (knex) {
  return knex.schema.createTable('detail_transaksi', function (table) {
    table.increments('id').primary();
    table.integer('transaksi_id').unsigned().notNullable()
      .references('id').inTable('transaksi').onDelete('CASCADE');
    table.integer('layanan_id').unsigned()
      .references('id').inTable('layanan').onDelete('SET NULL');
    table.string('nama_layanan', 100); // snapshot nama layanan saat transaksi
    table.decimal('jumlah', 10, 2).notNullable();
    table.string('satuan', 20);
    table.decimal('harga_satuan', 12, 2).notNullable();
    table.decimal('subtotal', 12, 2).notNullable();
    table.text('catatan');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('detail_transaksi');
};
