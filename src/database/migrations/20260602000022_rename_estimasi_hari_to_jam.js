exports.up = function(knex) {
  return knex.schema.table('layanan', (table) => {
    table.renameColumn('estimasi_hari', 'estimasi_jam');
  }).then(() => {
    // Konversi data existing: hari → jam (1 hari = 24 jam)
    return knex.raw('UPDATE layanan SET estimasi_jam = estimasi_jam * 24');
  });
};

exports.down = function(knex) {
  return knex.raw('UPDATE layanan SET estimasi_jam = CAST(estimasi_jam / 24.0 AS INTEGER)')
    .then(() => {
      return knex.schema.table('layanan', (table) => {
        table.renameColumn('estimasi_jam', 'estimasi_hari');
      });
    });
};
