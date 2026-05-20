module.exports = {
  apps: [
    {
      name: 'pos-laundry',
      script: 'server.js',
      cwd: __dirname,

      // restart on crash, limit to avoid infinite restart loop
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      // environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // logging
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // rotate logs daily (requires pm2-logrotate)
      max_size: '10M',
    },
  ],
};
