require('dotenv').config();

const baseConfig = {
  client: 'better-sqlite3',
  connection: {
    filename: process.env.DB_PATH || './data/laundry.db'
  },
  useNullAsDefault: true,
  migrations: {
    directory: './src/database/migrations'
  },
  seeds: {
    directory: './src/database/seeds'
  },
  pool: {
    afterCreate: (conn, done) => {
      conn.pragma('foreign_keys = ON');
      done(null, conn);
    }
  }
};

module.exports = {
  development: baseConfig,
  production: baseConfig
};
