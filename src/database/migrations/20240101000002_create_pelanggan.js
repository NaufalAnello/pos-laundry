exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('pelanggan', function (table) {
    table.increments('id').primary();
    table.string('nama', 100).notNullable();
    table.string('telepon', 20);
    table.text('alamat');
    table.string('email', 100);
    table.integer('total_poin').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('pelanggan');
};
