// PM2 process file — keeps the app running and restarts it after a reboot.
//   pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'nikkilog',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
