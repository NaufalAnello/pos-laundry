exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('riwayat_poin', function (table) {
    table.increments('id').primary();
    table.integer('pelanggan_id').unsigned()
      .references('id').inTable('pelanggan').onDelete('CASCADE');
    table.integer('transaksi_id').unsigned()
      .references('id').inTable('transaksi').onDelete('SET NULL');
    table.string('jenis', 10).notNullable(); // tambah, kurang
    table.integer('jumlah_poin').notNullable();
    table.text('keterangan');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('riwayat_poin');
};
