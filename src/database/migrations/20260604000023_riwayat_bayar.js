exports.up = async function(knex) {
  // Buat tabel riwayat_bayar
  await knex.schema.createTable('riwayat_bayar', (table) => {
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
    table.string('metode', 20).notNullable(); // tunai, transfer, qris, deposit
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

  // Tambah kolom ke tabel transaksi
  await knex.schema.table('transaksi', (table) => {
    table.timestamp('tanggal_lunas').nullable();
    table.decimal('total_dibayar', 12, 2).defaultTo(0);
  });

  // Migrasi data existing: set total_dibayar = bayar untuk data lama
  await knex.raw(`
    UPDATE transaksi
    SET total_dibayar = bayar,
        tanggal_lunas = CASE
          WHEN bayar >= total_bayar THEN created_at
          ELSE NULL
        END
    WHERE total_dibayar = 0
  `);

  // Populate riwayat_bayar untuk transaksi existing yang sudah punya bayar
  const existingTransaksi = await knex('transaksi')
    .where('bayar', '>', 0)
    .select('id', 'bayar', 'total_bayar', 'metode_bayar', 'created_at', 'user_id');

  for (const t of existingTransaksi) {
    const jenis = t.bayar >= t.total_bayar ? 'pelunasan' : 'dp_awal';
    const keterangan = jenis === 'pelunasan'
      ? `Pembayaran Lunas (${t.metode_bayar || 'tunai'})`
      : `DP Awal (${t.metode_bayar || 'tunai'})`;

    await knex('riwayat_bayar').insert({
      transaksi_id: t.id,
      jenis,
      nominal: t.bayar,
      metode: t.metode_bayar || 'tunai',
      kelebihan_ke_deposit: 0,
      created_by: t.user_id,
      keterangan,
      created_at: t.created_at
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('riwayat_bayar');
  await knex.schema.table('transaksi', (table) => {
    table.dropColumn('tanggal_lunas');
    table.dropColumn('total_dibayar');
  });
};
