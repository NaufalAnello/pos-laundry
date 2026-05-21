exports.up = async (knex) => {
  // Rename wa_mode → wa_mode_default and set default to 'business'
  const existing = await knex('pengaturan').where({ kunci: 'wa_mode' }).first();
  if (existing) {
    const alreadyNew = await knex('pengaturan').where({ kunci: 'wa_mode_default' }).first();
    if (!alreadyNew) {
      await knex('pengaturan').insert({
        kunci:      'wa_mode_default',
        nilai:      existing.nilai === 'business' ? 'business' : 'business',
        deskripsi:  'Mode WhatsApp default (regular/business)',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    await knex('pengaturan').where({ kunci: 'wa_mode' }).delete();
  } else {
    const alreadyNew = await knex('pengaturan').where({ kunci: 'wa_mode_default' }).first();
    if (!alreadyNew) {
      await knex('pengaturan').insert({
        kunci:      'wa_mode_default',
        nilai:      'business',
        deskripsi:  'Mode WhatsApp default (regular/business)',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }
};

exports.down = async (knex) => {
  const row = await knex('pengaturan').where({ kunci: 'wa_mode_default' }).first();
  if (row) {
    const alreadyOld = await knex('pengaturan').where({ kunci: 'wa_mode' }).first();
    if (!alreadyOld) {
      await knex('pengaturan').insert({
        kunci:      'wa_mode',
        nilai:      row.nilai,
        deskripsi:  'Mode WhatsApp default (regular/business)',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    await knex('pengaturan').where({ kunci: 'wa_mode_default' }).delete();
  }
};
