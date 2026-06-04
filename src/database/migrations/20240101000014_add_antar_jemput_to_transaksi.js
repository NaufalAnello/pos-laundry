exports.up = async function(knex) {
  const hasAntarJemput = await knex.schema.hasColumn('transaksi', 'antar_jemput');
  if (!hasAntarJemput) {
    await knex.schema.table('transaksi', function(table) {
      table.boolean('antar_jemput').defaultTo(false).after('catatan');
    });
  }

  const hasAlamatJemput = await knex.schema.hasColumn('transaksi', 'alamat_jemput');
  if (!hasAlamatJemput) {
    await knex.schema.table('transaksi', function(table) {
      table.text('alamat_jemput').after('antar_jemput');
    });
  }
};

exports.down = function(knex) {
  return knex.schema.table('transaksi', function(table) {
    table.dropColumn('antar_jemput');
    table.dropColumn('alamat_jemput');
  });
};
