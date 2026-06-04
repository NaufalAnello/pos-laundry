exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('kategori_layanan', function (table) {
    table.increments('id').primary();
    table.string('nama', 100).notNullable();
    table.text('deskripsi');
    table.boolean('aktif').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('kategori_layanan');
};
