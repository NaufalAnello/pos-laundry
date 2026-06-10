// Tambah kolom jarak_jemput_km di transaksi.
// - Untuk walk-in (tanpa pelanggan_id): jarak diisi langsung saat order
// - Untuk pelanggan terdaftar: fallback ke pelanggan.jarak_workshop_km
// - Kolom `tarif_jemput_diterapkan` menandakan order sudah ditarik tarif AJ
//   sehingga widget dashboard tahu mana yang belum diproses.
exports.up = async (knex) => {
  const hasJarak = await knex.schema.hasColumn('transaksi', 'jarak_jemput_km');
  if (!hasJarak) {
    await knex.schema.table('transaksi', (t) => {
      t.decimal('jarak_jemput_km', 5, 2);
    });
  }
  const hasFlag = await knex.schema.hasColumn('transaksi', 'tarif_jemput_diterapkan');
  if (!hasFlag) {
    await knex.schema.table('transaksi', (t) => {
      t.boolean('tarif_jemput_diterapkan').defaultTo(false);
    });
  }
};

exports.down = async (knex) => {
  const hasJarak = await knex.schema.hasColumn('transaksi', 'jarak_jemput_km');
  if (hasJarak) {
    await knex.schema.table('transaksi', (t) => t.dropColumn('jarak_jemput_km'));
  }
  const hasFlag = await knex.schema.hasColumn('transaksi', 'tarif_jemput_diterapkan');
  if (hasFlag) {
    await knex.schema.table('transaksi', (t) => t.dropColumn('tarif_jemput_diterapkan'));
  }
};
