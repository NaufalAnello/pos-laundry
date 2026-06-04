exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('layanan', function (table) {
    table.increments('id').primary();
    table.integer('kategori_id').unsigned()
      .references('id').inTable('kategori_layanan').onDelete('SET NULL');
    table.string('nama', 100).notNullable();
    table.decimal('harga', 12, 2).notNullable();
    table.string('satuan', 20).defaultTo('kg'); // kg, item, pcs, pasang, meter
    table.integer('estimasi_hari').defaultTo(2);
    table.text('deskripsi');
    table.boolean('aktif').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('layanan');
};
