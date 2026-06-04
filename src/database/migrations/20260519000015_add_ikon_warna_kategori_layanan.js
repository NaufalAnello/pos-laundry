exports.up = async function(knex) {
  const hasIkon = await knex.schema.hasColumn('kategori_layanan', 'ikon');
  if (!hasIkon) {
    await knex.schema.table('kategori_layanan', function(table) {
      table.string('ikon', 50).defaultTo('category');
    });
  }

  const hasWarna = await knex.schema.hasColumn('kategori_layanan', 'warna');
  if (!hasWarna) {
    await knex.schema.table('kategori_layanan', function(table) {
      table.string('warna', 20).defaultTo('#6366f1');
    });
  }
};

exports.down = function(knex) {
  return knex.schema.table('kategori_layanan', function(table) {
    table.dropColumn('ikon');
    table.dropColumn('warna');
  });
};
