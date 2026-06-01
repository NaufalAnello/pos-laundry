const db = require('../database/connection');

// ── Nomor order: LDR-YYYYMMDD-NNN ──────────────────────────────────────────
const generateNomor = async () => {
  const now = new Date();
  const y  = now.getFullYear();
  const m  = String(now.getMonth() + 1).padStart(2, '0');
  const d  = String(now.getDate()).padStart(2, '0');
  const prefix = `LDR-${y}${m}${d}-`;

  const last = await db('transaksi')
    .where('nomor_transaksi', 'like', `${prefix}%`)
    .orderBy('id', 'desc')
    .first();

  const seq = last ? parseInt(last.nomor_transaksi.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ── List dengan filter & pagination ────────────────────────────────────────
const findAll = ({ status, tanggal, pelanggan_id, q, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const query = db('transaksi as t')
    .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
    .leftJoin('users as u',     'u.id', 't.user_id')
    .orderBy('t.id', 'desc')
    .limit(limit)
    .offset(offset)
    .select(
      't.id', 't.nomor_transaksi', 't.status', 't.total_harga',
      't.diskon', 't.poin_digunakan', 't.total_bayar', 't.bayar',
      't.kembalian', 't.metode_bayar', 't.tanggal_masuk', 't.tanggal_selesai',
      't.tanggal_ambil', 't.antar_jemput', 't.catatan', 't.created_at',
      'p.id as pelanggan_id', 'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
      'u.nama as kasir_nama',
      db.raw(`(SELECT GROUP_CONCAT(nama_layanan || ' ' || jumlah || ' ' || COALESCE(satuan,''), ', ')
               FROM detail_transaksi WHERE transaksi_id = t.id) as layanan_ringkas`)
    );

  if (status)       query.where('t.status', status);
  if (pelanggan_id) query.where('t.pelanggan_id', pelanggan_id);
  if (tanggal)      query.whereRaw("date(t.tanggal_masuk/1000,'unixepoch') = ?", [tanggal]);
  if (q)            query.where(function () {
    this.where('t.nomor_transaksi', 'like', `%${q}%`).orWhere('p.nama', 'like', `%${q}%`);
  });

  return query;
};

const countAll = ({ status, tanggal, pelanggan_id, q } = {}) => {
  const query = db('transaksi as t')
    .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
    .count('t.id as total').first();
  if (status)       query.where('t.status', status);
  if (pelanggan_id) query.where('t.pelanggan_id', pelanggan_id);
  if (tanggal)      query.whereRaw("date(t.tanggal_masuk/1000,'unixepoch') = ?", [tanggal]);
  if (q)            query.where(function () {
    this.where('t.nomor_transaksi', 'like', `%${q}%`).orWhere('p.nama', 'like', `%${q}%`);
  });
  return query;
};

// ── Single dengan detail items ──────────────────────────────────────────────
const findById = async (id) => {
  const transaksi = await db('transaksi as t')
    .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
    .leftJoin('users as u',     'u.id', 't.user_id')
    .leftJoin('paket_promo as pr', 'pr.id', 't.paket_promo_id')
    .where('t.id', id)
    .first(
      't.*',
      'p.nama as pelanggan_nama', 'p.telepon as pelanggan_telepon',
      'p.total_poin as pelanggan_poin',
      'u.nama as kasir_nama',
      'pr.nama as promo_nama'
    );

  if (!transaksi) return null;

  transaksi.items = await db('detail_transaksi as d')
    .leftJoin('layanan as l', 'l.id', 'd.layanan_id')
    .where('d.transaksi_id', id)
    .select('d.*', 'l.satuan as layanan_satuan');

  return transaksi;
};

// ── Create (dalam DB transaction) ──────────────────────────────────────────
const create = async (data, items) => {
  return db.transaction(async (trx) => {
    const [id] = await trx('transaksi').insert(data);
    if (items?.length) {
      await trx('detail_transaksi').insert(
        items.map(it => ({ ...it, transaksi_id: id }))
      );
    }
    return id;
  });
};

// ── Update ──────────────────────────────────────────────────────────────────
const update = (id, data) =>
  db('transaksi').where({ id }).update({ ...data, updated_at: new Date() });

// ── Update status saja ──────────────────────────────────────────────────────
const updateStatus = (id, status, extra = {}) => {
  const patch = { status, updated_at: new Date(), ...extra };
  if (status === 'diambil' && !patch.tanggal_ambil) {
    patch.tanggal_ambil = new Date();
  }
  return db('transaksi').where({ id }).update(patch);
};

module.exports = { generateNomor, findAll, countAll, findById, create, update, updateStatus };
