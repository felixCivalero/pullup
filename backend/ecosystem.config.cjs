// PM2 process definitions for the PullUp backend.
//
// This file is the in-repo, reproducible source of truth for what runs on
// pullup-ec2. Until now both processes were started by hand on the box, so a
// fresh box / restart had no repeatable launch — and the email outbox worker
// (the fallback rail for every send while WhatsApp is Meta-gated) would
// silently sit undrained if nobody remembered to start it.
//
// Usage on the box (cwd = backend/):
//   pm2 start ecosystem.config.cjs        # start/refresh both processes
//   pm2 restart ecosystem.config.cjs      # after a deploy
//   pm2 save                              # persist across reboots
//
// Env: both processes load backend/.env via dotenv at startup, so no secrets
// are injected here. Names match the existing prod processes (pullup-api,
// pullup-email-worker) so this reconciles with what's already running.

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
    {
      // Drains email_outbox: claims queued rows and sends them via the active
      // provider. The runner loops forever with idle/error backoff (it does
      // NOT process.exit on transient Supabase/Cloudflare blips), so PM2 only
      // needs to keep it alive across reboots / genuine startup failures.
      name: "pullup-email-worker",
      script: "src/email/outbox/outboxWorkerRunner.js",
      cwd: __dirname,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      time: true,
    },
  ],
};
