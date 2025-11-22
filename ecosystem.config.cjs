// ecosystem.config.cjs
const dotenv = require('dotenv');
dotenv.config(); // Load .env automatically

module.exports = {
  apps: [
    {
      name: "quantum-api",
      script: "api/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        ...process.env, // Pass all env variables
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "350M",
      out_file: "./logs/api.out.log",
      error_file: "./logs/api.err.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "quantum-scanner",
      script: "scanner/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "500M",
      out_file: "./logs/scanner.out.log",
      error_file: "./logs/scanner.err.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "quantum-bot",
      script: "telegram/bot.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        ...process.env, // Pass all env variables including TELEGRAM_BOT_TOKEN
        NODE_ENV: "production",
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "250M",
      out_file: "./logs/bot.out.log",
      error_file: "./logs/bot.err.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
