// FILE: ecosystem.config.js
/**
 * Enterprise PM2 Ecosystem Configuration
 * --------------------------------------
 * Manages:
 *  - Express API Server
 *  - Token Scanner Engine
 *  - Telegram Bot
 *
 * Features:
 *  - Automatic restart on crash
 *  - Memory leak protection
 *  - Timestamped logs
 *  - Optional multi-instance scaling
 *  - Clean log separation for each service
 */

export default {
  apps: [
    // ================================================================
    // API SERVER (Express)
    // ================================================================
    {
      name: "quantum-api",
      script: "api/server.js",
      interpreter: "node",
      instances: 1,                // Can be increased to CPU count
      exec_mode: "fork",           // "cluster" optional for scaling
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5000,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "350M",
      kill_timeout: 4000,
      listen_timeout: 5000,
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
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        SCANNER_INTERVAL: process.env.SCANNER_INTERVAL || 1500, // ms
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "500M", // scanners use more RAM
      kill_timeout: 4000,
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
      interpreter: "node",
      instances: 1,  // NEVER run multiple Telegram bot instances
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: "250M",
      kill_timeout: 3000,
      out_file: "./logs/bot.out.log",
      error_file: "./logs/bot.err.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
