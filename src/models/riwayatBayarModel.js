const db = require('../database/connection');

// ── Create riwayat bayar ──────────────────────────────────────────────────────
const create = (data) => {
  return db('riwayat_bayar').insert({
    transaksi_id: data.transaksi_id,
    jenis: data.jenis || 'pelunasan',
    nominal: data.nominal,
    metode: data.metode,
    kelebihan_ke_deposit: data.kelebihan_ke_deposit || 0,
    created_by: data.created_by,
    keterangan: data.keterangan,
    created_at: data.created_at || new Date()
  });
};

// ── Get riwayat by transaksi_id ───────────────────────────────────────────────
const findByTransaksiId = (transaksiId) => {
  return db('riwayat_bayar as r')
    .leftJoin('users as u', 'u.id', 'r.created_by')
    .where('r.transaksi_id', transaksiId)
    .orderBy('r.created_at', 'asc')
    .select(
      'r.*',
      'u.nama as created_by_nama'
    );
};

// ── Get all riwayat ───────────────────────────────────────────────────────────
const findAll = ({ limit = 100, offset = 0 } = {}) => {
  return db('riwayat_bayar as r')
    .leftJoin('transaksi as t', 't.id', 'r.transaksi_id')
    .leftJoin('users as u', 'u.id', 'r.created_by')
    .orderBy('r.created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .select(
      'r.*',
      't.nomor_transaksi',
      'u.nama as created_by_nama'
    );
};

module.exports = {
  create,
  findByTransaksiId,
  findAll
};
