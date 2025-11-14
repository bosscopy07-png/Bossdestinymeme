// FILE: index.js
require('dotenv').config();

const { scanNewTokens } = require('./core/scanner');
const { bot } = require('./bot');
const pino = require('pino');

const logger = pino({
  name: 'App',
  level: process.env.LOG_LEVEL || 'info',
});

(async () => {
  try {
    // Start Telegram bot
    await bot.launch();
    logger.info('⚡ Telegram Bot Running...');

    // Start scanner
    scanNewTokens();
    logger.info('🐉 Hyper Beast Scanner — Phase 2 Active...');
  } catch (err) {
    logger.error({ err }, 'Failed to start application');
    process.exit(1);
  }
})();
