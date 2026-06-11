// Reservasi penjemputan cucian.
// - Operator menjadwalkan jemputan di tanggal/jam tertentu untuk pelanggan
// - Saat selesai bisa otomatis dipakai jadi transaksi (transaksi_id terisi)
// - Status: terjadwal | selesai | batal
exports.up = async (knex) => {
  const has = await knex.schema.hasTable('reservasi_jemput');
  if (!has) {
    await knex.schema.createTable('reservasi_jemput', (t) => {
      t.increments('id').primary();
      t.integer('pelanggan_id').references('id').inTable('pelanggan').onDelete('SET NULL');
      t.integer('transaksi_id').references('id').inTable('transaksi').onDelete('SET NULL');
      t.date('tanggal_jemput').notNullable();
      t.string('jam_jemput', 5); // HH:MM, opsional
      t.text('alamat');
      t.text('catatan');
      t.string('status', 20).defaultTo('terjadwal'); // terjadwal | selesai | batal
      t.text('alasan_batal');
      t.integer('created_by').references('id').inTable('users').onDelete('SET NULL');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());

      t.index(['tanggal_jemput', 'status']);
      t.index('pelanggan_id');
    });
  }
};

exports.down = async (knex) => {
  const has = await knex.schema.hasTable('reservasi_jemput');
  if (has) await knex.schema.dropTable('reservasi_jemput');
};
