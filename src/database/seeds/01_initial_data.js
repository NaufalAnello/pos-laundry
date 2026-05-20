const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Hapus data lama dengan urutan reverse FK
  await knex('riwayat_poin').del();
  await knex('poin_pelanggan').del();
  await knex('wa_log').del();
  await knex('kas').del();
  await knex('detail_transaksi').del();
  await knex('transaksi').del();
  await knex('layanan').del();
  await knex('kategori_layanan').del();
  await knex('paket_promo').del();
  await knex('stok_bahan').del();
  await knex('pengaturan').del();
  await knex('pelanggan').del();
  await knex('users').del();

  // Reset autoincrement SQLite supaya ID mulai dari 1 lagi
  const tables = ['users', 'pelanggan', 'kategori_layanan', 'layanan',
                  'paket_promo', 'stok_bahan', 'pengaturan'];
  for (const t of tables) {
    await knex.raw(`DELETE FROM sqlite_sequence WHERE name = ?`, [t]).catch(() => {});
  }

  // === USERS ===
  const hashedPassword = await bcrypt.hash('admin123', 12);
  await knex('users').insert([
    {
      nama: 'Administrator',
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      aktif: true
    }
  ]);

  // === KATEGORI LAYANAN (5 kategori) ===
  await knex('kategori_layanan').insert([
    { nama: 'Cuci Kering',       deskripsi: 'Layanan cuci dengan pengering mesin', aktif: true },
    { nama: 'Cuci Basah',        deskripsi: 'Layanan cuci biasa tanpa pengering',   aktif: true },
    { nama: 'Setrika',           deskripsi: 'Layanan setrika pakaian saja',         aktif: true },
    { nama: 'Express',           deskripsi: 'Layanan kilat selesai 1 hari',         aktif: true },
    { nama: 'Premium & Spesial', deskripsi: 'Layanan premium untuk item khusus',    aktif: true }
  ]);

  // === LAYANAN (13 layanan) ===
  await knex('layanan').insert([
    { kategori_id: 1, nama: 'Cuci Kering',            harga: 8000,  satuan: 'kg',    estimasi_hari: 2, deskripsi: 'Cuci + kering per kilogram',                  aktif: true },
    { kategori_id: 1, nama: 'Cuci + Setrika',          harga: 12000, satuan: 'kg',    estimasi_hari: 3, deskripsi: 'Cuci, kering, dan setrika per kilogram',       aktif: true },
    { kategori_id: 2, nama: 'Cuci Basah',              harga: 6000,  satuan: 'kg',    estimasi_hari: 2, deskripsi: 'Cuci biasa per kilogram',                      aktif: true },
    { kategori_id: 3, nama: 'Setrika Saja',            harga: 6000,  satuan: 'kg',    estimasi_hari: 1, deskripsi: 'Setrika per kilogram',                         aktif: true },
    { kategori_id: 4, nama: 'Express Cuci Kering',     harga: 15000, satuan: 'kg',    estimasi_hari: 1, deskripsi: 'Cuci kering kilat selesai 1 hari',             aktif: true },
    { kategori_id: 4, nama: 'Express Cuci + Setrika',  harga: 20000, satuan: 'kg',    estimasi_hari: 1, deskripsi: 'Cuci, kering, dan setrika kilat 1 hari',       aktif: true },
    { kategori_id: 5, nama: 'Cuci Selimut',            harga: 25000, satuan: 'item',  estimasi_hari: 3, deskripsi: 'Cuci selimut per item',                        aktif: true },
    { kategori_id: 5, nama: 'Cuci Gordyn',             harga: 15000, satuan: 'meter', estimasi_hari: 3, deskripsi: 'Cuci gordyn per meter',                        aktif: true },
    { kategori_id: 5, nama: 'Cuci Sepatu',             harga: 20000, satuan: 'pasang',estimasi_hari: 2, deskripsi: 'Cuci sepatu per pasang',                       aktif: true },
    { kategori_id: 5, nama: 'Cuci Tas',                harga: 30000, satuan: 'item',  estimasi_hari: 3, deskripsi: 'Cuci tas per item',                            aktif: true },
    { kategori_id: 5, nama: 'Cuci Jas / Blazer',       harga: 35000, satuan: 'item',  estimasi_hari: 3, deskripsi: 'Cuci jas atau blazer per item',                aktif: true },
    { kategori_id: 5, nama: 'Premium Wash',            harga: 18000, satuan: 'kg',    estimasi_hari: 2, deskripsi: 'Cuci premium dengan pewangi spesial',           aktif: true },
    { kategori_id: 5, nama: 'Dry Clean',               harga: 40000, satuan: 'item',  estimasi_hari: 3, deskripsi: 'Dry cleaning untuk pakaian spesial / sensitif', aktif: true }
  ]);

  // === PENGATURAN DEFAULT ===
  await knex('pengaturan').insert([
    { kunci: 'nama_toko',        nilai: 'Laundry Bersih',                                   deskripsi: 'Nama toko laundry' },
    { kunci: 'alamat_toko',      nilai: 'Jl. Kebersihan No. 1',                             deskripsi: 'Alamat lengkap toko' },
    { kunci: 'telepon_toko',     nilai: '08123456789',                                      deskripsi: 'Nomor telepon / WhatsApp toko' },
    { kunci: 'email_toko',       nilai: 'laundry@example.com',                              deskripsi: 'Email toko' },
    { kunci: 'poin_per_nominal', nilai: '10000',                                            deskripsi: 'Kelipatan nominal untuk dapat 1 poin (Rp10.000 = 1 poin)' },
    { kunci: 'nilai_tukar_poin', nilai: '100',                                              deskripsi: 'Nilai tukar poin ke rupiah (100 poin = Rp100 diskon)' },
    { kunci: 'min_poin_redeem',  nilai: '100',                                              deskripsi: 'Minimum poin yang bisa ditukar' },
    { kunci: 'wa_api_url',       nilai: '',                                                 deskripsi: 'URL API WhatsApp Gateway (kosongkan jika tidak dipakai)' },
    { kunci: 'wa_api_key',       nilai: '',                                                 deskripsi: 'API Key WhatsApp Gateway' },
    { kunci: 'wa_notif_aktif',   nilai: 'false',                                            deskripsi: 'Aktifkan notifikasi WhatsApp otomatis (true/false)' },
    { kunci: 'logo_toko',        nilai: '',                                                 deskripsi: 'Path / URL logo toko' },
    { kunci: 'footer_struk',     nilai: 'Terima kasih telah menggunakan layanan kami!',     deskripsi: 'Teks footer pada struk transaksi' },
    { kunci: 'wa_mode',          nilai: 'regular',                                          deskripsi: 'Mode WhatsApp default (regular/business)' }
  ]);

  console.log('✓ Seed selesai: 1 admin, 5 kategori, 13 layanan, 13 pengaturan');
};
