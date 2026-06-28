/**
 * Migration: Ubah sistem estimasi dari hari ke jam
 *
 * PERUBAHAN:
 * - Tambah kolom estimasi_jam (INTEGER DEFAULT 24)
 * - Konversi data lama: estimasi_jam = estimasi_hari * 24
 * - Kolom estimasi_hari tetap ada untuk backward compatibility
 */

exports.up = function (knex) {
  return knex.schema.table('layanan', function (table) {
    // Tambah kolom estimasi_jam
    table.integer('estimasi_jam').defaultTo(24);
  }).then(() => {
    // Konversi data lama: estimasi_jam = estimasi_hari * 24
    return knex.raw(`
      UPDATE layanan
      SET estimasi_jam = estimasi_hari * 24
      WHERE estimasi_jam = 24
    `);
  });
};

exports.down = function (knex) {
  return knex.schema.table('layanan', function (table) {
    table.dropColumn('estimasi_jam');
  });
};
