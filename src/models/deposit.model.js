const db = require('../database/connection');

// ── Ambil atau buat row saldo deposit ──────────────────────────────────────
const getSaldo = async (pelangganId) => {
  let row = await db('deposit_pelanggan').where({ pelanggan_id: pelangganId }).first();
  if (!row) {
    await db('deposit_pelanggan').insert({
      pelanggan_id: pelangganId,
      saldo:        0,
      updated_at:   new Date()
    });
    row = await db('deposit_pelanggan').where({ pelanggan_id: pelangganId }).first();
  }
  return row;
};

// ── Top-up saldo deposit ────────────────────────────────────────────────────
const topup = async ({ pelangganId, nominal, metodeBayar, keterangan, createdBy }) => {
  return db.transaction(async (trx) => {
    let row = await trx('deposit_pelanggan').where({ pelanggan_id: pelangganId }).first();
    if (!row) {
      await trx('deposit_pelanggan').insert({
        pelanggan_id: pelangganId, saldo: 0, updated_at: new Date()
      });
      row = await trx('deposit_pelanggan').where({ pelanggan_id: pelangganId }).first();
    }

    const saldoSebelum = Number(row.saldo);
    const saldoSesudah = saldoSebelum + Number(nominal);

    await trx('deposit_pelanggan')
      .where({ pelanggan_id: pelangganId })
      .update({ saldo: saldoSesudah, updated_at: new Date() });

    await trx('mutasi_deposit').insert({
      pelanggan_id:  pelangganId,
      transaksi_id:  null,
      jenis:         'topup',
      nominal:       Number(nominal),
      saldo_sebelum: saldoSebelum,
      saldo_sesudah: saldoSesudah,
      keterangan:    keterangan || 'Top-up deposit',
      metode_bayar:  metodeBayar || null,
      created_by:    createdBy  || null,
      created_at:    new Date()
    });

    return saldoSesudah;
  });
};

// ── Potong saldo untuk pembayaran ───────────────────────────────────────────
const bayar = async ({ pelangganId, nominal, transaksiId, createdBy }) => {
  return db.transaction(async (trx) => {
    const row = await trx('deposit_pelanggan')
      .where({ pelanggan_id: pelangganId }).first();

    const saldoSebelum = Number(row?.saldo || 0);
    if (saldoSebelum < Number(nominal)) {
      throw new Error(`Saldo tidak cukup (Rp ${saldoSebelum.toLocaleString('id-ID')}). Kekurangan Rp ${(Number(nominal) - saldoSebelum).toLocaleString('id-ID')}`);
    }

    const saldoSesudah = saldoSebelum - Number(nominal);

    await trx('deposit_pelanggan')
      .where({ pelanggan_id: pelangganId })
      .update({ saldo: saldoSesudah, updated_at: new Date() });

    await trx('mutasi_deposit').insert({
      pelanggan_id:  pelangganId,
      transaksi_id:  transaksiId || null,
      jenis:         'bayar',
      nominal:       Number(nominal),
      saldo_sebelum: saldoSebelum,
      saldo_sesudah: saldoSesudah,
      keterangan:    `Pembayaran order`,
      metode_bayar:  'deposit',
      created_by:    createdBy || null,
      created_at:    new Date()
    });

    return { saldoSebelum, saldoSesudah };
  });
};

// ── Tambah saldo dari kelebihan bayar ───────────────────────────────────────
const tambahKelebihan = async ({ pelangganId, nominal, transaksiId, createdBy }) => {
  return db.transaction(async (trx) => {
    let row = await trx('deposit_pelanggan').where({ pelanggan_id: pelangganId }).first();
    if (!row) {
      await trx('deposit_pelanggan').insert({
        pelanggan_id: pelangganId, saldo: 0, updated_at: new Date()
      });
      row = await trx('deposit_pelanggan').where({ pelanggan_id: pelangganId }).first();
    }

    const saldoSebelum = Number(row.saldo);
    const saldoSesudah = saldoSebelum + Number(nominal);

    await trx('deposit_pelanggan')
      .where({ pelanggan_id: pelangganId })
      .update({ saldo: saldoSesudah, updated_at: new Date() });

    await trx('mutasi_deposit').insert({
      pelanggan_id:  pelangganId,
      transaksi_id:  transaksiId || null,
      jenis:         'kelebihan',
      nominal:       Number(nominal),
      saldo_sebelum: saldoSebelum,
      saldo_sesudah: saldoSesudah,
      keterangan:    'Kelebihan bayar masuk deposit',
      metode_bayar:  null,
      created_by:    createdBy  || null,
      created_at:    new Date()
    });

    return saldoSesudah;
  });
};

// ── Riwayat mutasi ──────────────────────────────────────────────────────────
const getMutasi = (pelangganId, { limit = 20, offset = 0 } = {}) =>
  db('mutasi_deposit as m')
    .leftJoin('transaksi as t', 't.id', 'm.transaksi_id')
    .leftJoin('users as u',     'u.id', 'm.created_by')
    .where('m.pelanggan_id', pelangganId)
    .orderBy('m.id', 'desc')
    .limit(limit)
    .offset(offset)
    .select(
      'm.*',
      't.nomor_transaksi',
      'u.nama as operator_nama'
    );

const countMutasi = (pelangganId) =>
  db('mutasi_deposit').where({ pelanggan_id: pelangganId }).count('id as total').first();

// ── Ringkasan semua deposit ─────────────────────────────────────────────────
const getRingkasan = async () => {
  const threshold = await db('pengaturan')
    .where('kunci', 'deposit_notif_threshold').first();
  const thresholdVal = Number(threshold?.nilai || 20000);

  const [totalRow, countRow, tipisRow] = await Promise.all([
    db('deposit_pelanggan').sum('saldo as total').first(),
    db('deposit_pelanggan').where('saldo', '>', 0).count('id as total').first(),
    db('deposit_pelanggan').where('saldo', '<', thresholdVal).where('saldo', '>', 0).count('id as total').first()
  ]);

  return {
    total_saldo:          Number(totalRow?.total  ?? 0),
    jumlah_pelanggan:     Number(countRow?.total  ?? 0),
    pelanggan_saldo_tipis: Number(tipisRow?.total ?? 0),
    threshold:            thresholdVal
  };
};

module.exports = { getSaldo, topup, bayar, tambahKelebihan, getMutasi, countMutasi, getRingkasan };
