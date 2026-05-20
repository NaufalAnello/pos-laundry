exports.up = function (knex) {
  return knex.schema.alterTable('wa_log', function (table) {
    table.string('wa_mode', 20).defaultTo('regular');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('wa_log', function (table) {
    table.dropColumn('wa_mode');
  });
};
