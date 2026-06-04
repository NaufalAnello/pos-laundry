exports.up = async function (knex) {
  await knex.schema.table('mutasi_deposit', function (table) {
    table.boolean('is_dibatalkan').defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.table('mutasi_deposit', function (table) {
    table.dropColumn('is_dibatalkan');
  });
};
