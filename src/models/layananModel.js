const db = require('../database/connection');

const findAllAktif = () =>
  db('layanan as l')
    .leftJoin('kategori_layanan as k', 'k.id', 'l.kategori_id')
    .where('l.aktif', true)
    .orderBy(['k.nama', 'l.nama'])
    .select('l.id', 'l.nama', 'l.harga', 'l.satuan', 'l.estimasi_jam',
            'k.id as kategori_id', 'k.nama as kategori_nama');

const findById = (id) =>
  db('layanan').where({ id, aktif: true }).first();

module.exports = { findAllAktif, findById };
