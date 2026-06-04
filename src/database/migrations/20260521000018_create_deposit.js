// Migration idempotent: pisahkan unique index dari createTable, pakai IF NOT EXISTS
exports.up = async function (knex) {
  const hasDepositPelanggan = await knex.schema.hasTable('deposit_pelanggan');
  if (!hasDepositPelanggan) {
    await knex.schema.createTable('deposit_pelanggan', function (table) {
      table.increments('id').primary();
      table.integer('pelanggan_id').unsigned()
        .references('id').inTable('pelanggan').notNullable();
      table.decimal('saldo', 12, 2).defaultTo(0);
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS deposit_pelanggan_pelanggan_id_unique ON deposit_pelanggan(pelanggan_id)');

  const hasMutasiDeposit = await knex.schema.hasTable('mutasi_deposit');
  if (!hasMutasiDeposit) {
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
  }

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
