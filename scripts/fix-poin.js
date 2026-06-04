#!/usr/bin/env node

/**
 * Script untuk memperbaiki perhitungan poin yang salah
 * Bug: menggunakan 1% dari total_bayar (nilai_tukar_poin)
 * Fix: menggunakan total_bayar / poin_per_nominal
 */

const db = require('../src/database/connection');

async function fixPoin() {
  console.log('🔧 Memperbaiki perhitungan poin yang salah...\n');

  try {
    // Ambil pengaturan
    const settingRow = await db('pengaturan').where('kunci', 'poin_per_nominal').first();
    const poinPerNominal = parseInt(settingRow?.nilai) || 10000;
    console.log(`Pengaturan: ${poinPerNominal} rupiah = 1 poin\n`);

    // Ambil semua riwayat poin dari transaksi (jenis = tambah, keterangan = "Poin dari ...")
    const riwayatPoin = await db('riwayat_poin as rp')
      .join('transaksi as t', 't.id', 'rp.transaksi_id')
      .where('rp.jenis', 'tambah')
      .where('rp.keterangan', 'like', 'Poin dari%')
      .select(
        'rp.id as riwayat_id',
        'rp.pelanggan_id',
        'rp.transaksi_id',
        'rp.jumlah_poin as poin_lama',
        't.nomor_transaksi',
        't.total_bayar'
      );

    if (riwayatPoin.length === 0) {
      console.log('✅ Tidak ada data poin yang perlu diperbaiki.');
      process.exit(0);
    }

    console.log(`Ditemukan ${riwayatPoin.length} transaksi dengan poin:\n`);

    let totalFixed = 0;
    let totalSkipped = 0;

    await db.transaction(async (trx) => {
      for (const row of riwayatPoin) {
        const poinBenar = Math.floor(row.total_bayar / poinPerNominal);
        const delta = poinBenar - row.poin_lama;

        if (delta === 0) {
          console.log(`⏭️  ${row.nomor_transaksi}: ${row.poin_lama} poin (sudah benar)`);
          totalSkipped++;
          continue;
        }

        console.log(
          `🔄 ${row.nomor_transaksi}: Rp ${row.total_bayar.toLocaleString('id-ID')} → ${row.poin_lama} poin (salah) → ${poinBenar} poin (benar), delta: ${delta > 0 ? '+' : ''}${delta}`
        );

        // Update riwayat_poin
        await trx('riwayat_poin')
          .where('id', row.riwayat_id)
          .update({ jumlah_poin: poinBenar });

        // Update total_poin pelanggan
        await trx('pelanggan')
          .where('id', row.pelanggan_id)
          .increment('total_poin', delta);

        // Update cache poin_pelanggan (jika ada)
        const cacheExists = await trx('poin_pelanggan')
          .where('pelanggan_id', row.pelanggan_id)
          .first();
        if (cacheExists) {
          await trx('poin_pelanggan')
            .where('pelanggan_id', row.pelanggan_id)
            .increment('total_poin', delta);
        }

        totalFixed++;
      }
    });

    console.log(`\n✅ Selesai! ${totalFixed} transaksi diperbaiki, ${totalSkipped} transaksi sudah benar.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

fixPoin();
