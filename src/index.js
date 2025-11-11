// src/index.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const winston = require('winston');
const { initTelegram } = require('./telegram');
const { startScanner } = require('./scanner');

// ---------------------------
// 🧠 Logger Configuration
// ---------------------------
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

// ---------------------------
// 🚨 Global Crash Protection
// ---------------------------
process.on('uncaughtException', (err) => {
  logger.error('💥 Uncaught Exception:', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('💥 Unhandled Promise Rejection:', reason);
});

// ---------------------------
// 🚀 Main Boot Function
// ---------------------------
async function main() {
  try {
    logger.info('Starting Memecoin Scanner (combined DexScreener + on-chain)');

    // --- Render environment adjustment ---
    if (process.env.RENDER === 'true') {
      logger.info('Running on Render — forcing Telegram polling mode to avoid webhook port conflicts.');
      process.env._FORCE_POLLING = 'true';
    }

    // --- Initialize Telegram bot ---
    logger.info('🧩 Initializing Telegram bot...');
    const tg = await initTelegram();
    logger.info('✅ Telegram bot initialized successfully.');

    // --- Start Hybrid Scanner ---
    logger.info('🔍 Launching hybrid scanner (DexScreener + on-chain)...');
    await startScanner(tg, logger);
    logger.info('✅ Scanner launched successfully.');

    // --- Express keep-alive server ---
    const app = express();
    const PORT = parseInt(process.env.PORT || '10000', 10);

    app.get('/', (req, res) => res.send('🚀 Boss Destiny Memecoin Scanner is Live ✅'));
    app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

    const server = app.listen(PORT, () => {
      logger.info(`🌐 Express Keep-Alive Server Listening on port ${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn('⚠️ Port already in use — skipping duplicate Express listen (Render conflict).');
      } else {
        logger.error('Server error:', err);
      }
    });

    // --- Telegram startup confirmation ---
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
        logger.warn('⚠️ Could not send startup message:', err.message || err.toString());
      }
    } else {
      logger.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — skipping Telegram confirmation.');
    }

  } catch (err) {
    logger.error('❌ Fatal error in main():', err.stack || err.message || err);
    console.error('Detailed main() crash info:', err);
    // Give Render time to flush logs before exit
    await new Promise(r => setTimeout(r, 3000));
    process.exit(1);
  }
}

// ---------------------------
// 🔥 Start App
// ---------------------------
main();
