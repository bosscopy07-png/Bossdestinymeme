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
process.on('unhandledRejection', (reason, p) => {
  logger.error('💥 Unhandled Promise Rejection:', reason);
});

// ---------------------------
// 🚀 Main Boot Function
// ---------------------------
async function main() {
  try {
    logger.info('Starting Memecoin Scanner (combined Dexscreener + on-chain)');

    // --- Render: force polling to prevent EADDRINUSE ---
    if (process.env.RENDER === 'true') {
      logger.info('Running on Render — forcing Telegram polling mode to avoid webhook port conflicts.');
      process.env._FORCE_POLLING = 'true';
    }

    // --- Initialize Telegram Bot ---
    const tg = await initTelegram();

    // --- Start Scanner (real-time + Dexscreener) ---
    await startScanner(tg, logger);

    // --- Keep-alive Express server ---
    const app = express();
    const PORT = parseInt(process.env.PORT || '10000', 10);

    app.get('/', (req, res) => res.send('🚀 Boss Destiny Memecoin Scanner is Live ✅'));
    app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

    app.get('/dashboard', (req, res) => {
      try {
        const db = require('./papertrader').load();
        res.json({ ok: true, balance: db.balance, recent: db.trades.slice(-20) });
      } catch (e) {
        res.json({ ok: false, err: e.message });
      }
    });

    // Avoid double port listen conflict
    const server = app.listen(PORT, () =>
      logger.info(`🌐 Express Keep-Alive Server Listening on port ${PORT}`)
    );

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn('⚠️ Port already in use — skipping duplicate Express listen (Render conflict).');
      } else {
        logger.error('Server error:', err);
      }
    });

    // --- Telegram startup confirmation message ---
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
    logger.error('❌ Fatal error in main()', err.stack || err.message || err);
    process.exit(1);
  }
}

// ---------------------------
// 🔥 Start App
// ---------------------------
main();
