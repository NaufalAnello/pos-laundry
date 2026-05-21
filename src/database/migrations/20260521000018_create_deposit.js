exports.up = async function (knex) {
  await knex.schema.createTable('deposit_pelanggan', function (table) {
    table.increments('id').primary();
    table.integer('pelanggan_id').unsigned()
      .references('id').inTable('pelanggan').notNullable();
    table.decimal('saldo', 12, 2).defaultTo(0);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['pelanggan_id']);
  });

  await knex.schema.createTable('mutasi_deposit', function (table) {
    table.increments('id').primary();
    table.integer('pelanggan_id').unsigned()
      .references('id').inTable('pelanggan').notNullable();
    table.integer('transaksi_id').unsigned()
      .references('id').inTable('transaksi').nullable();
    table.string('jenis', 20).notNullable(); // topup, bayar, kelebihan, refund, koreksi
    table.decimal('nominal', 12, 2).notNullable();
    table.decimal('saldo_sebelum', 12, 2).notNullable();
    table.decimal('saldo_sesudah', 12, 2).notNullable();
    table.string('keterangan', 255);
    table.string('metode_bayar', 30);
    table.integer('created_by').unsigned()
      .references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Tambah threshold notif deposit ke pengaturan
  const exists = await knex('pengaturan').where('kunci', 'deposit_notif_threshold').first();
  if (!exists) {
    await knex('pengaturan').insert({
      kunci:      'deposit_notif_threshold',
      nilai:      '20000',
      deskripsi:  'Threshold saldo deposit untuk notifikasi saldo tipis (Rp)',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('mutasi_deposit');
  await knex.schema.dropTableIfExists('deposit_pelanggan');
  await knex('pengaturan').where('kunci', 'deposit_notif_threshold').delete();
};
