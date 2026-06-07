/**
 * Migration untuk menambahkan konfigurasi AI Assistant
 */
exports.up = function(knex) {
  return knex.schema.table('pengaturan', (table) => {
    table.boolean('ai_enabled').defaultTo(false);
    table.text('deepseek_api_key').nullable();
    table.text('ai_insight_cache').nullable();
    table.datetime('ai_insight_cache_time').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('pengaturan', (table) => {
    table.dropColumn('ai_enabled');
    table.dropColumn('deepseek_api_key');
    table.dropColumn('ai_insight_cache');
    table.dropColumn('ai_insight_cache_time');
  });
};
