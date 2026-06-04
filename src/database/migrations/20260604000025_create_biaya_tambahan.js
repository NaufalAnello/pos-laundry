// Migration idempotent: tabel & index biaya_tambahan sudah dibuat di migration 23,
// tapi file ini tetap aman dijalankan ulang sebagai safety-net.
exports.up = async function(knex) {
  const hasBiayaTambahan = await knex.schema.hasTable('biaya_tambahan');
  if (!hasBiayaTambahan) {
    await knex.schema.createTable('biaya_tambahan', (table) => {
      table.increments('id').primary();
      table.integer('transaksi_id').notNullable()
        .references('id').inTable('transaksi').onDelete('CASCADE');
      table.string('keterangan').notNullable();
      table.decimal('nominal', 10, 2).notNullable();
      table.integer('created_by')
        .references('id').inTable('users').onDelete('SET NULL');
      table.datetime('created_at').defaultTo(knex.fn.now());
    });
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS biaya_tambahan_transaksi_id_index ON biaya_tambahan(transaksi_id)');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('biaya_tambahan');
};
