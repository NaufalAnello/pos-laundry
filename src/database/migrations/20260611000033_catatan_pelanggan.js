// Catatan khusus pelanggan: parfum favorit, instruksi laundry, catatan internal.
// Field opsional — tampil di order baru & detail order untuk reminder kasir.
exports.up = async (knex) => {
  const cols = ['catatan', 'parfum', 'instruksi_khusus'];
  for (const col of cols) {
    const has = await knex.schema.hasColumn('pelanggan', col);
    if (!has) {
      await knex.schema.table('pelanggan', (t) => {
        t.text(col).nullable();
      });
    }
  }
};

exports.down = async (knex) => {
  const cols = ['catatan', 'parfum', 'instruksi_khusus'];
  for (const col of cols) {
    const has = await knex.schema.hasColumn('pelanggan', col);
    if (has) {
      await knex.schema.table('pelanggan', (t) => t.dropColumn(col));
    }
  }
};
