exports.up = function (knex) {
  return knex.schema.table('transaksi', function (table) {
    table.boolean('antar_jemput').defaultTo(false).after('catatan');
    table.text('alamat_jemput').after('antar_jemput');
  });
};

exports.down = function (knex) {
  return knex.schema.table('transaksi', function (table) {
    table.dropColumn('antar_jemput');
    table.dropColumn('alamat_jemput');
  });
};
