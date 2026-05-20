exports.up = function (knex) {
  return knex.schema.createTable('stok_bahan', function (table) {
    table.increments('id').primary();
    table.string('nama', 100).notNullable();
    table.string('satuan', 20).defaultTo('pcs'); // liter, kg, pcs, botol
    table.decimal('stok_saat_ini', 10, 2).defaultTo(0);
    table.decimal('stok_minimum', 10, 2).defaultTo(0);
    table.decimal('harga_satuan', 12, 2).defaultTo(0);
    table.text('keterangan');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('stok_bahan');
};
