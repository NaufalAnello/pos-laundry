exports.up = function (knex) {
  return knex.schema.table('kategori_layanan', function (table) {
    table.string('ikon', 50).defaultTo('category');
    table.string('warna', 20).defaultTo('#6366f1');
  });
};

exports.down = function (knex) {
  return knex.schema.table('kategori_layanan', function (table) {
    table.dropColumn('ikon');
    table.dropColumn('warna');
  });
};
