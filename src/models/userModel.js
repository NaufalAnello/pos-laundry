const db = require('../database/connection');

const findByUsername = (username) =>
  db('users').where({ username, aktif: true }).first();

const findById = (id) =>
  db('users')
    .where({ id, aktif: true })
    .select('id', 'nama', 'username', 'role', 'aktif')
    .first();

module.exports = { findByUsername, findById };
