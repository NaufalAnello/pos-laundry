exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('users', function (table) {
    table.increments('id').primary();
    table.string('nama', 100).notNullable();
    table.string('username', 50).unique().notNullable();
    table.string('password').notNullable();
    table.string('role', 20).defaultTo('kasir'); // admin, kasir, operator
    table.boolean('aktif').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('users');
};
