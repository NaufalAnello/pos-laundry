exports.up = async (knex) => {
  await knex.schema.alterTable('layanan', t => {
    t.decimal('hpp', 10, 2).defaultTo(0);
    t.decimal('margin_persen', 5, 2).defaultTo(0);
    t.integer('harga_auto').defaultTo(0); // 0=manual, 1=harga otomatis dari hpp+margin
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('layanan', t => {
    t.dropColumn('hpp');
    t.dropColumn('margin_persen');
    t.dropColumn('harga_auto');
  });
};
