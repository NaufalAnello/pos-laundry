exports.up = function (knex) {
  return knex.schema.table('transaksi', function (table) {
    table.string('diskon_tipe', 20).defaultTo('nominal');
    table.decimal('diskon_persen', 5, 2).defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.table('transaksi', function (table) {
    table.dropColumn('diskon_tipe');
    table.dropColumn('diskon_persen');
  });
};
