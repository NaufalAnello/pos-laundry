exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('pengaturan', function (table) {
    table.increments('id').primary();
    table.string('kunci', 100).unique().notNullable();
    table.text('nilai');
    table.text('deskripsi');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('pengaturan');
};
