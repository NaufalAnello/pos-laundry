exports.up = async function(knex) {
  await knex.schema.createTableIfNotExists('riwayat_bayar', (table) => {
    table.increments('id').primary();
    table.integer('transaksi_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('transaksi')
      .onDelete('CASCADE');
    table.enum('jenis', ['dp_awal', 'pelunasan', 'dp_tambahan', 'koreksi'])
      .notNullable()
      .defaultTo('pelunasan');
    table.decimal('nominal', 12, 2).notNullable();
    table.string('metode', 20).notNullable();
    table.decimal('kelebihan_ke_deposit', 12, 2).defaultTo(0);
    table.integer('created_by')
      .unsigned()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('keterangan', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('transaksi_id');
    table.index('created_at');
  });

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
  await knex.schema.dropTableIfExists('riwayat_bayar');
};
