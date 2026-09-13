module.exports = {
  apps: [{
    name: 'ship24go',
    cwd: __dirname,
    script: 'dist/server.cjs',
    interpreter: 'node',
    autorestart: true,
    watch: false,
    max_memory_restart: '800M',
    env: { NODE_ENV: 'production', PORT: '3000' }
  }]
};
