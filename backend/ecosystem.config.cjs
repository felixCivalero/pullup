// PM2 process definition for the pullup.se API on pullup-ec2.
//
// Usage on the box (cwd = backend/):
//   pm2 start ecosystem.config.cjs   # start/refresh
//   pm2 save                         # persist across reboots
//
// Env: loaded from backend/.env via dotenv at startup — no secrets here.

module.exports = {
  apps: [
    {
      name: "pullup-api",
      script: "npm",
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      time: true,
    },
  ],
};
