// Migration idempotent: cek kolom dulu sebelum ALTER TABLE
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('mutasi_deposit', 'is_dibatalkan');
  if (!hasCol) {
    await knex.schema.table('mutasi_deposit', function (table) {
      table.boolean('is_dibatalkan').defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('mutasi_deposit', 'is_dibatalkan');
  if (hasCol) {
    await knex.schema.table('mutasi_deposit', function (table) {
      table.dropColumn('is_dibatalkan');
    });
  }
};
