exports.up = async function(knex) {
  await knex.schema.createTableIfNotExists('biaya_tambahan', (table) => {
    table.increments('id').primary();
    table.integer('transaksi_id').notNullable()
      .references('id').inTable('transaksi').onDelete('CASCADE');
    table.string('keterangan').notNullable();
    table.decimal('nominal', 10, 2).notNullable();
    table.integer('created_by')
      .references('id').inTable('users').onDelete('SET NULL');
    table.datetime('created_at').defaultTo(knex.fn.now());

    table.index('transaksi_id');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('biaya_tambahan');
};
