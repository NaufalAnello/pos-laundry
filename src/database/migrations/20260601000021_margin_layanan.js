exports.up = async (knex) => {
  const hasHpp = await knex.schema.hasColumn('layanan', 'hpp');
  if (!hasHpp) {
    await knex.schema.alterTable('layanan', t => {
      t.decimal('hpp', 10, 2).defaultTo(0);
    });
  }

  const hasMargin = await knex.schema.hasColumn('layanan', 'margin_persen');
  if (!hasMargin) {
    await knex.schema.alterTable('layanan', t => {
      t.decimal('margin_persen', 5, 2).defaultTo(0);
    });
  }

  const hasHargaAuto = await knex.schema.hasColumn('layanan', 'harga_auto');
  if (!hasHargaAuto) {
    await knex.schema.alterTable('layanan', t => {
      t.integer('harga_auto').defaultTo(0); // 0=manual, 1=harga otomatis dari hpp+margin
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.alterTable('layanan', t => {
    t.dropColumn('hpp');
    t.dropColumn('margin_persen');
    t.dropColumn('harga_auto');
  });
};
