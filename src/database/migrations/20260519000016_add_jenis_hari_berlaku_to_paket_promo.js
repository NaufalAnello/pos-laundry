exports.up = function (knex) {
  return knex.schema.table('paket_promo', function (table) {
    table.string('jenis', 20).defaultTo('persen'); // persen | nominal | paket
    table.string('hari_berlaku', 50);               // JSON array hari [0..6], null = semua hari
  });
};

exports.down = function (knex) {
  return knex.schema.table('paket_promo', function (table) {
    table.dropColumn('jenis');
    table.dropColumn('hari_berlaku');
  });
};
