exports.up = async function(knex) {
  const hasJenis = await knex.schema.hasColumn('wa_log', 'jenis');
  if (!hasJenis) {
    await knex.schema.alterTable('wa_log', function(table) {
      table.string('jenis', 30).defaultTo('nota'); // nota, tagihan, selesai, broadcast, deposit_tipis
    });
  }

  const hasUrl = await knex.schema.hasColumn('wa_log', 'url');
  if (!hasUrl) {
    await knex.schema.alterTable('wa_log', function(table) {
      table.text('url'); // URL wa.me yang sudah di-generate
    });
  }
};

exports.down = function(knex) {
  return knex.schema.alterTable('wa_log', function(table) {
    table.dropColumn('jenis');
    table.dropColumn('url');
  });
};
