// Index untuk kolom yang sering di-query (date range, join FK, filter status)
// Mempercepat laporan, dashboard, struk, riwayat di perangkat ARM (HG680P)
// Pakai CREATE INDEX IF NOT EXISTS agar tidak error jika index sudah ada
exports.up = async (knex) => {
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal_masuk ON transaksi(tanggal_masuk)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_transaksi_pelanggan_id  ON transaksi(pelanggan_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_transaksi_status        ON transaksi(status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_detail_transaksi_id     ON detail_transaksi(transaksi_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_detail_layanan_id       ON detail_transaksi(layanan_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_riwayat_poin_pelanggan_id ON riwayat_poin(pelanggan_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_mutasi_deposit_pelanggan_id ON mutasi_deposit(pelanggan_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_kas_tanggal              ON kas(tanggal)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_kas_transaksi_id         ON kas(transaksi_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_wa_log_transaksi_id      ON wa_log(transaksi_id)');
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS idx_transaksi_tanggal_masuk');
  await knex.raw('DROP INDEX IF EXISTS idx_transaksi_pelanggan_id');
  await knex.raw('DROP INDEX IF EXISTS idx_transaksi_status');
  await knex.raw('DROP INDEX IF EXISTS idx_detail_transaksi_id');
  await knex.raw('DROP INDEX IF EXISTS idx_detail_layanan_id');
  await knex.raw('DROP INDEX IF EXISTS idx_riwayat_poin_pelanggan_id');
  await knex.raw('DROP INDEX IF EXISTS idx_mutasi_deposit_pelanggan_id');
  await knex.raw('DROP INDEX IF EXISTS idx_kas_tanggal');
  await knex.raw('DROP INDEX IF EXISTS idx_kas_transaksi_id');
  await knex.raw('DROP INDEX IF EXISTS idx_wa_log_transaksi_id');
};
