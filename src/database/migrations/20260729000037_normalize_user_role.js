// Normalisasi role user ke sistem RBAC dua-role: owner + karyawan.
// - Sebelumnya: 'admin' / 'kasir' / 'operator' (default 'kasir').
// - Sekarang:   'owner' (full access) / 'karyawan' (operasional harian).
// Migration idempoten — aman dijalankan berulang.
exports.up = async function (knex) {
  // Kolom `role` sudah ada dari migration create_users. Cek defensif:
  const hasRole = await knex.schema.hasColumn('users', 'role');
  if (!hasRole) {
    await knex.schema.table('users', (table) => {
      table.string('role', 20).notNullable().defaultTo('karyawan');
    });
  }

  // Normalisasi nilai existing:
  //   'admin' → 'owner'    (Naufal / user pertama tetap punya akses penuh)
  //   sisanya → 'karyawan'
  await knex('users').where('role', 'admin').update({ role: 'owner' });
  await knex('users').whereNotIn('role', ['owner', 'karyawan']).update({ role: 'karyawan' });

  // Safety net — jika sampai di sini belum ada owner sama sekali,
  // promote user id=1 supaya tidak ada yang ter-lock dari sistem.
  const ownerCount = await knex('users').where('role', 'owner').count('id as c').first();
  if (!Number(ownerCount?.c)) {
    const first = await knex('users').orderBy('id', 'asc').first();
    if (first) await knex('users').where({ id: first.id }).update({ role: 'owner' });
  }
};

exports.down = async function (knex) {
  // Rollback: owner → admin, karyawan → kasir
  await knex('users').where('role', 'owner').update({ role: 'admin' });
  await knex('users').where('role', 'karyawan').update({ role: 'kasir' });
};
