// Menambahkan kolom `tanggal_lunas` dan `total_dibayar` ke tabel `transaksi`.
// Kolom ini direferensikan oleh controller/dashboard/UI sejak sistem
// pembayaran (DP/deposit/lunasi) diperkenalkan, tapi ALTER TABLE-nya sempat
// dihapus dari migration 20260604000023 dengan asumsi kolom sudah ada — asumsi
// itu tidak berlaku untuk fresh install, sehingga endpoint POST /transaksi
// gagal dengan "table transaksi has no column named tanggal_lunas".
//
// Idempoten: cek dulu sebelum menambahkan.
exports.up = async function (knex) {
  const hasTanggalLunas = await knex.schema.hasColumn('transaksi', 'tanggal_lunas');
  if (!hasTanggalLunas) {
    await knex.schema.alterTable('transaksi', (t) => {
      t.timestamp('tanggal_lunas').nullable();
    });
  }

  const hasTotalDibayar = await knex.schema.hasColumn('transaksi', 'total_dibayar');
  if (!hasTotalDibayar) {
    await knex.schema.alterTable('transaksi', (t) => {
      t.decimal('total_dibayar', 12, 2).defaultTo(0);
    });

    // Backfill data lama: `total_dibayar` = `bayar`
    // `tanggal_lunas` = `created_at` kalau bayar >= total_bayar, else NULL
    await knex.raw(`
      UPDATE transaksi
      SET total_dibayar = bayar
      WHERE (total_dibayar IS NULL OR total_dibayar = 0) AND bayar > 0
    `);
    await knex.raw(`
      UPDATE transaksi
      SET tanggal_lunas = created_at
      WHERE tanggal_lunas IS NULL
        AND bayar >= total_bayar
        AND total_bayar > 0
    `);
  }
};

exports.down = async function (knex) {
  const hasTanggalLunas = await knex.schema.hasColumn('transaksi', 'tanggal_lunas');
  if (hasTanggalLunas) {
    await knex.schema.alterTable('transaksi', (t) => t.dropColumn('tanggal_lunas'));
  }
  const hasTotalDibayar = await knex.schema.hasColumn('transaksi', 'total_dibayar');
  if (hasTotalDibayar) {
    await knex.schema.alterTable('transaksi', (t) => t.dropColumn('total_dibayar'));
  }
};
