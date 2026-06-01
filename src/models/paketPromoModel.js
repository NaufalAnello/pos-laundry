const db = require('../database/connection');

const findAllAktif = () => {
  const today = new Date().toISOString().slice(0, 10);
  const dow   = String(new Date().getDay()); // 0=Sun...6=Sat
  return db('paket_promo')
    .where('aktif', true)
    .where(function () {
      this.whereNull('berlaku_sampai').orWhere('berlaku_sampai', '>=', today);
    })
    .where(function () {
      this.whereNull('berlaku_mulai').orWhere('berlaku_mulai', '<=', today);
    })
    .where(function () {
      this.whereNull('hari_berlaku')
          .orWhere('hari_berlaku', '')
          .orWhere('hari_berlaku', 'like', `%${dow}%`);
    })
    .orderBy('nama');
};

const findById = (id) =>
  db('paket_promo').where({ id, aktif: true }).first();

// Cari promo by id TAPI validasi juga periode & hari berlaku (dipakai saat buat order)
const findByIdValid = (id) => {
  const today = new Date().toISOString().slice(0, 10);
  const dow   = String(new Date().getDay());
  return db('paket_promo')
    .where({ id, aktif: true })
    .where(function () {
      this.whereNull('berlaku_sampai').orWhere('berlaku_sampai', '>=', today);
    })
    .where(function () {
      this.whereNull('berlaku_mulai').orWhere('berlaku_mulai', '<=', today);
    })
    .where(function () {
      this.whereNull('hari_berlaku')
          .orWhere('hari_berlaku', '')
          .orWhere('hari_berlaku', 'like', `%${dow}%`);
    })
    .first();
};

module.exports = { findAllAktif, findById, findByIdValid };
