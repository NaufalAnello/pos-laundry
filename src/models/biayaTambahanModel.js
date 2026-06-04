const db = require('../database/connection');

// Get all biaya tambahan untuk transaksi tertentu
const findByTransaksiId = async (transaksiId) => {
  return await db('biaya_tambahan as bt')
    .leftJoin('users as u', 'u.id', 'bt.created_by')
    .where('bt.transaksi_id', transaksiId)
    .orderBy('bt.id', 'asc')
    .select(
      'bt.id',
      'bt.transaksi_id',
      'bt.keterangan',
      'bt.nominal',
      'bt.created_at',
      'u.nama as created_by_nama'
    );
};

// Create biaya tambahan
const create = async (data) => {
  const [id] = await db('biaya_tambahan').insert(data);
  return id;
};

// Update biaya tambahan
const update = async (id, data) => {
  await db('biaya_tambahan').where('id', id).update(data);
};

// Delete biaya tambahan
const remove = async (id) => {
  await db('biaya_tambahan').where('id', id).del();
};

// Get by ID
const findById = async (id) => {
  return await db('biaya_tambahan').where('id', id).first();
};

module.exports = {
  findByTransaksiId,
  create,
  update,
  remove,
  findById
};
