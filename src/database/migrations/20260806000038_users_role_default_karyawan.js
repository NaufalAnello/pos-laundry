// Perbaiki DEFAULT kolom `users.role` ke 'karyawan' — sebelumnya masih
// 'kasir' dari migration create_users (2024). Migration 37 normalize
// DATA existing tapi tidak ALTER kolom, jadi row baru yang di-INSERT
// tanpa role field (mis. via raw SQL) tetap dapat 'kasir'.
//
// PENTING — impact security tanpa fix ini:
// RBAC TETAP AMAN karena middleware treat non-owner sebagai restrictive
// (kasir → dianggap non-owner → 403 di endpoint owner-only, persis seperti
// karyawan). Ini adalah issue KEBERSIHAN DATA, bukan celah keamanan.
//
// SQLite tidak support ALTER TABLE ... ALTER COLUMN DEFAULT langsung, dan
// pola recreate-table (backup → drop → recreate → restore) bermasalah dengan
// FK yang menunjuk ke users.id (kas.user_id, riwayat_poin.pelanggan_id via
// created_by, dst) — knex trx wrap tidak menghormati PRAGMA foreign_keys=OFF.
//
// Jadi migration ini HANYA mengulang normalisasi data (idempoten) untuk
// menangkap row 'kasir' baru yang mungkin masuk via SQL raw sejak migration 37.
// Alter default DDL diskip untuk hindari risiko FK; pertahanan utama:
//   - API/Joi: default schema = 'karyawan' → aman untuk semua POST /users
//   - Middleware: role !== 'owner' → 403 → 'kasir' otomatis restricted
//   - Frontend isOwner(): role === 'owner' → false untuk kasir
exports.up = async function (knex) {
  await knex('users').whereNotIn('role', ['owner', 'karyawan']).update({ role: 'karyawan' });
};

exports.down = async function () {
  // No-op — normalisasi data tidak bisa direverse dgn benar (info asli hilang).
};
