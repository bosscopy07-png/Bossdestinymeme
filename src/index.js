// src/index.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const winston = require('winston');
const { initTelegram, startHybridScanner } = require('./telegram');
const { startScanner } = require('./scanner'); // if still needed for extra scanner

// ---------------------------
// 🧠 Logger Configuration
// ---------------------------
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
      )
    })
  ]
});

// ---------------------------
// 🚨 Global Crash Protection
// ---------------------------
process.on('uncaughtException', (err) => {
  logger.error(`💥 Uncaught Exception: ${err.stack || err.message || err}`);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`💥 Unhandled Promise Rejection: ${reason}`);
});

// ---------------------------
// 🚀 Main Boot Function
// ---------------------------
async function main() {
  try {
    logger.info('🚀 Starting Boss Destiny Memecoin Scanner (DexScreener + on-chain)');

    // --- Render Deployment Handling ---
    if (process.env.RENDER === 'true') {
      logger.info('⚙️ Running on Render — forcing Telegram polling mode to avoid webhook conflicts.');
      process.env._FORCE_POLLING = 'true';
    }

    // --- Initialize Telegram Bot ---
    logger.info('🧩 Initializing Telegram bot...');
    const tg = await initTelegram();
    logger.info('✅ Telegram bot initialized successfully.');

    // --- Launch Hybrid Scanner ---
    logger.info('🔍 Launching hybrid scanner (DexScreener + on-chain)...');
    await startHybridScanner(tg.sendSignal);
    logger.info('✅ Hybrid scanner launched successfully.');

    // --- Express Keep-Alive Server ---
    const app = express();
    const PORT = parseInt(process.env.PORT || '10000', 10);

    app.get('/', (req, res) => res.send('🚀 Boss Destiny Memecoin Scanner is Live ✅'));
    app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

    const server = app.listen(PORT, () => {
      logger.info(`🌐 Express Keep-Alive Server listening on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn('⚠️ Port already in use — skipping duplicate Express listen (Render conflict).');
      } else {
        logger.error('💥 Server error:', err);
      }
    });

    // --- Telegram Startup Confirmation ---
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: chatId,
          text: `🟢 Boss Destiny Scanner deployed successfully and is now live! (${new Date().toLocaleString()})`,
        });
        logger.info('📨 Startup confirmation message sent to Telegram.');
      } catch (err) {
        logger.warn(`⚠️ Could not send startup message: ${err.message || err.toString()}`);
      }
    } else {
      logger.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — skipping Telegram confirmation.');
    }

  } catch (err) {
    logger.error(`❌ Fatal error in main(): ${err.stack || err.message || err}`);
    console.error('Detailed main() crash info:', err);
    await new Promise((r) => setTimeout(r, 3000)); // allow logs to flush
    process.exit(1);
  }
}

// ---------------------------
// 🔥 Start App
// ---------------------------
main();
