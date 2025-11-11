// src/index.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const winston = require('winston');

const { initTelegram } = require('./telegram');
const { startScanner } = require('./scanner');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [new winston.transports.Console({ format: winston.format.simple() })]
});

async function main() {
  try {
    logger.info('Starting Memecoin Scanner (combined Dexscreener + on-chain)');

    // --- Render & Polling safety ---
    // On Render we force polling so the bot won't attempt to start a webhook server
    // which previously caused EADDRINUSE when Express also listened on the same port.
    if (process.env.RENDER === 'true') {
      logger.info('Running on Render — forcing Telegram polling mode to avoid webhook port conflicts.');
      // if your telegram module checks process.env.RENDER, set it to 'false' while launching
      // so bot.launch() will use polling. We still keep RENDER env for other parts of app.
      process.env._FORCE_POLLING = 'true'; // internal flag for clarity
    }

    // Initialize Telegram (initTelegram should be written to use polling unless webhook explicitly configured)
    // If your telegram.js checks process.env.RENDER to launch webhook, ensure it respects _FORCE_POLLING.
    const tg = await initTelegram();

    // Start scanner (will use Dexscreener polling and optional on-chain WS if configured)
    await startScanner(tg, logger);

    // Start Express keep-alive + dashboard once (avoid duplicate listen calls)
    const app = express();
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

    app.get('/', (req, res) => res.send('Memecoin Scanner Full - running'));
    app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
    app.get('/dashboard', (req, res) => {
      try {
        const db = require('./papertrader').load();
        res.json({ ok: true, balance: db.balance, recent: db.trades.slice(-20) });
      } catch (e) {
        res.json({ ok: false, err: e.message });
      }
    });

    app.listen(PORT, () => logger.info(`HTTP server listening ${PORT}`));

    // Send a startup message to your Telegram chat (best-effort)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: chatId,
          text: `🚀 Bot deployed successfully and is now live! (${new Date().toLocaleString()})`
        }, { timeout: 5000 });
        logger.info('Startup confirmation message sent to Telegram.');
      } catch (err) {
        logger.warn('Could not send startup Telegram message:', err.message || err.toString());
      }
    } else {
      logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — skipping startup confirmation message.');
    }

    // process stays running because scanner uses intervals / websocket events
  } catch (err) {
    logger.error('Fatal error in main()', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

process.on('unhandledRejection', (r) => logger.error('Unhandled Rejection', r));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err && (err.stack || err.message || err));
  process.exit(1);
});

main();
