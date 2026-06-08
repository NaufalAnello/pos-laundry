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

  // Load rincian item untuk setiap detail transaksi
  for (const item of transaksi.items) {
    item.rincian = await db('detail_item_layanan')
      .where('detail_transaksi_id', item.id)
      .select('id', 'nama_item', 'jumlah', 'satuan')
      .orderBy('id', 'asc');
  }

  // Get biaya tambahan
  transaksi.biaya_tambahan = await db('biaya_tambahan')
    .where('transaksi_id', id)
    .select('id', 'keterangan', 'nominal');

  return transaksi;
};

// ── Create (dalam DB transaction) ──────────────────────────────────────────
const create = async (data, items) => {
  return db.transaction(async (trx) => {
    const [id] = await trx('transaksi').insert(data);
    if (items?.length) {
      for (const item of items) {
        const rincian = item.rincian || [];
        // Hapus rincian dari item sebelum insert ke detail_transaksi
        const { rincian: _, ...itemData } = item;

        const [detailId] = await trx('detail_transaksi').insert({
          ...itemData,
          transaksi_id: id
        });

        // Simpan rincian item jika ada
        if (rincian.length > 0) {
          await trx('detail_item_layanan').insert(
            rincian.map(r => ({
              detail_transaksi_id: detailId,
              nama_item: r.nama_item,
              jumlah: r.jumlah || 1,
              satuan: r.satuan || 'pcs',
              created_at: new Date()
            }))
          );
        }
      }
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

// ── Detail lengkap untuk halaman detail order ──────────────────────────────
const findDetailById = async (id) => {
  // Get transaksi dengan join pelanggan
  const transaksi = await db('transaksi as t')
    .leftJoin('pelanggan as p', 'p.id', 't.pelanggan_id')
    .leftJoin('users as u',     'u.id', 't.user_id')
    .leftJoin('paket_promo as pr', 'pr.id', 't.paket_promo_id')
    .where('t.id', id)
    .first(
      't.*',
      'u.nama as kasir_nama',
      'pr.nama as promo_nama'
    );

  if (!transaksi) return null;

  // Get detail items
  transaksi.items = await db('detail_transaksi as d')
    .leftJoin('layanan as l', 'l.id', 'd.layanan_id')
    .where('d.transaksi_id', id)
    .select(
      'd.*',
      'l.satuan',
      db.raw('d.harga_satuan as harga') // Alias untuk kompatibilitas frontend
    );

  // Load rincian item untuk setiap detail transaksi
  for (const item of transaksi.items) {
    item.rincian = await db('detail_item_layanan')
      .where('detail_transaksi_id', item.id)
      .select('id', 'nama_item', 'jumlah', 'satuan')
      .orderBy('id', 'asc');
  }

  // Get pelanggan detail with level
  if (transaksi.pelanggan_id) {
    const pelanggan = await db('pelanggan')
      .where('id', transaksi.pelanggan_id)
      .first();

    if (pelanggan) {
      // Hitung level berdasarkan poin
      let level = 'Bronze';
      if (pelanggan.total_poin >= 1000) level = 'Gold';
      else if (pelanggan.total_poin >= 500) level = 'Silver';

      transaksi.pelanggan = {
        ...pelanggan,
        level
      };
    }
  }

  // Get riwayat bayar dari database
  transaksi.riwayat_bayar = await db('riwayat_bayar as r')
    .leftJoin('users as u', 'u.id', 'r.created_by')
    .where('r.transaksi_id', id)
    .orderBy('r.created_at', 'asc')
    .select(
      'r.*',
      'u.nama as created_by_nama'
    );

  // Format untuk kompatibilitas dengan frontend
  transaksi.riwayat_bayar = transaksi.riwayat_bayar.map(r => ({
    jumlah: r.nominal,
    metode_bayar: r.metode,
    keterangan: r.keterangan,
    created_at: r.created_at,
    created_by_nama: r.created_by_nama,
    jenis: r.jenis,
    kelebihan_ke_deposit: r.kelebihan_ke_deposit
  }));

  // Get poin order
  transaksi.poin_order = {
    didapat: 0,
    sebelum: 0,
    sesudah: 0
  };

  if (transaksi.pelanggan) {
    // Ambil pengaturan poin_per_nominal dari database
    const settingRow = await db('pengaturan')
      .where('kunci', 'poin_per_nominal')
      .first();
    const poinPerNominal = parseInt(settingRow?.nilai) || 10000;

    // Hitung poin yang didapat: setiap poin_per_nominal rupiah = 1 poin
    const poinDidapat = Math.floor(transaksi.total_bayar / poinPerNominal);
    transaksi.poin_order = {
      didapat: poinDidapat,
      sebelum: transaksi.pelanggan.total_poin - poinDidapat,
      sesudah: transaksi.pelanggan.total_poin
    };
  }

  // Get biaya tambahan
  transaksi.biaya_tambahan = await db('biaya_tambahan as bt')
    .leftJoin('users as u', 'u.id', 'bt.created_by')
    .where('bt.transaksi_id', id)
    .orderBy('bt.id', 'asc')
    .select(
      'bt.id',
      'bt.keterangan',
      'bt.nominal',
      'bt.created_at',
      'u.nama as created_by_nama'
    );

  return transaksi;
};

module.exports = { generateNomor, findAll, countAll, findById, findDetailById, create, update, updateStatus };
