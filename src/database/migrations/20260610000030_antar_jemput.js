// Kalkulator HPP Antar Jemput dengan historical pricing:
// - Tambah kolom jarak_workshop_km di pelanggan
// - Tabel rute_antar_jemput dengan SNAPSHOT parameter (BBM, aus, dll)
// - Seed pengaturan aj_* (harga BBM, konsumsi, biaya aus, kecepatan, jam kerja)
exports.up = async function (knex) {
  // 1) Tambah kolom jarak di pelanggan
  const hasJarak = await knex.schema.hasColumn('pelanggan', 'jarak_workshop_km');
  if (!hasJarak) {
    await knex.schema.table('pelanggan', (t) => {
      t.decimal('jarak_workshop_km', 5, 2).defaultTo(0);
    });
  }

  // 2) Tabel rute_antar_jemput
  const hasRute = await knex.schema.hasTable('rute_antar_jemput');
  if (!hasRute) {
    await knex.schema.createTable('rute_antar_jemput', (t) => {
      t.increments('id').primary();
      t.date('tanggal').notNullable();

      // Pelanggan dan rute (JSON)
      t.text('pelanggan_data').notNullable();
      t.text('urutan_rute');

      // SNAPSHOT parameter saat rute dibuat
      t.decimal('snapshot_harga_bbm', 10, 2).notNullable();
      t.decimal('snapshot_konsumsi_bbm', 5, 2).notNullable();
      t.decimal('snapshot_biaya_aus', 8, 2).notNullable();
      t.decimal('snapshot_kecepatan', 5, 2).notNullable();
      t.decimal('snapshot_nilai_waktu', 10, 2).notNullable();

      // Hasil kalkulasi
      t.decimal('total_jarak_km', 6, 2).notNullable();
      t.decimal('biaya_bbm', 10, 2).notNullable();
      t.decimal('biaya_waktu', 10, 2).notNullable();
      t.decimal('biaya_aus', 10, 2).notNullable();
      t.decimal('total_hpp', 10, 2).notNullable();
      t.decimal('hpp_per_pelanggan', 10, 2).notNullable();
      t.decimal('tarif_dikenakan', 10, 2).notNullable();

      // AI saran
      t.text('saran_ai');

      t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_rute_aj_tanggal ON rute_antar_jemput(tanggal)');
  }

  // 3) Seed pengaturan AJ
  const seeds = [
    { kunci: 'aj_harga_bbm',     nilai: '10000', deskripsi: 'Harga Pertalite per liter (Rp)' },
    { kunci: 'aj_konsumsi_bbm',  nilai: '39',    deskripsi: 'Konsumsi BBM motor (km/liter)' },
    { kunci: 'aj_biaya_aus',     nilai: '400',   deskripsi: 'Biaya aus kendaraan (Rp/km)' },
    { kunci: 'aj_kecepatan',     nilai: '30',    deskripsi: 'Kecepatan rata-rata (km/jam)' },
    { kunci: 'aj_jam_kerja',     nilai: '8',     deskripsi: 'Jam kerja per hari (untuk nilai waktu)' },
  ];

  for (const s of seeds) {
    const existing = await knex('pengaturan').where({ kunci: s.kunci }).first();
    if (!existing) {
      await knex('pengaturan').insert({
        ...s,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('rute_antar_jemput');
  const hasJarak = await knex.schema.hasColumn('pelanggan', 'jarak_workshop_km');
  if (hasJarak) {
    await knex.schema.table('pelanggan', (t) => {
      t.dropColumn('jarak_workshop_km');
    });
  }
  await knex('pengaturan').whereIn('kunci', [
    'aj_harga_bbm', 'aj_konsumsi_bbm', 'aj_biaya_aus', 'aj_kecepatan', 'aj_jam_kerja'
  ]).delete();
};
