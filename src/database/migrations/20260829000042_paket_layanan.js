// Fitur Paket Layanan — pembelian kuota kg laundry di muka.
//
// - paket_layanan_template : template paket yang bisa dijual berulang
// - paket_pelanggan        : paket milik pelanggan (hasil pembelian)
// - mutasi_paket_pelanggan : audit trail per paket (beli/pakai/toleransi/hangus)
// - transaksi.paket_pelanggan_id / kg_dari_paket : link order ke paket
//
// Idempoten: aman dijalankan berulang; setiap operasi cek keberadaan dulu.
exports.up = async (knex) => {
  // ── paket_layanan_template ────────────────────────────────────────────────
  const hasTemplate = await knex.schema.hasTable('paket_layanan_template');
  if (!hasTemplate) {
    await knex.schema.createTable('paket_layanan_template', (t) => {
      t.increments('id').primary();
      t.string('nama', 100).notNullable();
      t.text('deskripsi');
      t.decimal('kuota_kg', 8, 2).notNullable();
      t.decimal('harga', 12, 2).notNullable();
      t.integer('masa_berlaku_hari').notNullable().defaultTo(30);
      t.integer('estimasi_min_hari').defaultTo(3);
      t.integer('estimasi_max_hari').defaultTo(4);
      t.integer('aktif').defaultTo(1);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // ── paket_pelanggan ───────────────────────────────────────────────────────
  const hasPaketPel = await knex.schema.hasTable('paket_pelanggan');
  if (!hasPaketPel) {
    await knex.schema.createTable('paket_pelanggan', (t) => {
      t.increments('id').primary();
      t.integer('pelanggan_id').unsigned().notNullable()
        .references('id').inTable('pelanggan');
      t.integer('paket_template_id').unsigned().notNullable()
        .references('id').inTable('paket_layanan_template');
      // Snapshot supaya histori paket pelanggan tetap konsisten meskipun
      // template diedit / dinonaktifkan setelah paket terjual.
      t.string('nama_paket_snapshot', 100).notNullable();
      t.decimal('kuota_awal_kg', 8, 2).notNullable();
      t.decimal('kuota_sisa_kg', 8, 2).notNullable();
      t.decimal('harga_dibayar', 12, 2).notNullable();
      t.string('metode_bayar', 20).defaultTo('tunai');
      t.timestamp('tanggal_beli').notNullable().defaultTo(knex.fn.now());
      t.timestamp('tanggal_kadaluarsa').notNullable();
      // aktif | habis_kuota | kadaluarsa | diperpanjang
      t.string('status', 20).notNullable().defaultTo('aktif');
      t.integer('toleransi_hari_tambahan').defaultTo(0);
      t.text('catatan_toleransi');
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
  await knex.raw('CREATE INDEX IF NOT EXISTS paket_pelanggan_pel_status_idx ON paket_pelanggan(pelanggan_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS paket_pelanggan_kadaluarsa_idx ON paket_pelanggan(tanggal_kadaluarsa)');

  // ── mutasi_paket_pelanggan ────────────────────────────────────────────────
  const hasMutasi = await knex.schema.hasTable('mutasi_paket_pelanggan');
  if (!hasMutasi) {
    await knex.schema.createTable('mutasi_paket_pelanggan', (t) => {
      t.increments('id').primary();
      t.integer('paket_pelanggan_id').unsigned().notNullable()
        .references('id').inTable('paket_pelanggan');
      // pembelian | pemakaian | toleransi | hangus
      t.string('jenis', 20).notNullable();
      t.decimal('kg_terpakai', 8, 2);
      t.integer('transaksi_id').unsigned()
        .references('id').inTable('transaksi').nullable();
      t.decimal('kuota_sebelum', 8, 2);
      t.decimal('kuota_sesudah', 8, 2);
      t.integer('hari_toleransi');
      t.text('keterangan');
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
  await knex.raw('CREATE INDEX IF NOT EXISTS mutasi_paket_paket_idx ON mutasi_paket_pelanggan(paket_pelanggan_id, id)');

  // ── transaksi: kolom paket_pelanggan_id + kg_dari_paket ───────────────────
  const hasPaketPelId = await knex.schema.hasColumn('transaksi', 'paket_pelanggan_id');
  if (!hasPaketPelId) {
    await knex.schema.table('transaksi', (t) => {
      t.integer('paket_pelanggan_id').unsigned()
        .references('id').inTable('paket_pelanggan').nullable();
    });
  }
  const hasKgDariPaket = await knex.schema.hasColumn('transaksi', 'kg_dari_paket');
  if (!hasKgDariPaket) {
    await knex.schema.table('transaksi', (t) => {
      t.decimal('kg_dari_paket', 8, 2).defaultTo(0);
    });
  }

  // ── Setting: ambang H- untuk reminder mendekati kadaluarsa ────────────────
  const existsAmbang = await knex('pengaturan').where('kunci', 'paket_reminder_ambang_hari').first();
  if (!existsAmbang) {
    await knex('pengaturan').insert({
      kunci:      'paket_reminder_ambang_hari',
      nilai:      '3',
      deskripsi:  'Ambang hari sebelum paket kadaluarsa untuk reminder (default 3 hari)',
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  // ── Setting: template WA reminder paket ────────────────────────────────────
  const existsWaTpl = await knex('pengaturan').where('kunci', 'wa_template_paket_reminder').first();
  if (!existsWaTpl) {
    const nilai = `📦 *Reminder Paket Laundry*

Halo {nama} 👋
Paket *{nama_paket}* Anda akan kadaluarsa dalam {sisa_hari} hari lagi ({tanggal_kadaluarsa}).

Sisa kuota: {sisa_kuota} kg dari {kuota_awal} kg

Apakah Anda ingin memperpanjang paket ini? Balas pesan ini atau hubungi kami untuk info lebih lanjut. 🙏

_— {nama_toko} —_`;
    await knex('pengaturan').insert({
      kunci:      'wa_template_paket_reminder',
      nilai,
      deskripsi:  'Template pesan WA reminder paket mendekati kadaluarsa',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
};

exports.down = async (knex) => {
  const hasKgDariPaket = await knex.schema.hasColumn('transaksi', 'kg_dari_paket');
  if (hasKgDariPaket) {
    await knex.schema.table('transaksi', (t) => t.dropColumn('kg_dari_paket'));
  }
  const hasPaketPelId = await knex.schema.hasColumn('transaksi', 'paket_pelanggan_id');
  if (hasPaketPelId) {
    await knex.schema.table('transaksi', (t) => t.dropColumn('paket_pelanggan_id'));
  }
  await knex.schema.dropTableIfExists('mutasi_paket_pelanggan');
  await knex.schema.dropTableIfExists('paket_pelanggan');
  await knex.schema.dropTableIfExists('paket_layanan_template');
  await knex('pengaturan').whereIn('kunci', [
    'paket_reminder_ambang_hari',
    'wa_template_paket_reminder'
  ]).del();
};
