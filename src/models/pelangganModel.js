const db = require('../database/connection');

const LEVEL_MAP = [
  { min: 5000, label: 'Platinum', color: '#7c3aed' },
  { min: 2000, label: 'Gold',     color: '#d97706' },
  { min: 500,  label: 'Silver',   color: '#6b7280' },
  { min: 0,    label: 'Bronze',   color: '#92400e' }
];

const getLevel = (poin) => LEVEL_MAP.find(l => poin >= l.min);

const search = (q, limit = 10) =>
  db('pelanggan')
    .where('nama', 'like', `%${q}%`)
    .orWhere('telepon', 'like', `%${q}%`)
    .orderBy('nama')
    .limit(limit)
    .select('id', 'nama', 'telepon', 'total_poin');

const findById = (id) =>
  db('pelanggan').where({ id }).first();

const incrementPoin = (id, delta) =>
  db('pelanggan').where({ id }).increment('total_poin', delta);

module.exports = { search, findById, incrementPoin, getLevel };
