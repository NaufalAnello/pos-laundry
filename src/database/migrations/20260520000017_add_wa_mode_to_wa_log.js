exports.up = async function(knex) {
  const hasWaMode = await knex.schema.hasColumn('wa_log', 'wa_mode');
  if (!hasWaMode) {
    await knex.schema.alterTable('wa_log', function(table) {
      table.string('wa_mode', 20).defaultTo('regular');
    });
  }
};

exports.down = function(knex) {
  return knex.schema.alterTable('wa_log', function(table) {
    table.dropColumn('wa_mode');
  });
};
