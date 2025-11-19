/**
 * Enterprise PM2 Ecosystem Configuration (CommonJS Version)
 */

module.exports = {
  apps: [
    // ================================================================
    // API SERVER (Express)
    // ================================================================
    {
      name: "quantum-api",
      script: "api/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5000,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "350M",
      out_file: "./logs/api.out.log",
      error_file: "./logs/api.err.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },

    // ================================================================
    // TOKEN SCANNER ENGINE
    // ================================================================
    {
      name: "quantum-scanner",
      script: "scanner/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        SCANNER_INTERVAL: process.env.SCANNER_INTERVAL || 1500,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "500M",
      out_file: "./logs/scanner.out.log",
      error_file: "./logs/scanner.err.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },

    // ================================================================
    // TELEGRAM BOT
    // ================================================================
    {
      name: "quantum-bot",
      script: "telegram/bot.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
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
