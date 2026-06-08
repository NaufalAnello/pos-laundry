exports.up = function (knex) {
  return knex.schema.createTableIfNotExists('detail_item_layanan', function (table) {
    table.increments('id').primary();
    table.integer('detail_transaksi_id').unsigned().notNullable()
      .references('id').inTable('detail_transaksi').onDelete('CASCADE');
    table.string('nama_item', 100).notNullable();
    table.integer('jumlah').defaultTo(1);
    table.string('satuan', 20).defaultTo('pcs');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('detail_item_layanan');
};
