exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('master_item', function (table) {
    table.increments('id').primary();
    table.string('nama', 100).notNullable().unique();
    table.string('satuan', 20).defaultTo('pcs');
    table.integer('urutan').defaultTo(0);
    table.integer('aktif').defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  }).then(() => {
    // Seed data awal
    return knex('master_item').insert([
      { nama: 'Baju', satuan: 'pcs', urutan: 1 },
      { nama: 'Celana', satuan: 'pcs', urutan: 2 },
      { nama: 'Kaos', satuan: 'pcs', urutan: 3 },
      { nama: 'Jaket', satuan: 'pcs', urutan: 4 },
      { nama: 'Rok', satuan: 'pcs', urutan: 5 },
      { nama: 'Dress', satuan: 'pcs', urutan: 6 },
      { nama: 'Kemeja', satuan: 'pcs', urutan: 7 },
      { nama: 'Dasi', satuan: 'pcs', urutan: 8 },
      { nama: 'Kaos Kaki', satuan: 'pasang', urutan: 9 },
      { nama: 'Sarung', satuan: 'pcs', urutan: 10 },
      { nama: 'Mukena', satuan: 'pcs', urutan: 11 },
      { nama: 'Sajadah', satuan: 'pcs', urutan: 12 },
      { nama: 'Handuk', satuan: 'pcs', urutan: 13 },
      { nama: 'Selimut', satuan: 'pcs', urutan: 14 },
      { nama: 'Sprei', satuan: 'set', urutan: 15 },
      { nama: 'Bantal', satuan: 'pcs', urutan: 16 },
      { nama: 'Guling', satuan: 'pcs', urutan: 17 }
    ]);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('master_item');
};
