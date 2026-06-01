// Index untuk kolom yang sering di-query (date range, join FK, filter status)
// Mempercepat laporan, dashboard, struk, riwayat di perangkat ARM (HG680P)
exports.up = async (knex) => {
  await knex.schema.alterTable('transaksi', t => {
    t.index('tanggal_masuk', 'idx_transaksi_tanggal_masuk');
    t.index('pelanggan_id',  'idx_transaksi_pelanggan_id');
    t.index('status',        'idx_transaksi_status');
  });
  await knex.schema.alterTable('detail_transaksi', t => {
    t.index('transaksi_id', 'idx_detail_transaksi_id');
    t.index('layanan_id',   'idx_detail_layanan_id');
  });
  await knex.schema.alterTable('riwayat_poin', t => {
    t.index('pelanggan_id', 'idx_riwayat_poin_pelanggan_id');
  });
  await knex.schema.alterTable('mutasi_deposit', t => {
    t.index('pelanggan_id', 'idx_mutasi_deposit_pelanggan_id');
  });
  await knex.schema.alterTable('kas', t => {
    t.index('tanggal',      'idx_kas_tanggal');
    t.index('transaksi_id', 'idx_kas_transaksi_id');
  });
  await knex.schema.alterTable('wa_log', t => {
    t.index('transaksi_id', 'idx_wa_log_transaksi_id');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('transaksi', t => {
    t.dropIndex('tanggal_masuk', 'idx_transaksi_tanggal_masuk');
    t.dropIndex('pelanggan_id',  'idx_transaksi_pelanggan_id');
    t.dropIndex('status',        'idx_transaksi_status');
  });
  await knex.schema.alterTable('detail_transaksi', t => {
    t.dropIndex('transaksi_id', 'idx_detail_transaksi_id');
    t.dropIndex('layanan_id',   'idx_detail_layanan_id');
  });
  await knex.schema.alterTable('riwayat_poin', t => {
    t.dropIndex('pelanggan_id', 'idx_riwayat_poin_pelanggan_id');
  });
  await knex.schema.alterTable('mutasi_deposit', t => {
    t.dropIndex('pelanggan_id', 'idx_mutasi_deposit_pelanggan_id');
  });
  await knex.schema.alterTable('kas', t => {
    t.dropIndex('tanggal',      'idx_kas_tanggal');
    t.dropIndex('transaksi_id', 'idx_kas_transaksi_id');
  });
  await knex.schema.alterTable('wa_log', t => {
    t.dropIndex('transaksi_id', 'idx_wa_log_transaksi_id');
  });
};
