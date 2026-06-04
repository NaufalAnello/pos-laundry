exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('wa_log', function (table) {
    table.increments('id').primary();
    table.string('telepon', 20).notNullable();
    table.text('pesan').notNullable();
    table.string('status', 20).defaultTo('pending'); // pending, terkirim, gagal
    table.integer('transaksi_id').unsigned()
      .references('id').inTable('transaksi').onDelete('SET NULL');
    table.text('response_api');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('wa_log');
};
