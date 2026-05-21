exports.up = function (knex) {
  return knex.schema.alterTable('wa_log', function (table) {
    table.string('jenis', 30).defaultTo('nota');  // nota, tagihan, selesai, broadcast, deposit_tipis
    table.text('url');                             // URL wa.me yang sudah di-generate
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('wa_log', function (table) {
    table.dropColumn('jenis');
    table.dropColumn('url');
  });
};
