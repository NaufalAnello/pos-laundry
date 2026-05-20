exports.up = function (knex) {
  return knex.schema.createTable('transaksi', function (table) {
    table.increments('id').primary();
    table.string('nomor_transaksi', 50).unique().notNullable();
    table.integer('pelanggan_id').unsigned()
      .references('id').inTable('pelanggan').onDelete('SET NULL');
    table.integer('user_id').unsigned()
      .references('id').inTable('users').onDelete('SET NULL');
    table.integer('paket_promo_id').unsigned()
      .references('id').inTable('paket_promo').onDelete('SET NULL');
    table.timestamp('tanggal_masuk').defaultTo(knex.fn.now());
    table.timestamp('tanggal_selesai'); // estimasi selesai
    table.timestamp('tanggal_ambil');   // waktu diambil pelanggan
    table.string('status', 20).defaultTo('pending'); // pending, proses, selesai, diambil, dibatalkan
    table.decimal('total_harga', 12, 2).defaultTo(0);
    table.decimal('diskon', 12, 2).defaultTo(0);
    table.integer('poin_digunakan').defaultTo(0);
    table.decimal('total_bayar', 12, 2).defaultTo(0);
    table.decimal('bayar', 12, 2).defaultTo(0);
    table.decimal('kembalian', 12, 2).defaultTo(0);
    table.string('metode_bayar', 30).defaultTo('tunai'); // tunai, transfer, qris
    table.text('catatan');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('transaksi');
};
