const db = require('../database/connection');

// ── Get all active master items ──────────────────────────────────────────────
const findAll = () =>
  db('master_item')
    .where('aktif', 1)
    .orderBy('urutan', 'asc')
    .orderBy('nama', 'asc')
    .select('id', 'nama', 'satuan', 'urutan');

// ── Get by ID ────────────────────────────────────────────────────────────────
const findById = (id) =>
  db('master_item')
    .where('id', id)
    .first();

// ── Create new master item ───────────────────────────────────────────────────
const create = async (data) => {
  // Cari urutan terakhir
  const last = await db('master_item')
    .orderBy('urutan', 'desc')
    .first();

  const urutan = last ? (last.urutan || 0) + 1 : 1;

  const [id] = await db('master_item').insert({
    nama: data.nama,
    satuan: data.satuan || 'pcs',
    urutan,
    aktif: 1,
    created_at: new Date()
  });

  return id;
};

// ── Update master item ───────────────────────────────────────────────────────
const update = (id, data) =>
  db('master_item')
    .where('id', id)
    .update({
      nama: data.nama,
      satuan: data.satuan,
      urutan: data.urutan
    });

// ── Soft delete (set aktif = 0) ──────────────────────────────────────────────
const remove = (id) =>
  db('master_item')
    .where('id', id)
    .update({ aktif: 0 });

// ── Reorder items ────────────────────────────────────────────────────────────
const reorder = async (itemIds) => {
  // itemIds adalah array [id1, id2, id3, ...] dengan urutan yang diinginkan
  await db.transaction(async (trx) => {
    for (let i = 0; i < itemIds.length; i++) {
      await trx('master_item')
        .where('id', itemIds[i])
        .update({ urutan: i + 1 });
    }
  });
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
  reorder
};
