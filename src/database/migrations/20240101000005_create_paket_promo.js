exports.up = function (knex) {
  return knex.schema.createTable('paket_promo', function (table) {
    table.increments('id').primary();
    table.string('nama', 100).notNullable();
    table.text('deskripsi');
    table.decimal('diskon_persen', 5, 2).defaultTo(0);
    table.decimal('diskon_nominal', 12, 2).defaultTo(0);
    table.decimal('min_pembelian', 12, 2).defaultTo(0);
    table.text('layanan_ids'); // JSON array ID layanan yang berlaku
    table.boolean('aktif').defaultTo(true);
    table.date('berlaku_mulai');
    table.date('berlaku_sampai');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('paket_promo');
};
