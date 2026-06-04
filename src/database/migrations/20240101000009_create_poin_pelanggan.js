exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('poin_pelanggan', function (table) {
    table.increments('id').primary();
    table.integer('pelanggan_id').unsigned().notNullable()
      .references('id').inTable('pelanggan').onDelete('CASCADE');
    table.integer('total_poin').defaultTo(0);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('poin_pelanggan');
};
